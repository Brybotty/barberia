import { Component, computed, input } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Carita, CARITAS, NivelAsistencia, ResumenAsistencia, caritaDe, multaPendiente, textoAsistencia } from '../../../core/utils/asistencia';

/** Boca (y cejas o lágrima) de cada nivel, sobre un círculo de 24 × 24. */
const GESTOS: Record<NivelAsistencia, { boca: string; cejas?: string; lagrima?: boolean }> = {
  0: { boca: 'M9 15.5h6' },
  1: { boca: 'M7.5 14q4.5 4.6 9 0' },
  2: { boca: 'M8 15.5h8' },
  3: { boca: 'M8 16.4q4-2 8 0' },
  4: { boca: 'M8 17q4-3.6 8 0', cejas: 'M6.6 7.4l3.3 1.2M17.4 7.4l-3.3 1.2' },
  5: { boca: 'M7.6 17.6q4.4-5 8.8 0', cejas: 'M6.8 8.6l3-1.4M17.2 8.6l-3-1.4', lagrima: true },
};

/** Color del texto junto a la carita (más claro que el relleno, para leerse sobre el fondo negro). */
const TEXTO: Record<NivelAsistencia, string> = {
  0: 'text-neutral-500', 1: 'text-emerald-300', 2: 'text-yellow-300', 3: 'text-orange-300', 4: 'text-red-300', 5: 'text-red-400',
};

/**
 * La carita de asistencia de un cliente (ver core/utils/asistencia.ts): verde y feliz si siempre viene, amarilla si
 * faltó una vez, y rojas cada vez más tristes con más faltas. Con `conTexto`, dice al lado "Faltó 2 veces". Si debe
 * una multa, lo dice siempre ("Debe $10.000"), para cobrársela en su próxima visita.
 */
@Component({
  selector: 'app-carita',
  standalone: true,
  imports: [CurrencyPipe],
  host: { class: 'inline-flex shrink-0 items-center gap-1.5 align-middle', '[attr.title]': 'descripcion()', '[attr.data-nivel]': 'carita().nivel' },
  template: `
    <svg viewBox="0 0 24 24" class="h-5 w-5 shrink-0" role="img" [attr.aria-label]="descripcion()">
      @if (carita().nivel === 0) {
        <circle cx="12" cy="12" r="9.6" fill="none" stroke="#737373" stroke-width="1.4" stroke-dasharray="2.4 2" />
      } @else {
        <circle cx="12" cy="12" r="10" [attr.fill]="carita().color" />
      }
      <g [attr.fill]="rasgos()" [attr.stroke]="rasgos()">
        <circle cx="8.6" cy="10.2" r="1.35" stroke="none" />
        <circle cx="15.4" cy="10.2" r="1.35" stroke="none" />
        <path [attr.d]="gesto().boca" fill="none" stroke-width="1.7" stroke-linecap="round" />
        @if (gesto().cejas; as cejas) { <path [attr.d]="cejas" fill="none" stroke-width="1.5" stroke-linecap="round" /> }
      </g>
      @if (gesto().lagrima) { <path d="M17 12.2q1.3 2 0 2.9q-1.3-.9 0-2.9z" fill="#7dd3fc" /> }
    </svg>
    @if (conTexto()) {
      <span class="whitespace-nowrap text-xs font-bold" [class]="claseTexto()" aria-hidden="true">{{ carita().corto }}</span>
    }
    @if (debe() > 0) {
      <span class="whitespace-nowrap rounded-full border border-red-400/40 bg-red-500/10 px-2 py-0.5 text-[11px] font-bold text-red-200" aria-hidden="true" data-debe-multa>Debe {{ debe() | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
    }
  `,
})
export class CaritaComponent {
  /** Lo que se sabe del cliente (sin nada: es nuevo). */
  readonly resumen = input<ResumenAsistencia | undefined>(undefined);
  /** Para la leyenda: dibuja ese nivel sin mirar ningún cliente. */
  readonly nivel = input<NivelAsistencia | null>(null);
  readonly conTexto = input(false);

  readonly carita = computed<Carita>(() => {
    const nivel = this.nivel();
    return nivel === null ? caritaDe(this.resumen()) : CARITAS.find(c => c.nivel === nivel)!;
  });
  readonly gesto = computed(() => GESTOS[this.carita().nivel]);
  readonly rasgos = computed(() => (this.carita().nivel === 0 ? '#737373' : '#1c1917'));
  readonly claseTexto = computed(() => TEXTO[this.carita().nivel]);
  /** Multa pendiente (solo con un cliente de verdad, no en la leyenda). */
  readonly debe = computed(() => (this.nivel() === null ? multaPendiente(this.resumen()) : 0));
  readonly descripcion = computed(() => {
    if (this.nivel() !== null) return this.carita().significado;
    const debe = this.debe();
    return textoAsistencia(this.resumen()) + (debe > 0 ? ` · debe una multa de $${debe.toLocaleString('es-CO')}` : '');
  });
}
