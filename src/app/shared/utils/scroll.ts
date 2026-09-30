let bloqueos = 0;

/**
 * Evita que la página de fondo se desplace mientras hay una ventana abierta.
 * Lleva la cuenta para que cerrar una ventana no desbloquee otra que sigue abierta
 * (p. ej. el detalle del producto se cierra justo cuando se abre el carrito).
 * Devuelve la función que libera el bloqueo.
 */
export function bloquearScroll(): () => void {
  bloqueos++;
  document.body.classList.add('overflow-hidden');
  let liberado = false;
  return () => {
    if (liberado) return;
    liberado = true;
    bloqueos = Math.max(0, bloqueos - 1);
    if (bloqueos === 0) document.body.classList.remove('overflow-hidden');
  };
}
