import { Injectable, NgZone, inject } from '@angular/core';
import { Firestore, addDoc, collection, deleteDoc, doc, updateDoc } from '@angular/fire/firestore';
import { Observable, shareReplay } from 'rxjs';
import { DatosRecurrencia, Recurrencia } from '../models/recurrencia.model';
import { escuchar } from '../utils/firestore';

/**
 * Agendas recurrentes (`recurrencias/{id}`). Solo el admin (las reglas lo exigen).
 * Aquí solo se guarda el plan: los turnos los aparta, cambia o quita la Cloud Function programarRecurrencia
 * cada vez que cambia `actualizadoEn`.
 */
@Injectable({ providedIn: 'root' })
export class RecurrenciasService {
  private firestore = inject(Firestore);
  private ref = collection(this.firestore, 'recurrencias');

  private readonly todas$ = escuchar<Recurrencia>(inject(NgZone), this.ref).pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  listar(): Observable<Recurrencia[]> {
    return this.todas$;
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
