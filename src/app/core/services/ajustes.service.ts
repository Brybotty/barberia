import { Injectable, NgZone, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';
import { catchError, map, of, shareReplay } from 'rxjs';
import { AjustesSitio, ajustesPorDefecto, conDefectos } from '../models/ajustes.model';
import { escucharDoc } from '../utils/firestore';

@Injectable({ providedIn: 'root' })
export class AjustesService {
  private firestore = inject(Firestore);
  private ref = doc(this.firestore, 'ajustes/sitio');

  /** Ajustes del sitio en tiempo real. Si el documento no existe o no se puede leer, los valores por defecto. */
  readonly ajustes$ = escucharDoc<AjustesSitio>(inject(NgZone), this.ref).pipe(
    map(guardado => conDefectos(guardado ?? undefined)),
    catchError(error => {
      console.error('No se pudieron leer los ajustes del sitio; se usan los de por defecto.', error);
      return of(ajustesPorDefecto());
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly ajustes = toSignal(this.ajustes$, { initialValue: ajustesPorDefecto() });

  guardar(ajustes: AjustesSitio): Promise<void> {
    return setDoc(this.ref, ajustes);
  }
}
