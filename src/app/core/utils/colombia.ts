/** Deja solo los dígitos de un celular colombiano (quita espacios, guiones y el +57). */
export function limpiarCelular(telefono: string): string {
  const digitos = telefono.replace(/\D/g, '');
  return digitos.length === 12 && digitos.startsWith('57') ? digitos.slice(2) : digitos;
}

/** Celular colombiano: 10 dígitos que empiezan por 3. */
export function esCelularValido(telefono: string): boolean {
  return /^3\d{9}$/.test(limpiarCelular(telefono));
}

/** Celular en formato internacional (+573001234567), el que pide Firebase para enviar el código por SMS. */
export function celularInternacional(telefono: string): string {
  return `+57${limpiarCelular(telefono)}`;
}

/** "3001234567" o "+573001234567" → "300 123 4567". Si no es un celular colombiano, lo deja igual. */
export function formatoCelular(telefono: string): string {
  const numero = limpiarCelular(telefono);
  return numero.length === 10 ? `${numero.slice(0, 3)} ${numero.slice(3, 6)} ${numero.slice(6)}` : telefono;
}

/** Enlace de WhatsApp a un celular colombiano. */
export function enlaceWhatsApp(telefono: string, mensaje = ''): string {
  const numero = limpiarCelular(telefono);
  const conIndicativo = numero.length === 10 ? `57${numero}` : numero;
  return `https://wa.me/${conIndicativo}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''}`;
}
