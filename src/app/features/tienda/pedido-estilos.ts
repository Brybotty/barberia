import { EstadoPago, EstadoPedido } from '../../core/models/pedido.model';

/** Clases de las etiquetas de estado (cliente y panel). */
export const COLOR_ESTADO: Record<EstadoPedido, string> = {
  pendiente: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
  confirmado: 'bg-sky-500/10 text-sky-300 border-sky-500/25',
  enviado: 'bg-violet-500/10 text-violet-300 border-violet-500/25',
  entregado: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  cancelado: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/25',
};

export const COLOR_PAGO: Record<EstadoPago, string> = {
  pendiente: 'bg-white/5 text-neutral-300 border-white/15',
  aprobado: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  rechazado: 'bg-red-500/10 text-red-300 border-red-500/25',
  anulado: 'bg-red-500/10 text-red-300 border-red-500/25',
  error: 'bg-red-500/10 text-red-300 border-red-500/25',
};
