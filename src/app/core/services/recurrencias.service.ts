import { Injectable, NgZone, inject } from '@angular/core';
import { Firestore, addDoc, collection, deleteDoc, doc, query, updateDoc, where } from '@angular/fire/firestore';
import { Observable, shareReplay } from 'rxjs';
import { DatosRecurrencia, Recurrencia } from '../models/recurrencia.model';
import { escuchar } from '../utils/firestore';

/**
 * Agendas recurrentes (`recurrencias/{id}`). El admin, las de todos; cada barbero, solo las suyas (las reglas lo exigen).
 * Aquí solo se guarda el plan: los turnos los aparta, cambia o quita la Cloud Function programarRecurrencia
 * cada vez que cambia `actualizadoEn`.
 */
@Injectable({ providedIn: 'root' })
export class RecurrenciasService {
  private firestore = inject(Firestore);
  private zone = inject(NgZone);
  private ref = collection(this.firestore, 'recurrencias');

  private readonly todas$ = escuchar<Recurrencia>(this.zone, this.ref).pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  listar(): Observable<Recurrencia[]> {
    return this.todas$;
  }

  /** Las de un barbero (lo que ve en su panel). */
  delBarbero(barberoId: string): Observable<Recurrencia[]> {
    return escuchar<Recurrencia>(this.zone, query(this.ref, where('barberoId', '==', barberoId)));
  }

  async crear(datos: DatosRecurrencia): Promise<string> {
    const ahora = new Date().toISOString();
    const creada = await addDoc(this.ref, { ...datos, creadoEn: ahora, actualizadoEn: ahora });
    return creada.id;
  }

  /** Cambia la serie: los turnos por venir se quitan y se vuelven a apartar con los datos nuevos. */
  actualizar(id: string, datos: DatosRecurrencia): Promise<void> {
    return updateDoc(doc(this.ref, id), { ...datos, actualizadoEn: new Date().toISOString() });
  }

  /** En pausa se sueltan sus turnos por venir; al reanudarla se vuelven a apartar. */
  pausar(id: string, activa: boolean): Promise<void> {
    return updateDoc(doc(this.ref, id), { activa, actualizadoEn: new Date().toISOString() });
  }

  /** Se sueltan sus turnos por venir; los que ya pasaron se quedan en la agenda y en las ganancias. */
  eliminar(id: string): Promise<void> {
    return deleteDoc(doc(this.ref, id));
  }
}
