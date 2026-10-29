import { Injectable, NgZone, inject } from '@angular/core';
import {
  Firestore, collection, doc, documentId, getDocs, query, runTransaction, where,
} from '@angular/fire/firestore';
import { Observable, map, of } from 'rxjs';
import { BARBERO_CUALQUIERA, Cita, esActiva } from '../models/cita.model';
import { escuchar } from '../utils/firestore';
import { claveDia, sumarDias } from '../utils/horario';
import { Ocupacion, armarOcupacion, idOcupacion } from '../utils/ocupacion';

/** Días hacia adelante que se dejan preparados (HORIZONTE_DIAS en functions/src/recurrencias.ts). */
export const DIAS_PREPARADOS = 62;

/** Un cierre de la agenda vieja (documento de `slots` con `bloqueo`). */
interface CierreViejo {
  barberoId: string;
  dia: string;
  hora: string;
  motivo?: string;
}

/**
 * Lee la ocupación de la agenda (`ocupacion/{barberoId}_{dia}`, pública: no tiene datos de clientes) y, para el
 * admin, prepara los días que aún no tienen documento. Las escrituras de citas y cierres van en CitasService.
 *
 * Solo el admin (y la Cloud Function, cada noche) crea los documentos: un día sin documento no se puede reservar,
 * así nadie reserva encima de una cita de antes de este cambio que aún no estuviera en el mapa.
 */
@Injectable({ providedIn: 'root' })
export class OcupacionService {
  private firestore = inject(Firestore);
  private zone = inject(NgZone);
  private ref = collection(this.firestore, 'ocupacion');
  private citasRef = collection(this.firestore, 'citas');

  /** La ocupación de todos los barberos un día (por id de barbero). Lo que lee la reserva. */
  delDia(dia: string): Observable<Map<string, Ocupacion>> {
    return escuchar<Ocupacion>(this.zone, query(this.ref, where('dia', '==', dia))).pipe(
      map(docs => new Map(docs.map(o => [o.barberoId, o]))),
    );
  }

  /** La ocupación de un barbero en varios días (hasta 30), por día: los turnos de una agenda recurrente. */
  deDias(barberoId: string, dias: string[]): Observable<Map<string, Ocupacion>> {
    if (!barberoId || dias.length === 0) return of(new Map());
    const ids = dias.slice(0, 30).map(d => idOcupacion(barberoId, d));
    return escuchar<Ocupacion>(this.zone, query(this.ref, where(documentId(), 'in', ids))).pipe(
      map(docs => new Map(docs.map(o => [o.dia, o]))),
    );
  }

  /** Los días de un barbero entre dos fechas (sus cierres de agenda). */
  entre(barberoId: string, desde: string, hasta: string): Observable<Ocupacion[]> {
    return escuchar<Ocupacion>(this.zone, query(this.ref,
      where(documentId(), '>=', idOcupacion(barberoId, desde)), where(documentId(), '<=', idOcupacion(barberoId, hasta))));
  }

  /**
   * (Admin) Crea el documento de ese día si falta, armado con las citas activas y los cierres de la agenda vieja.
   * Se puede repetir sin miedo: si alguien lo creó mientras tanto, no se toca. "cualquiera" no tiene agenda.
   */
  async asegurarDia(barberoId: string, dia: string): Promise<void> {
    if (!barberoId || barberoId === BARBERO_CUALQUIERA) return;
    const [citas, cierres] = await Promise.all([
      getDocs(query(this.citasRef, where('barberoId', '==', barberoId), where('dia', '==', dia))),
      getDocs(query(collection(this.firestore, 'slots'), where('bloqueo', '==', true), where('dia', '==', dia))),
    ]);
    await this.crearDia(
      barberoId, dia,
      citas.docs.map(d => ({ ...(d.data() as Cita), id: d.id })),
      cierres.docs.map(d => d.data() as CierreViejo),
    );
  }

  /**
   * (Admin) Prepara los días que les faltan a los barberos, de hoy a DIAS_PREPARADOS adelante. Lo hace el panel al
   * abrirse: la primera vez (tras publicar este cambio) arma todos los días con las citas que ya había. Después basta
   * con mirar el último día: la Cloud Function los prepara cada noche, así que si ese ya está, están todos (salvo con
   * un barbero nuevo, que no lo tiene). Devuelve cuántos creó.
   */
  async prepararPendientes(barberoIds: string[], hoy = claveDia(new Date())): Promise<number> {
    const ids = barberoIds.filter(id => id && id !== BARBERO_CUALQUIERA);
    if (ids.length === 0) return 0;
    const hasta = sumarDias(hoy, DIAS_PREPARADOS);
    const ultimos = await getDocs(query(this.ref, where('dia', '==', hasta)));
    const conUltimo = new Set(ultimos.docs.map(d => d.id));
    if (ids.every(id => conUltimo.has(idOcupacion(id, hasta)))) return 0;

    const existentes = await getDocs(query(this.ref, where('dia', '>=', hoy), where('dia', '<=', hasta)));
    const hay = new Set(existentes.docs.map(d => d.id));
    const faltan: [string, string][] = [];
    for (let i = 0; i <= DIAS_PREPARADOS; i++) {
      const dia = sumarDias(hoy, i);
      for (const barberoId of ids) if (!hay.has(idOcupacion(barberoId, dia))) faltan.push([barberoId, dia]);
    }
    if (faltan.length === 0) return 0;

    // Una sola lectura de citas y de cierres viejos para todos los días que faltan.
    const [citas, cierres] = await Promise.all([
      getDocs(query(this.citasRef, where('dia', '>=', hoy), where('dia', '<=', hasta))),
      getDocs(query(collection(this.firestore, 'slots'), where('bloqueo', '==', true), where('dia', '>=', hoy))),
    ]);
    const todasLasCitas = citas.docs.map(d => ({ ...(d.data() as Cita), id: d.id }));
    const todosLosCierres = cierres.docs.map(d => d.data() as CierreViejo);
    // De a 10 a la vez: la primera vez son unos 60 días por barbero.
    let creados = 0;
    for (let i = 0; i < faltan.length; i += 10) {
      const lote = faltan.slice(i, i + 10).map(([barberoId, dia]) => this.crearDia(barberoId, dia, todasLasCitas, todosLosCierres));
      creados += (await Promise.all(lote)).filter(Boolean).length;
    }
    return creados;
  }

  /**
   * Crea el día si aún no existe. Las citas se vuelven a leer dentro de la transacción: si alguna se canceló entre la
   * consulta y ahora, no debe quedar ocupando un rato que ya nadie podría soltar.
   */
  private crearDia(barberoId: string, dia: string, candidatas: Cita[], cierres: CierreViejo[]): Promise<boolean> {
    const ref = doc(this.ref, idOcupacion(barberoId, dia));
    const suyas = candidatas.filter(c => c.id && c.barberoId === barberoId && c.dia === dia && esActiva(c.estado));
    const cierresDelDia = cierres.filter(s => s.barberoId === barberoId && s.dia === dia);
    return runTransaction(this.firestore, async tx => {
      if ((await tx.get(ref)).exists()) return false;
      const vivas = await Promise.all(suyas.map(async c => {
        const snap = await tx.get(doc(this.citasRef, c.id!));
        return snap.exists() ? { ...(snap.data() as Cita), id: snap.id } : null;
      }));
      const armado = armarOcupacion(barberoId, dia, vivas.filter((c): c is Cita & { id: string } => !!c), cierresDelDia);
      tx.set(ref, { ...armado, op: { tipo: 'prepara' } });
      return true;
    });
  }
}
