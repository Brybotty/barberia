import { Injectable, NgZone, inject } from '@angular/core';
import { Firestore, addDoc, collection, deleteDoc, doc, query, updateDoc, where } from '@angular/fire/firestore';
import { Observable, map, shareReplay } from 'rxjs';
import { Servicio } from '../models/servicio.model';
import { escuchar } from '../utils/firestore';

@Injectable({ providedIn: 'root' })
export class ServiciosService {
  private firestore = inject(Firestore);
  private zone = inject(NgZone);
  private serviciosRef = collection(this.firestore, 'servicios');

  private readonly servicios$ = escuchar<Servicio>(this.zone, this.serviciosRef).pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  listar(): Observable<Servicio[]> {
    return this.servicios$;
  }

  destacados(): Observable<Servicio[]> {
    return escuchar<Servicio>(this.zone, query(this.serviciosRef, where('destacado', '==', true))).pipe(
      map(servicios => servicios.sort((a, b) => b.precio - a.precio)),
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
