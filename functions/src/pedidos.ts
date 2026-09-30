/**
 * Reglas de negocio de los pedidos, sin Firebase (se prueban en pedidos.test.ts).
 * Replica la lógica de la app: src/app/core/models/producto.model.ts y pedido.model.ts.
 */

export interface OpcionProducto {
  nombre: string;
  precio: number;
  agotado?: boolean;
  stock?: number;
}

export interface Producto {
  nombre: string;
  precio: number;
  opciones?: OpcionProducto[];
  visible: boolean;
  agotado: boolean;
  controlStock?: boolean;
  stock?: number;
}

export type TipoEntrega = 'recoger' | 'local' | 'nacional';
export type MetodoPago = 'en-linea' | 'contraentrega' | 'en-tienda';

export interface ItemPedido {
  productoId: string;
  nombre: string;
  opcion: string | null;
  precio: number;
  cantidad: number;
}

/** Unidades que se descontaron del inventario (para devolverlas si se cancela). */
export interface Descuento {
  productoId: string;
  opcion: string | null;
  cantidad: number;
}

export interface AjustesTienda {
  activa: boolean;
  entrega: {
    recoger: boolean;
    local: { activo: boolean; costo: number };
    nacional: { activo: boolean; costo: number };
    gratisDesde: number;
  };
  pagos: { enLinea: boolean; contraentrega: boolean; enTienda: boolean };
}

/** Los mismos valores por defecto que ajustesPorDefecto() de la app. */
export const AJUSTES_TIENDA_DEFECTO: AjustesTienda = {
  activa: true,
  entrega: {
    recoger: true,
    local: { activo: true, costo: 8000 },
    nacional: { activo: false, costo: 15000 },
    gratisDesde: 0,
  },
  pagos: { enLinea: false, contraentrega: true, enTienda: true },
};

export const MAX_POR_PRODUCTO = 20;

export class ErrorPedido extends Error {}

export function conDefectos(guardado: Partial<AjustesTienda> | undefined): AjustesTienda {
  const base = AJUSTES_TIENDA_DEFECTO;
  return {
    activa: guardado?.activa ?? base.activa,
    entrega: {
      ...base.entrega,
      ...guardado?.entrega,
      local: { ...base.entrega.local, ...guardado?.entrega?.local },
      nacional: { ...base.entrega.nacional, ...guardado?.entrega?.nacional },
    },
    pagos: { ...base.pagos, ...guardado?.pagos },
  };
}

export function costoEnvio(tipo: TipoEntrega, subtotal: number, tienda: AjustesTienda): number {
  if (tipo === 'recoger') return 0;
  const { gratisDesde, local, nacional } = tienda.entrega;
  if (gratisDesde > 0 && subtotal >= gratisDesde) return 0;
  return tipo === 'local' ? local.costo : nacional.costo;
}

export function entregaActiva(tipo: TipoEntrega, tienda: AjustesTienda): boolean {
  if (tipo === 'recoger') return tienda.entrega.recoger;
  return tipo === 'local' ? tienda.entrega.local.activo : tienda.entrega.nacional.activo;
}

export function metodosPara(tipo: TipoEntrega, tienda: AjustesTienda): MetodoPago[] {
  const metodos: MetodoPago[] = [];
  if (tienda.pagos.enLinea) metodos.push('en-linea');
  if (tipo === 'local' && tienda.pagos.contraentrega) metodos.push('contraentrega');
  if (tipo === 'recoger' && tienda.pagos.enTienda) metodos.push('en-tienda');
  return metodos;
}

// ---------------------------------------------------------------------------
// Solicitud que llega del navegador (no confiable)
// ---------------------------------------------------------------------------

export interface SolicitudPedido {
  cliente: { nombre: string; telefono: string; email: string; documento: string };
  entrega: { tipo: TipoEntrega; direccion: string; barrio: string; ciudad: string; departamento: string; notas: string };
  items: { productoId: string; opcion: string | null; cantidad: number }[];
  metodo: MetodoPago;
}

const texto = (valor: unknown, max: number): string => (typeof valor === 'string' ? valor.trim().slice(0, max) : '');

export function validarSolicitud(datos: unknown): SolicitudPedido {
  const d = (datos ?? {}) as Record<string, any>;
  if (d['aceptaPolitica'] !== true) throw new ErrorPedido('Debes aceptar la política de tratamiento de datos.');

  const cliente = {
    nombre: texto(d['cliente']?.nombre, 100),
    telefono: texto(d['cliente']?.telefono, 20).replace(/\D/g, ''),
    email: texto(d['cliente']?.email, 120).toLowerCase(),
    documento: texto(d['cliente']?.documento, 20).replace(/[^\dA-Za-z-]/g, ''),
  };
  if (cliente.nombre.length < 3) throw new ErrorPedido('Escribe tu nombre completo.');
  if (!/^3\d{9}$/.test(cliente.telefono)) throw new ErrorPedido('El celular debe tener 10 dígitos.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cliente.email)) throw new ErrorPedido('El correo no es válido.');

  const tipo = d['entrega']?.tipo;
  if (!['recoger', 'local', 'nacional'].includes(tipo)) throw new ErrorPedido('Forma de entrega no válida.');
  const recoger = tipo === 'recoger';
  const entrega = {
    tipo: tipo as TipoEntrega,
    direccion: recoger ? '' : texto(d['entrega']?.direccion, 150),
    barrio: recoger ? '' : texto(d['entrega']?.barrio, 80),
    ciudad: recoger ? '' : texto(d['entrega']?.ciudad, 80),
    departamento: recoger ? '' : texto(d['entrega']?.departamento, 80),
    notas: texto(d['entrega']?.notas, 500),
  };
  if (!recoger && entrega.direccion.length < 5) throw new ErrorPedido('Escribe la dirección de entrega.');
  if (tipo === 'nacional' && (!entrega.ciudad || !entrega.departamento)) throw new ErrorPedido('Escribe la ciudad y el departamento.');

  if (!['en-linea', 'contraentrega', 'en-tienda'].includes(d['metodo'])) throw new ErrorPedido('Método de pago no válido.');

  if (!Array.isArray(d['items']) || d['items'].length === 0 || d['items'].length > 30) throw new ErrorPedido('El carrito está vacío.');
  const items = d['items'].map((i: any) => {
    const cantidad = Number(i?.cantidad);
    if (typeof i?.productoId !== 'string' || !/^[A-Za-z0-9]{1,40}$/.test(i.productoId)) throw new ErrorPedido('Producto no válido.');
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_POR_PRODUCTO) throw new ErrorPedido('Cantidad no válida.');
    return { productoId: i.productoId, opcion: typeof i.opcion === 'string' ? i.opcion.slice(0, 80) : null, cantidad };
  });

  return { cliente, entrega, items, metodo: d['metodo'] };
}

// ---------------------------------------------------------------------------
// Precios e inventario
// ---------------------------------------------------------------------------

export function stockDe(producto: Producto, opcion: string | null): number | null {
  if (!producto.controlStock) return null;
  if (!producto.opciones?.length) return producto.stock ?? 0;
  return producto.opciones.find(o => o.nombre === opcion)?.stock ?? 0;
}

/**
 * Arma los ítems con los precios del catálogo y comprueba que haya existencias.
 * Junta las líneas repetidas del mismo producto y opción.
 */
export function prepararItems(
  solicitados: SolicitudPedido['items'],
  productos: Map<string, Producto | undefined>,
): { items: ItemPedido[]; subtotal: number; descuentos: Descuento[] } {
  const agrupados = new Map<string, { productoId: string; opcion: string | null; cantidad: number }>();
  for (const s of solicitados) {
    const clave = `${s.productoId}|${s.opcion ?? ''}`;
    const previo = agrupados.get(clave);
    agrupados.set(clave, { ...s, cantidad: (previo?.cantidad ?? 0) + s.cantidad });
  }

  const items: ItemPedido[] = [];
  const descuentos: Descuento[] = [];
  for (const { productoId, opcion, cantidad } of agrupados.values()) {
    const producto = productos.get(productoId);
    if (!producto || !producto.visible || producto.agotado) throw new ErrorPedido('Un producto de tu carrito ya no está disponible.');

    let precio: number;
    let agotada = false;
    if (producto.opciones?.length) {
      const encontrada = producto.opciones.find(o => o.nombre === opcion);
      if (!encontrada) throw new ErrorPedido(`La opción "${opcion}" de ${producto.nombre} ya no existe.`);
      precio = encontrada.precio;
      agotada = !!encontrada.agotado;
    } else {
      if (opcion) throw new ErrorPedido(`${producto.nombre} ya no tiene opciones.`);
      precio = producto.precio;
    }
    const nombre = opcion ? `${producto.nombre} (${opcion})` : producto.nombre;
    if (agotada) throw new ErrorPedido(`${nombre} está agotado.`);
    if (!(Number.isFinite(precio) && precio > 0)) throw new ErrorPedido(`${producto.nombre} no tiene un precio válido.`);

    const stock = stockDe(producto, opcion);
    if (stock !== null) {
      if (stock <= 0) throw new ErrorPedido(`${nombre} se acaba de agotar.`);
      if (cantidad > stock) throw new ErrorPedido(`Solo quedan ${stock} unidad(es) de ${nombre}.`);
      descuentos.push({ productoId, opcion, cantidad });
    }
    items.push({ productoId, nombre: producto.nombre, opcion, precio, cantidad });
  }

  const subtotal = items.reduce((total, i) => total + i.precio * i.cantidad, 0);
  return { items, subtotal, descuentos };
}

/**
 * Aplica cambios de stock (negativos al vender, positivos al devolver) a un producto.
 * Devuelve los campos a guardar y el stock resultante de cada opción tocada.
 */
export function moverStock(
  producto: Producto,
  cambios: { opcion: string | null; delta: number }[],
): { campos: Partial<Producto>; resultados: { opcion: string | null; delta: number; stockResultante: number }[] } {
  const resultados: { opcion: string | null; delta: number; stockResultante: number }[] = [];
  if (producto.opciones?.length) {
    const opciones = producto.opciones.map(o => ({ ...o }));
    for (const { opcion, delta } of cambios) {
      const o = opciones.find(x => x.nombre === opcion);
      if (!o) continue; // La opción ya no existe: no hay a dónde devolver.
      o.stock = Math.max(0, (o.stock ?? 0) + delta);
      resultados.push({ opcion, delta, stockResultante: o.stock });
    }
    return { campos: { opciones }, resultados };
  }
  let stock = producto.stock ?? 0;
  for (const { delta } of cambios) {
    stock = Math.max(0, stock + delta);
    resultados.push({ opcion: null, delta, stockResultante: stock });
  }
  return { campos: { stock }, resultados };
}
