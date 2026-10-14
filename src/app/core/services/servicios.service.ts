import { Injectable, NgZone, inject } from '@angular/core';
import { Firestore, addDoc, collection, deleteDoc, doc, updateDoc } from '@angular/fire/firestore';
import { Observable, map, shareReplay } from 'rxjs';
import { Servicio } from '../models/servicio.model';
import { conCopiaLocal, escuchar } from '../utils/firestore';

@Injectable({ providedIn: 'root' })
export class ServiciosService {
  private firestore = inject(Firestore);
  private zone = inject(NgZone);
  private serviciosRef = collection(this.firestore, 'servicios');

  /**
   * Lo que hay ahora en Firestore. Una sola escucha para toda la visita (refCount: false): pasar del inicio a
   * Servicios o a Reservar no vuelve a pedir el catálogo ni a esperarlo.
   */
  private readonly actuales$ = escuchar<Servicio>(this.zone, this.serviciosRef).pipe(
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  /** Para las páginas públicas: primero la copia de la última visita y enseguida lo actual. */
  private readonly servicios$ = this.actuales$.pipe(
    conCopiaLocal('servicios'),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  listar(): Observable<Servicio[]> {
    return this.servicios$;
  }

  /** Sin la copia local: para el panel, donde se edita sobre lo que hay de verdad. */
  actuales(): Observable<Servicio[]> {
    return this.actuales$;
  }

  destacados(): Observable<Servicio[]> {
    return this.servicios$.pipe(
      map(servicios => servicios.filter(s => s.destacado).sort((a, b) => b.precio - a.precio)),
    );
  }

  async guardar(servicio: Servicio): Promise<void> {
    const { id, ...datos } = servicio;
    if (id) {
      await updateDoc(doc(this.firestore, `servicios/${id}`), { ...datos });
    } else {
      await addDoc(this.serviciosRef, datos);
    }
  }

  eliminar(id: string): Promise<void> {
    return deleteDoc(doc(this.firestore, `servicios/${id}`));
  }
}
