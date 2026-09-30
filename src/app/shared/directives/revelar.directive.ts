import { Directive, ElementRef, OnDestroy, OnInit, inject, input } from '@angular/core';

/**
 * Hace aparecer el elemento (fade + subida) cuando entra en pantalla.
 * Uso: <div appRevelar [retraso]="150">
 */
@Directive({
  selector: '[appRevelar]',
  standalone: true,
  host: { class: 'revelar', '[style.--retraso]': "retraso() + 'ms'" },
})
export class RevelarDirective implements OnInit, OnDestroy {
  private elemento = inject(ElementRef<HTMLElement>);
  private observador?: IntersectionObserver;

  retraso = input(0);

  ngOnInit() {
    const el = this.elemento.nativeElement;
    if (!('IntersectionObserver' in window)) {
      el.classList.add('revelado');
      return;
    }
    this.observador = new IntersectionObserver(
      entradas => {
        if (entradas.some(e => e.isIntersecting)) {
          el.classList.add('revelado');
          this.observador?.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    this.observador.observe(el);
  }

  ngOnDestroy() {
    this.observador?.disconnect();
  }
}
