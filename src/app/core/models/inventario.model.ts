/**
 * Movimiento de inventario (colección `movimientosInventario`). Las ventas y cancelaciones las
 * registran las Cloud Functions; las entradas y ajustes, el admin desde el panel.
 */
export type TipoMovimiento = 'venta' | 'cancelacion' | 'entrada' | 'ajuste' | 'salida';

export interface MovimientoInventario {
  id?: string;
  productoId: string;
  producto: string;
  opcion: string | null;
  /** Positivo entra, negativo sale. */
  cantidad: number;
  stockResultante: number;
  tipo: TipoMovimiento;
  pedidoId?: string;
  nota?: string;
  /** Quién lo hizo (nombre del admin o "Tienda en línea"). */
  usuario: string;
  fecha: string;
}

export const NOMBRE_MOVIMIENTO: Record<TipoMovimiento, string> = {
  venta: 'Venta',
  cancelacion: 'Pedido cancelado',
  entrada: 'Entrada de mercancía',
  ajuste: 'Ajuste',
  salida: 'Salida (daño o uso interno)',
};
