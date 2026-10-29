import { CLIENTE } from '../../config/cliente';
import { Cita } from '../models/cita.model';
import { enlaceWhatsApp } from './colombia';

/**
 * Dónde dejar una reseña en Google: el enlace de "Pedir reseñas" del Perfil de Empresa (abre directo el cuadro de
 * la reseña) o, mientras no esté en la configuración, la ficha del negocio en Maps ("Escribir una reseña").
 * Las reseñas son lo que más sube a una barbería en el mapa de Google.
 */
export const ENLACE_RESENA = CLIENTE.ubicacion?.resenaUrl || CLIENTE.ubicacion?.mapaUrl || '';

/** WhatsApp al cliente, después de atenderlo, con el pedido de reseña ya escrito. No gasta correos. */
export function pedirResenaPorWhatsApp(cita: Pick<Cita, 'phone' | 'userName'>): string {
  // Una cita vieja (o mal hecha) puede venir sin nombre: no debe romper la lista del panel.
  const nombre = (cita.userName ?? '').trim().split(/\s+/)[0] ?? '';
  return enlaceWhatsApp(cita.phone, `Hola ${nombre}, gracias por venir a ${CLIENTE.nombre}. Si te gustó tu corte, ¿nos ayudas con `
    + `una reseña en Google? Nos ayuda mucho a que más personas nos encuentren: ${ENLACE_RESENA}`);
}
