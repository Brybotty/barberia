import { Injectable, NgZone, inject } from '@angular/core';
import {
  Firestore, WriteBatch, collection, doc, query, updateDoc, where, writeBatch,
} from '@angular/fire/firestore';
import { Observable, map, shareReplay } from 'rxjs';
import { Cita, EstadoCita, NuevaCita } from '../models/cita.model';
import { escuchar } from '../utils/firestore';
import { Slot, duracionDe, fechaDesdeClave, formatearHora12, minutosAHora24, normalizarEstado, parsearHora, slotsDeCita } from '../utils/horario';

/** El horario ya está tomado: otro documento de `slots` ocupa alguno de los bloques. */
export class HorarioNoDisponibleError extends Error {
  constructor() {
    super('El horario seleccionado ya no está disponible.');
  }
}

@Injectable({ providedIn: 'root' })
export class CitasService {
  private firestore = inject(Firestore);
  private zone = inject(NgZone);
  private citasRef = collection(this.firestore, 'citas');
  private slotsRef = collection(this.firestore, 'slots');

  private readonly todas$ = this.escucharCitas(this.citasRef).pipe(
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

  /** Citas de uno o varios barberos (máx. 30 IDs por consulta 'in'). */
  deBarberos(ids: string[]): Observable<Cita[]> {
    return this.escucharCitas(query(this.citasRef, where('barberoId', 'in', ids.slice(0, 30))));
  }

  creadasDesde(isoFecha: string): Observable<Cita[]> {
    return this.escucharCitas(query(this.citasRef, where('creadoEn', '>', isoFecha)));
  }

  /** IDs de los bloques ocupados en un día. No expone datos de clientes. */
  slotsOcupados(dia: string): Observable<Set<string>> {
    return escuchar<Slot>(this.zone, query(this.slotsRef, where('dia', '==', dia))).pipe(
      map(slots => new Set(slots.map(s => s.id))),
    );
  }

  // --- Escrituras ---

  /**
   * Crea la cita y sus bloques en un único batch. Los IDs de bloque son deterministas
   * (barbero_dia_hora): si alguno ya existe, las reglas rechazan el batch completo y
   * no se crea nada, lo que evita la doble reserva incluso entre dos clientes simultáneos.
   */
  async reservar(datos: NuevaCita): Promise<Cita> {
    const citaRef = doc(this.citasRef);
    const inicio = parsearHora(datos.hora) ?? 0;
    const slots = slotsDeCita(datos.barberoId, datos.dia, inicio, duracionDe(datos));
    const cita: Cita = {
      ...datos,
      estado: 'pendiente',
      creadoEn: new Date().toISOString(),
      slotIds: slots.map(s => s.id),
    };

    const batch = writeBatch(this.firestore);
    batch.set(citaRef, cita);
    this.crearSlots(batch, citaRef.id, slots);
    await this.commit(batch);
    return { ...cita, id: citaRef.id };
  }

  /** Marca la cita como cancelada y libera sus bloques. */
  async cancelar(cita: Cita): Promise<void> {
    const batch = writeBatch(this.firestore);
    batch.update(doc(this.citasRef, cita.id!), { estado: 'cancelada' });
    this.borrarSlots(batch, cita.slotIds ?? []);
    await batch.commit();
  }

  /** Marca el corte como hecho con el valor que se cobró (para las ganancias del barbero). */
  async completar(cita: Cita, precioFinal: number): Promise<void> {
    await updateDoc(doc(this.citasRef, cita.id!), { estado: 'completada', precioFinal: Math.max(0, Math.round(precioFinal)) });
  }

  async cambiarEstado(cita: Cita, estado: EstadoCita): Promise<void> {
    if (estado === 'cancelada') return this.cancelar(cita);
    await updateDoc(doc(this.citasRef, cita.id!), { estado });
  }

  /** Edición desde el panel de admin. Si cambia día u hora, mueve los bloques de la cita. */
  async actualizar(cita: Cita, cambios: { userName: string; phone: string; dia: string; minutos: number }): Promise<void> {
    const anteriores = cita.slotIds ?? [];
    const nuevos = cita.estado === 'cancelada'
      ? []
      : slotsDeCita(cita.barberoId, cambios.dia, cambios.minutos, duracionDe(cita));
    const nuevosIds = nuevos.map(s => s.id);

    const batch = writeBatch(this.firestore);
    // Los bloques que se conservan no se tocan: escribir y borrar el mismo documento en un batch no es válido.
    this.borrarSlots(batch, anteriores.filter(id => !nuevosIds.includes(id)));
    this.crearSlots(batch, cita.id!, nuevos.filter(s => !anteriores.includes(s.id)));
    batch.update(doc(this.citasRef, cita.id!), {
      userName: cambios.userName,
      phone: cambios.phone,
      dia: cambios.dia,
      hora: minutosAHora24(cambios.minutos),
      horaStr: formatearHora12(cambios.minutos),
      fecha: fechaDesdeClave(cambios.dia, cambios.minutos).toISOString(),
      slotIds: nuevosIds,
    });
    await this.commit(batch);
  }

  /** Borrado físico (solo admin). */
  async eliminar(cita: Cita): Promise<void> {
    const batch = writeBatch(this.firestore);
    this.borrarSlots(batch, cita.slotIds ?? []);
    batch.delete(doc(this.citasRef, cita.id!));
    await batch.commit();
  }

  // --- Internos ---

  private escucharCitas(consulta: Parameters<typeof escuchar>[1]): Observable<Cita[]> {
    return escuchar<Cita>(this.zone, consulta).pipe(
      map(citas => citas.map(c => ({ ...c, estado: normalizarEstado(c.estado) }))),
    );
  }

  private crearSlots(batch: WriteBatch, citaId: string, slots: Slot[]): void {
    for (const { id, ...datos } of slots) {
      batch.set(doc(this.slotsRef, id), { ...datos, citaId });
    }
  }

  private borrarSlots(batch: WriteBatch, ids: string[]): void {
    for (const id of ids) batch.delete(doc(this.slotsRef, id));
  }

  private async commit(batch: WriteBatch): Promise<void> {
    try {
      await batch.commit();
    } catch (error: any) {
      // Escribir sobre un bloque existente cuenta como 'update', que las reglas prohíben.
      if (error?.code === 'permission-denied') throw new HorarioNoDisponibleError();
      throw error;
    }
  }
}
