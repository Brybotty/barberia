import { NgZone } from '@angular/core';
import { DocumentData, DocumentReference, Query, onSnapshot } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

/**
 * Escucha una consulta en tiempo real y emite los documentos con su `id`.
 * Los callbacks se ejecutan dentro de la zona de Angular para que la vista se actualice.
 */
export function escuchar<T>(zone: NgZone, consulta: Query<DocumentData>): Observable<(T & { id: string })[]> {
  return new Observable((subscriber) =>
    onSnapshot(
      consulta,
      (snapshot) =>
        zone.run(() => subscriber.next(snapshot.docs.map((d) => ({ ...(d.data() as T), id: d.id })))),
      (error) => zone.run(() => subscriber.error(error)),
    ),
  );
}

/** Escucha un documento en tiempo real. Emite null si no existe. */
export function escucharDoc<T>(zone: NgZone, ref: DocumentReference<DocumentData>): Observable<(T & { id: string }) | null> {
  return new Observable((subscriber) =>
    onSnapshot(
      ref,
      (snapshot) =>
        zone.run(() => subscriber.next(snapshot.exists() ? { ...(snapshot.data() as T), id: snapshot.id } : null)),
      (error) => zone.run(() => subscriber.error(error)),
    ),
  );
}
