/** Deja solo los dígitos de un celular colombiano (quita espacios, guiones y el +57). */
export function limpiarCelular(telefono: string): string {
  const digitos = telefono.replace(/\D/g, '');
  return digitos.length === 12 && digitos.startsWith('57') ? digitos.slice(2) : digitos;
}

/** Enlace de WhatsApp a un celular colombiano. */
export function enlaceWhatsApp(telefono: string, mensaje = ''): string {
  const numero = limpiarCelular(telefono);
  const conIndicativo = numero.length === 10 ? `57${numero}` : numero;
  return `https://wa.me/${conIndicativo}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''}`;
}
