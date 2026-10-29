/**
 * Días con servicios limitados: el admin elige un día en el calendario de Citas y deja que ese día solo se reserven
 * en línea algunos servicios (por ejemplo, el 23 de noviembre solo Premium). Se guarda en `ajustes/sitio`
 * como `serviciosPorDia: { 'YYYY-MM-DD': [IDs de los servicios que SÍ se reservan] }`; un día sin entrada deja
 * reservar todos. Se guarda la lista de los permitidos (y no la de los cerrados, como por barbero) para que un
 * servicio nuevo no se cuele en un día que se dejó "solo Premium".
 *
 * Las reglas exigen lo mismo al crear el cupo de la reserva (firestore.rules, `reservaAbierta`). Las citas que ya
 * estaban, las que agenda el equipo desde el panel y los turnos de las agendas recurrentes no cambian.
 *
 * Lo que lee lo guardado (`serviciosPorDiaGuardados`) está en models/ajustes.model.ts: es lo único que necesita la
 * página al arrancar; lo de aquí lo descargan solo la reserva y el panel.
 */
import type { ServiciosPorDia } from '../models/ajustes.model';

export type { ServiciosPorDia };

/** Los servicios que se reservan en línea ese día, o null si se reservan todos. */
export function serviciosDelDia(porDia: ServiciosPorDia, dia: string): string[] | null {
  return porDia[dia]?.length ? porDia[dia] : null;
}

/** ¿Se puede reservar en línea ese servicio ese día? */
export function servicioPermitidoEl(porDia: ServiciosPorDia, dia: string, servicioId: string | undefined): boolean {
  const permitidos = serviciosDelDia(porDia, dia);
  return !permitidos || (!!servicioId && permitidos.includes(servicioId));
}

/** Los días limitados de `desde` en adelante, en orden. */
export function diasLimitados(porDia: ServiciosPorDia, desde: string): { dia: string; servicios: string[] }[] {
  return Object.entries(porDia)
    .filter(([dia, servicios]) => dia >= desde && servicios.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, servicios]) => ({ dia, servicios }));
}

/** "Acicale Premium", "Acicale Premium y Barba2", "A, B y C" (con los nombres del catálogo; los borrados no salen). */
export function nombresDeServicios(ids: string[], catalogo: { id?: string; nombre: string }[]): string {
  const nombres = ids.map(id => catalogo.find(s => s.id === id)?.nombre).filter((n): n is string => !!n);
  if (nombres.length <= 1) return nombres[0] ?? 'ningún servicio del menú actual';
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}
