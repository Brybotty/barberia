import { AjustesTienda } from './ajustes.model';

export type TipoEntrega = 'recoger' | 'local' | 'nacional';
export type MetodoPago = 'en-linea' | 'contraentrega' | 'en-tienda';
export type EstadoPago = 'pendiente' | 'aprobado' | 'rechazado' | 'anulado' | 'error';
export type EstadoPedido = 'pendiente' | 'confirmado' | 'enviado' | 'entregado' | 'cancelado';

export interface ItemPedido {
  productoId: string;
  nombre: string;
  opcion: string | null;
  /** Precio unitario al momento de comprar. */
  precio: number;
  cantidad: number;
}

export interface PagoPedido {
  metodo: MetodoPago;
  estado: EstadoPago;
  /** Datos de Wompi. Solo los escriben las Cloud Functions. */
  referencia?: string;
  intentos?: number;
  transaccionId?: string;
  /** Medio usado en Wompi: CARD, NEQUI, PSE, BANCOLOMBIA_TRANSFER... */
  medio?: string;
  actualizadoEn?: string;
}

export interface Pedido {
  id?: string;
  userId: string;
  cliente: { nombre: string; telefono: string; email: string; documento: string };
  entrega: {
    tipo: TipoEntrega;
    direccion: string;
    barrio: string;
    ciudad: string;
    departamento: string;
    notas: string;
  };
  items: ItemPedido[];
  subtotal: number;
  envio: number;
  total: number;
  pago: PagoPedido;
  estado: EstadoPedido;
  creadoEn: string;
  /** Cuándo aceptó el cliente la política de tratamiento de datos (prueba de la autorización). */
  autorizacionDatos: string;
  /** El stock ya volvió al inventario tras cancelarse. */
  stockDevuelto?: boolean;
}

/**
 * Lo que envía el checkout. El pedido lo crea la Cloud Function `crearPedido`, que pone los
 * precios y el envío según el catálogo y descuenta el inventario en la misma operación.
 */
export interface SolicitudPedido {
  cliente: Pedido['cliente'];
  entrega: Pedido['entrega'];
  items: { productoId: string; opcion: string | null; cantidad: number }[];
  metodo: MetodoPago;
  aceptaPolitica: boolean;
}

/** Código corto para hablar del pedido con el cliente (#A1B2C3). */
export function codigoPedido(pedido: Pick<Pedido, 'id'>): string {
  return (pedido.id ?? '').slice(0, 6).toUpperCase();
}

export function costoEnvio(tipo: TipoEntrega, subtotal: number, tienda: AjustesTienda): number {
  if (tipo === 'recoger') return 0;
  const { gratisDesde, local, nacional } = tienda.entrega;
  if (gratisDesde > 0 && subtotal >= gratisDesde) return 0;
  return tipo === 'local' ? local.costo : nacional.costo;
}

/** Métodos de pago que tienen sentido para cada forma de entrega. */
export function metodosPara(tipo: TipoEntrega, tienda: AjustesTienda): MetodoPago[] {
  const metodos: MetodoPago[] = [];
  if (tienda.pagos.enLinea) metodos.push('en-linea');
  if (tipo === 'local' && tienda.pagos.contraentrega) metodos.push('contraentrega');
  if (tipo === 'recoger' && tienda.pagos.enTienda) metodos.push('en-tienda');
  return metodos;
}

export function etiquetaEstado(pedido: Pick<Pedido, 'estado' | 'entrega'>): string {
  switch (pedido.estado) {
    case 'pendiente': return 'Recibido';
    case 'confirmado': return 'Confirmado';
    case 'enviado': return pedido.entrega.tipo === 'recoger' ? 'Listo para recoger' : 'En camino';
    case 'entregado': return 'Entregado';
    case 'cancelado': return 'Cancelado';
  }
}

export function etiquetaPago(pago: Pick<PagoPedido, 'metodo' | 'estado'>): string {
  switch (pago.estado) {
    case 'aprobado': return 'Pagado';
    case 'rechazado': return 'Pago rechazado';
    case 'anulado': return 'Pago anulado';
    case 'error': return 'Error en el pago';
    case 'pendiente':
      if (pago.metodo === 'contraentrega') return 'Paga al recibir';
      if (pago.metodo === 'en-tienda') return 'Paga al recoger';
      return 'Pago pendiente';
  }
}

export const NOMBRE_METODO: Record<MetodoPago, string> = {
  'en-linea': 'Pago en línea',
  contraentrega: 'Contraentrega',
  'en-tienda': 'Pago en la barbería',
};

export const NOMBRE_ENTREGA: Record<TipoEntrega, string> = {
  recoger: 'Recoger en la barbería',
  local: 'Domicilio',
  nacional: 'Envío nacional',
};

/** Pasos que ve el cliente, en orden. */
export const PASOS_PEDIDO: readonly EstadoPedido[] = ['pendiente', 'confirmado', 'enviado', 'entregado'];
