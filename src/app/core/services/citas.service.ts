import { Injectable, NgZone, inject } from '@angular/core';
import {
  DocumentReference, Firestore, Transaction, collection, deleteField, doc, getDocs, query, runTransaction, updateDoc, where,
} from '@angular/fire/firestore';
import { Observable, catchError, combineLatest, map, of, shareReplay } from 'rxjs';
import { BARBERO_CUALQUIERA, CUPOS_POR_DIA, Cita, EstadoCita, NuevaCita, RESERVAS_POR_DIA, esActiva } from '../models/cita.model';
import { escuchar } from '../utils/firestore';
import { esCelularValido, limpiarCelular } from '../utils/colombia';
import {
  diaDeCita, duracionDe, fechaDesdeClave, formatearHora12, minutosAHora24, minutosDeCita, normalizarEstado, parsearHora,
} from '../utils/horario';
import {
  CITA, LIBRE, MARCA, MotivoBloqueo, Ocupacion, abrir, cerrar, estaLibreEn, idOcupacion, liberar, ocupar, tramo,
} from '../utils/ocupacion';
import { OcupacionService } from './ocupacion.service';

export { MOTIVOS_BLOQUEO } from '../utils/ocupacion';
export type { MotivoBloqueo } from '../utils/ocupacion';

/** El horario ya está tomado: otra cita o un cierre del barbero ocupa parte de ese rato. */
export class HorarioNoDisponibleError extends Error {
  constructor() {
    super('El horario seleccionado ya no está disponible.');
  }
}

/** El cliente ya tiene el máximo de reservas activas para ese día. */
export class CupoAgotadoError extends Error {
  constructor() {
    super(`Ya tienes ${RESERVAS_POR_DIA} reservas para ese día.`);
  }
}

/** Ese día aún no tiene su documento de ocupación (lo preparan el panel del admin y la Cloud Function cada noche). */
export class DiaNoPreparadoError extends Error {
  constructor() {
    super('Ese día aún no está listo en la agenda.');
  }
}

interface DiaLeido {
  ref: DocumentReference;
  datos: Ocupacion | null;
}

/** Dónde está una cita en la agenda: su id, su barbero y su día. */
interface LugarDeCita {
  id: string;
  barberoId: string;
  dia: string;
}

/**
 * Citas y ocupación de la agenda. Cada reserva, cambio o cancelación es una transacción que escribe la cita y el
 * mapa del día del barbero (`ocupacion/{barberoId}_{dia}`, ver utils/ocupacion.ts) juntos: o pasan las dos cosas o
 * ninguna. Las reglas revisan que el rato estuviera libre, así que no hay doble reserva aunque dos clientes
 * confirmen al mismo tiempo (al segundo la transacción se le repite con el mapa nuevo, y ya no está libre).
 */
@Injectable({ providedIn: 'root' })
export class CitasService {
  private firestore = inject(Firestore);
  private zone = inject(NgZone);
  private ocupacion = inject(OcupacionService);
  private citasRef = collection(this.firestore, 'citas');
  private cuposRef = collection(this.firestore, 'cupos');
  private ocupacionRef = collection(this.firestore, 'ocupacion');

  /**
   * Citas creadas desde este navegador (reservas, citas del panel, cambios de horario). El aviso de "Nueva reserva"
   * del panel no las anuncia: quien la acaba de crear ya lo sabe (y el aviso taparía el de "Cita agendada").
   */
  readonly creadasAqui = new Set<string>();

  private readonly todas$ = this.escucharCitas(this.citasRef).pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  private readonly noAsistieron$ = this.escucharCitas(query(this.citasRef, where('estado', '==', 'no-asistio'))).pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  // --- Lecturas ---

  /** Todas las citas. Solo para staff (las reglas lo exigen). */
  todas(): Observable<Cita[]> {
    return this.todas$;
  }

  deUsuario(uid: string): Observable<Cita[]> {
    return this.escucharCitas(query(this.citasRef, where('userId', '==', uid)));
  }

  /**
   * Todas las citas de un cliente: las que reservó con su cuenta y las que el equipo le registró sin cuenta (desde el
   * panel, el barbero o una agenda recurrente) con el celular con que entró por SMS o con su correo verificado. Solo
   * lo verificado: las reglas no dejan leer por un celular escrito a mano en el perfil (ver esDeSuContacto).
   * Si una de las búsquedas falla (p. ej. con reglas viejas), se muestran las demás.
   */
  delCliente(cuenta: { uid: string; phoneNumber?: string | null; email?: string | null; emailVerified?: boolean }): Observable<Cita[]> {
    const sinCuenta = (campo: 'phone' | 'userEmail', valor: string) =>
      this.escucharCitas(query(this.citasRef, where('userId', '==', ''), where(campo, '==', valor))).pipe(
        catchError(error => {
          console.error('No se pudieron leer las citas registradas con tu ' + (campo === 'phone' ? 'celular' : 'correo'), error);
          return of<Cita[]>([]);
        }),
      );
    const fuentes = [this.deUsuario(cuenta.uid)];
    const celular = limpiarCelular(cuenta.phoneNumber ?? '');
    if (esCelularValido(celular)) fuentes.push(sinCuenta('phone', celular));
    if (cuenta.email && cuenta.emailVerified) fuentes.push(sinCuenta('userEmail', cuenta.email.toLowerCase()));
    return combineLatest(fuentes).pipe(
      map(listas => [...new Map(listas.flat().map(c => [c.id, c] as const)).values()]),
    );
  }

  /** Citas de uno o varios barberos (máx. 30 IDs por consulta 'in'). */
  deBarberos(ids: string[]): Observable<Cita[]> {
    return this.escucharCitas(query(this.citasRef, where('barberoId', 'in', ids.slice(0, 30))));
  }

  /**
   * Las citas marcadas "No asistió", de todos los barberos (pocas): con ellas el barbero ve la carita de un cliente
   * aunque haya faltado con otro (ver utils/asistencia.ts). Solo para staff.
   */
  noAsistieron(): Observable<Cita[]> {
    return this.noAsistieron$;
  }

  creadasDesde(isoFecha: string): Observable<Cita[]> {
    return this.escucharCitas(query(this.citasRef, where('creadoEn', '>', isoFecha)));
  }

  // --- Escrituras ---

  /** La reserva del cliente: la cita, su rato en el mapa del barbero y su cupo del día, en una transacción. */
  async reservar(datos: NuevaCita): Promise<Cita> {
    const cupoId = await this.cupoLibre(datos.userId, datos.dia);
    const ref = doc(this.citasRef);
    const cita = this.nuevaCita(datos, cupoId);
    this.creadasAqui.add(ref.id);
    await this.ejecutar(async tx => {
      const dia = await this.leerDia(tx, datos.barberoId, datos.dia);
      const [k, n] = this.tramoDe(datos);
      if (!dia.datos || !estaLibreEn(dia.datos.mapa, k * MARCA, n * MARCA)) throw new HorarioNoDisponibleError();
      tx.set(ref, cita);
      tx.update(dia.ref, { mapa: ocupar(dia.datos.mapa, k, n), [`citas.${ref.id}`]: [k, n], op: { tipo: 'citas', ocupa: ref.id } });
      tx.set(doc(this.cuposRef, cupoId), { userId: datos.userId, dia: datos.dia, citaId: ref.id });
    });
    return { ...cita, id: ref.id };
  }

  /**
   * Cita que el admin registra desde el panel (la pidieron por WhatsApp, por teléfono o en el local). No es de
   * ninguna cuenta (`userId` vacío) ni gasta cupo de cliente, pero ocupa su rato igual que una reserva.
   */
  async registrarDesdePanel(datos: NuevaCita): Promise<Cita> {
    await this.ocupacion.asegurarDia(datos.barberoId, datos.dia);
    return this.apartarDesdePanel(datos, this.nuevaCita({ ...datos, userId: '' }), 'admin');
  }

  /**
   * Cita que un barbero se agenda desde su panel: como la del admin, pero sin correo del cliente y marcada
   * `origen: 'barbero'` (las reglas solo se la dejan con su propio perfil y a él no le llega correo de su propia
   * cita). El día ya debe estar preparado: los crean el panel del admin y la función de cada noche.
   */
  async registrarDelBarbero(datos: NuevaCita): Promise<Cita> {
    const cita: Cita = { ...this.nuevaCita({ ...datos, userId: '', userEmail: '' }), origen: 'barbero' };
    return this.apartarDesdePanel(datos, cita, 'citas');
  }

  private async apartarDesdePanel(datos: NuevaCita, cita: Cita, tipo: 'admin' | 'citas'): Promise<Cita> {
    const ref = doc(this.citasRef);
    this.creadasAqui.add(ref.id);
    await this.ejecutar(async tx => {
      const dia = await this.leerDia(tx, datos.barberoId, datos.dia);
      if (!dia.datos) throw new DiaNoPreparadoError();
      const [k, n] = this.tramoDe(datos);
      if (!estaLibreEn(dia.datos.mapa, k * MARCA, n * MARCA)) throw new HorarioNoDisponibleError();
      tx.set(ref, cita);
      tx.update(dia.ref, { mapa: ocupar(dia.datos.mapa, k, n), [`citas.${ref.id}`]: [k, n], op: tipo === 'admin' ? { tipo } : { tipo, ocupa: ref.id } });
    });
    return { ...cita, id: ref.id };
  }

  /**
   * Cambia una cita del cliente a otro día u hora: cancela la anterior (soltando su rato) y crea la nueva en una
   * sola transacción. La nueva anota a cuál reemplaza, y así llega un solo correo de "cambió de horario".
   */
  async reagendar(anterior: Cita, datos: NuevaCita): Promise<Cita> {
    const cupoId = await this.cupoLibre(datos.userId, datos.dia, anterior);
    const ref = doc(this.citasRef);
    const cita = this.nuevaCita(datos, cupoId, anterior.id);
    this.creadasAqui.add(ref.id);
    await this.ejecutar(async tx => {
      await this.moverRato(tx,
        { id: anterior.id!, barberoId: anterior.barberoId, dia: diaDeCita(anterior) },
        { id: ref.id, barberoId: datos.barberoId, dia: datos.dia }, this.tramoDe(datos), 'citas');
      tx.update(doc(this.citasRef, anterior.id!), { estado: 'cancelada', reemplazadaPor: ref.id });
      tx.set(ref, cita);
      if (anterior.cupoId) tx.delete(doc(this.cuposRef, anterior.cupoId));
      tx.set(doc(this.cuposRef, cupoId), { userId: datos.userId, dia: datos.dia, citaId: ref.id });
    });
    return { ...cita, id: ref.id };
  }

  /** Marca la cita como cancelada y suelta su rato en la agenda y su cupo. */
  async cancelar(cita: Cita): Promise<void> {
    await this.ejecutar(async tx => {
      const dia = await this.leerDia(tx, cita.barberoId, diaDeCita(cita));
      const suyo = dia.datos?.citas?.[cita.id!];
      tx.update(doc(this.citasRef, cita.id!), { estado: 'cancelada' });
      if (dia.datos && suyo) {
        tx.update(dia.ref, { mapa: liberar(dia.datos.mapa, suyo[0], suyo[1]), [`citas.${cita.id}`]: deleteField(), op: { tipo: 'citas', libera: cita.id } });
      }
      if (cita.cupoId) tx.delete(doc(this.cuposRef, cita.cupoId));
    }, false);
  }

  /**
   * Marca el corte como hecho con el valor que se cobró (para las ganancias del barbero) y, si el cliente debía una
   * multa y la pagó, cuánto (va aparte: no cuenta en lo del barbero). Si era un "No asistió" marcado por error, su
   * multa se quita.
   */
  async completar(cita: Cita, precioFinal: number, multaCobrada = 0): Promise<void> {
    const cobrada = Math.max(0, Math.round(multaCobrada));
    await updateDoc(doc(this.citasRef, cita.id!), {
      estado: 'completada',
      precioFinal: Math.max(0, Math.round(precioFinal)),
      multaCobrada: cobrada > 0 ? cobrada : deleteField(),
      ...(cita.multa ? { multa: deleteField() } : {}),
    });
  }

  /** "No asistió", con la multa que se le pone (0: sin multa). Se cobra en su siguiente visita. */
  async marcarNoAsistio(cita: Cita, multa = 0): Promise<void> {
    const valor = Math.max(0, Math.round(multa));
    await updateDoc(doc(this.citasRef, cita.id!), { estado: 'no-asistio', multa: valor > 0 ? valor : deleteField() });
  }

  /** Perdonar la multa de una cita "No asistió". */
  async quitarMulta(cita: Cita): Promise<void> {
    await updateDoc(doc(this.citasRef, cita.id!), { multa: deleteField() });
  }

  async cambiarEstado(cita: Cita, estado: EstadoCita): Promise<void> {
    if (estado === 'cancelada') return this.cancelar(cita);
    await updateDoc(doc(this.citasRef, cita.id!), { estado });
  }

  /** Edición desde el panel de admin. Si cambia el día o la hora de una cita activa, mueve su rato en la agenda. */
  async actualizar(cita: Cita, cambios: { userName: string; phone: string; dia: string; minutos: number }): Promise<void> {
    const diaAntes = diaDeCita(cita);
    // Las citas de "cualquiera" (de antes de que hubiera barberos) no están en ninguna agenda: solo cambian sus datos.
    const seMueve = esActiva(cita.estado) && cita.barberoId !== BARBERO_CUALQUIERA
      && (cambios.dia !== diaAntes || cambios.minutos !== minutosDeCita(cita));
    if (seMueve) await this.ocupacion.asegurarDia(cita.barberoId, cambios.dia);
    await this.ejecutar(async tx => {
      if (seMueve) {
        const lugar = { id: cita.id!, barberoId: cita.barberoId, dia: diaAntes };
        await this.moverRato(tx, lugar, { ...lugar, dia: cambios.dia }, tramo(cambios.minutos, duracionDe(cita)), 'admin');
      }
      tx.update(doc(this.citasRef, cita.id!), {
        userName: cambios.userName,
        // En 10 dígitos, como lo guardan las demás: así el cliente la ve en "Mis reservas" si entra con ese celular.
        phone: esCelularValido(cambios.phone) ? limpiarCelular(cambios.phone) : cambios.phone.trim(),
        dia: cambios.dia,
        hora: minutosAHora24(cambios.minutos),
        horaStr: formatearHora12(cambios.minutos),
        fecha: fechaDesdeClave(cambios.dia, cambios.minutos).toISOString(),
      });
    });
  }

  /** Borrado físico (solo admin): suelta su rato y su cupo. */
  async eliminar(cita: Cita): Promise<void> {
    await this.ejecutar(async tx => {
      const dia = await this.leerDia(tx, cita.barberoId, diaDeCita(cita));
      const suyo = dia.datos?.citas?.[cita.id!];
      if (dia.datos && suyo) {
        tx.update(dia.ref, { mapa: liberar(dia.datos.mapa, suyo[0], suyo[1]), [`citas.${cita.id}`]: deleteField(), op: { tipo: 'admin' } });
      }
      if (cita.cupoId) tx.delete(doc(this.cuposRef, cita.cupoId));
      tx.delete(doc(this.citasRef, cita.id!));
    }, false);
  }

  // --- Cierres de agenda (el barbero cierra horas en las que no atiende) ---

  /**
   * Cierra lo que esté libre entre `desde` y `hasta` (minutos) ese día. Las citas que ya hay se quedan.
   * Devuelve cuántos minutos cerró y cuántos ya tenían una cita.
   */
  async bloquear(opciones: { barberoId: string; dia: string; desde: number; hasta: number; motivo: MotivoBloqueo | '' }): Promise<{ cerrados: number; ocupados: number }> {
    const { barberoId, dia, motivo } = opciones;
    const desde = Math.floor(opciones.desde / MARCA);
    const hasta = Math.ceil(opciones.hasta / MARCA);
    return this.ejecutar(async tx => {
      const leido = await this.leerDia(tx, barberoId, dia);
      if (!leido.datos) throw new DiaNoPreparadoError();
      const rato = leido.datos.mapa.slice(desde, hasta);
      const cerrados = [...rato].filter(m => m === LIBRE).length * MARCA;
      const ocupados = [...rato].filter(m => m === CITA).length * MARCA;
      if (cerrados > 0) {
        tx.update(leido.ref, { mapa: cerrar(leido.datos.mapa, desde, hasta, motivo), op: { tipo: 'cierra', desde, hasta, motivo } });
      }
      return { cerrados, ocupados };
    }, false);
  }

  /** Vuelve a abrir lo cerrado ese día entre `desde` y `hasta` (minutos; por defecto, el día entero). */
  async desbloquear(barberoId: string, dia: string, desdeMin = 0, hastaMin = 1440): Promise<void> {
    const desde = Math.floor(desdeMin / MARCA);
    const hasta = Math.ceil(hastaMin / MARCA);
    await this.ejecutar(async tx => {
      const leido = await this.leerDia(tx, barberoId, dia);
      if (!leido.datos) return;
      tx.update(leido.ref, { mapa: abrir(leido.datos.mapa, desde, hasta), op: { tipo: 'abre', desde, hasta } });
    }, false);
  }

  // --- Internos ---

  private nuevaCita(datos: NuevaCita, cupoId?: string, reemplazaA?: string): Cita {
    return {
      ...datos,
      estado: 'pendiente',
      creadoEn: new Date().toISOString(),
      ...(cupoId ? { cupoId } : {}),
      ...(reemplazaA ? { reemplazaA } : {}),
    };
  }

  /** Las marcas de 5 minutos que ocupa la cita: [primera, cuántas]. */
  private tramoDe(datos: Pick<NuevaCita, 'hora' | 'duracionMinutos'>): [number, number] {
    return tramo(parsearHora(datos.hora) ?? 0, duracionDe(datos));
  }

  /**
   * Mueve el rato de una cita en la agenda: suelta el que tenía `antes` (si lo tenía) y aparta `[k, n]` en el día de
   * `despues`, que debe estar libre (sin contar el rato propio). Sirve para cambiar de horario (cita nueva) y para
   * mover una cita desde el panel (la misma cita). Lee los días y deja las escrituras hechas: quien llama no puede
   * leer nada más después (en una transacción, las lecturas van primero).
   */
  private async moverRato(tx: Transaction, antes: LugarDeCita, despues: LugarDeCita, [k, n]: [number, number], tipo: 'citas' | 'admin'): Promise<void> {
    const mismoDia = antes.barberoId === despues.barberoId && antes.dia === despues.dia;
    const viejo = await this.leerDia(tx, antes.barberoId, antes.dia);
    const destino = mismoDia ? viejo : await this.leerDia(tx, despues.barberoId, despues.dia);
    if (!destino.datos) throw new HorarioNoDisponibleError();
    const suyo = viejo.datos?.citas?.[antes.id];
    const mapaViejo = viejo.datos && suyo ? liberar(viejo.datos.mapa, suyo[0], suyo[1]) : viejo.datos?.mapa ?? '';
    const base = mismoDia ? mapaViejo : destino.datos.mapa;
    if (!estaLibreEn(base, k * MARCA, n * MARCA)) throw new HorarioNoDisponibleError();

    // Lo que revisan las reglas en un cambio del cliente (el admin no pasa por ahí).
    const op = (libera: boolean, ocupa: boolean) => (tipo === 'admin' ? { tipo: 'admin' }
      : { tipo: 'citas', ...(libera ? { libera: antes.id } : {}), ...(ocupa ? { ocupa: despues.id } : {}) });
    const misma = antes.id === despues.id;
    if (mismoDia) {
      tx.update(destino.ref, {
        mapa: ocupar(base, k, n),
        ...(suyo && !misma ? { [`citas.${antes.id}`]: deleteField() } : {}),
        [`citas.${despues.id}`]: [k, n],
        op: op(!!suyo, true),
      });
    } else {
      if (suyo) tx.update(viejo.ref, { mapa: mapaViejo, [`citas.${antes.id}`]: deleteField(), op: op(true, false) });
      tx.update(destino.ref, { mapa: ocupar(base, k, n), [`citas.${despues.id}`]: [k, n], op: op(false, true) });
    }
  }

  private async leerDia(tx: Transaction, barberoId: string, dia: string): Promise<DiaLeido> {
    const ref = doc(this.ocupacionRef, idOcupacion(barberoId, dia));
    const snap = await tx.get(ref);
    return { ref, datos: snap.exists() ? (snap.data() as Ocupacion) : null };
  }

  /**
   * Primer cupo libre del cliente para ese día. La página deja RESERVAS_POR_DIA reservas activas por día;
   * las reglas, una más, que es la que usa el reagendar dentro del mismo día.
   */
  private async cupoLibre(uid: string, dia: string, reagendando?: Cita): Promise<string> {
    const usados = await getDocs(query(this.cuposRef, where('userId', '==', uid), where('dia', '==', dia)));
    const ids = new Set(usados.docs.map(d => d.id));
    const queSiguen = usados.docs.filter(d => d.id !== reagendando?.cupoId).length;
    if (queSiguen >= RESERVAS_POR_DIA) throw new CupoAgotadoError();
    for (let n = 1; n <= CUPOS_POR_DIA; n++) {
      const id = `${uid}_${dia}_${n}`;
      if (!ids.has(id)) return id;
    }
    throw new CupoAgotadoError();
  }

  private escucharCitas(consulta: Parameters<typeof escuchar>[1]): Observable<Cita[]> {
    return escuchar<Cita>(this.zone, consulta).pipe(
      map(citas => citas.map(c => ({ ...c, estado: normalizarEstado(c.estado) }))),
    );
  }

  /**
   * Corre la transacción (Firestore la repite sola si el mapa cambió mientras tanto). Si las reglas la niegan al
   * reservar, es que el rato ya no estaba libre: se avisa como "horario no disponible".
   */
  private async ejecutar<T>(cuerpo: (tx: Transaction) => Promise<T>, negadoEsOcupado = true): Promise<T> {
    try {
      return await runTransaction(this.firestore, cuerpo);
    } catch (error: any) {
      if (negadoEsOcupado && error?.code === 'permission-denied') throw new HorarioNoDisponibleError();
      throw error;
    }
  }
}

/** ¿Sigue ocupando un cupo? (para avisar al cliente antes de intentar la reserva). */
export function reservasActivasDelDia(citas: Cita[], dia: string): number {
  return citas.filter(c => esActiva(c.estado) && c.dia === dia).length;
}
