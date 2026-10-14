import { NgZone } from '@angular/core';
import { DocumentData, DocumentReference, Query, onSnapshot } from '@angular/fire/firestore';
import { MonoTypeOperatorFunction, Observable, tap } from 'rxjs';
import { CLIENTE } from '../../config/cliente';
import { environment } from '../../../environments/environment';

/**
 * Para datos PÚBLICOS que casi no cambian (servicios, equipo, ajustes del sitio): emite primero la última copia
 * que vio este navegador y, cuando responde Firestore, lo que hay ahora. Así, desde la segunda visita, la página
 * se pinta de una en vez de esperar a la red (que en un celular modesto son uno o dos segundos).
 *
 * - Nunca con datos personales: la copia queda guardada en el navegador (localStorage).
 * - Nunca para editar: los paneles leen directo de Firestore, sin la copia (podría estar vieja por un instante).
 * - Una lista vacía no se usa como copia: se espera a Firestore antes de decir "no hay nada".
 */
export function conCopiaLocal<T>(nombre: string): MonoTypeOperatorFunction<T> {
  // Con los emuladores los datos son otros: no se mezclan con la copia de la página real.
  const clave = `copia-v1:${environment.emuladores ? 'demo-' : ''}${CLIENTE.id}:${nombre}`;
  return origen => new Observable<T>(suscriptor => {
    // Si Firestore ya tiene la respuesta (otra pantalla la pidió antes), la copia sobra.
    let hacefalta = true;
    try {
      const guardado = localStorage.getItem(clave);
      const copia = guardado === null ? undefined : JSON.parse(guardado) as T;
      if (copia !== undefined && !(Array.isArray(copia) && copia.length === 0)) {
        // Un instante después de suscribirse, nunca en el mismo paso: quien escucha (una pantalla que se está
        // armando) recibe los datos cuando ya terminó de prepararse, igual que cuando llegan de la red.
        Promise.resolve().then(() => {
          if (hacefalta && !suscriptor.closed) suscriptor.next(copia);
        });
      }
    } catch {
      // Sin almacenamiento (navegación privada) o copia dañada: se espera a Firestore.
    }
    return origen.pipe(tap(valor => {
      hacefalta = false;
      try {
        localStorage.setItem(clave, JSON.stringify(valor));
      } catch { /* almacenamiento lleno o bloqueado: no pasa nada, la próxima vez se espera a la red */ }
    })).subscribe(suscriptor);
  });
}

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
