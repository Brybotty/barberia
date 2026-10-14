import { Injectable, NgZone, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';
import { catchError, map, of, shareReplay } from 'rxjs';
import { AjustesSitio, ajustesPorDefecto, conDefectos } from '../models/ajustes.model';
import { conCopiaLocal, escucharDoc } from '../utils/firestore';
import { Agenda, Horario, horarioCompleto, periodoDeAgenda } from '../utils/horario';

@Injectable({ providedIn: 'root' })
export class AjustesService {
  private firestore = inject(Firestore);
  private ref = doc(this.firestore, 'ajustes/sitio');

  /** El documento tal como está ahora en Firestore (null si no existe). */
  private readonly documento$ = escucharDoc<AjustesSitio>(inject(NgZone), this.ref).pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  /**
   * Ajustes del sitio en tiempo real. Si el documento no existe o no se puede leer, los valores por defecto.
   * Empieza por la copia de la última visita (horario, agenda y cursos se pintan sin esperar a la red).
   */
  readonly ajustes$ = this.documento$.pipe(
    conCopiaLocal('ajustes'),
    map(guardado => conDefectos(guardado ?? undefined)),
    catchError(error => {
      console.error('No se pudieron leer los ajustes del sitio; se usan los de por defecto.', error);
      return of(ajustesPorDefecto());
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  /** Lo guardado ahora mismo, sin la copia local: es lo que edita el panel de Ajustes. */
  readonly guardados$ = this.documento$.pipe(map(guardado => conDefectos(guardado ?? undefined)));

  readonly ajustes = toSignal(this.ajustes$, { initialValue: ajustesPorDefecto() });

  /** Horario de atención vigente (el que guardó el admin o, si no hay, el de la configuración). */
  readonly horario = computed<Horario>(() => horarioCompleto(this.ajustes().horario));

  /** Agenda de reservas vigente: continua, o el periodo que abrió el admin. */
  readonly agenda = computed<Agenda>(() => this.ajustes().agenda);
  readonly periodo = computed(() => periodoDeAgenda(this.agenda()));

  guardar(ajustes: AjustesSitio): Promise<void> {
    return setDoc(this.ref, ajustes);
  }

  /** Cambia solo la agenda (abrir el siguiente periodo desde el inicio del panel), sin tocar lo demás. */
  guardarAgenda(agenda: Agenda): Promise<void> {
    return setDoc(this.ref, { agenda }, { merge: true });
  }
}
