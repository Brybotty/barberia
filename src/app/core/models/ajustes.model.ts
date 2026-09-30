import { CLIENTE } from '../../config/cliente';

/** Configuración de la tienda que el admin cambia desde el panel (documento `ajustes/sitio`). */
export interface AjustesTienda {
  /** Muestra la tienda en el menú y el inicio. */
  activa: boolean;
  entrega: {
    /** Recoger en la barbería (gratis). */
    recoger: boolean;
    /** Domicilio dentro de la ciudad de la barbería. */
    local: { activo: boolean; costo: number };
    /** Envío a otras ciudades por transportadora. */
    nacional: { activo: boolean; costo: number };
    /** Envío gratis desde este subtotal. 0 = nunca. */
    gratisDesde: number;
  };
  pagos: {
    /** Pago en línea con Wompi. Requiere desplegar las Cloud Functions (ver README). */
    enLinea: boolean;
    /** Pagar al recibir (solo domicilio en la ciudad). */
    contraentrega: boolean;
    /** Pagar al recoger en la barbería. */
    enTienda: boolean;
  };
}

/** Botón y sección de cursos: llevan a la página externa donde el barbero vende sus cursos. */
export interface AjustesCursos {
  activo: boolean;
  url: string;
  titulo: string;
  descripcion: string;
  textoBoton: string;
}

export interface AjustesSitio {
  tienda: AjustesTienda;
  cursos: AjustesCursos;
}

export function ajustesPorDefecto(): AjustesSitio {
  return {
    tienda: {
      activa: !!CLIENTE.tienda,
      entrega: {
        recoger: true,
        local: { activo: true, costo: 8000 },
        nacional: { activo: false, costo: 15000 },
        gratisDesde: 0,
      },
      pagos: { enLinea: false, contraentrega: true, enTienda: true },
    },
    cursos: {
      activo: !!CLIENTE.cursos,
      url: CLIENTE.cursos?.url ?? '',
      titulo: CLIENTE.cursos?.titulo ?? 'Aprende con nosotros',
      descripcion: CLIENTE.cursos?.descripcion ?? '',
      textoBoton: CLIENTE.cursos?.textoBoton ?? 'Ver cursos',
    },
  };
}

/** Completa lo que falte en el documento guardado con los valores por defecto. */
export function conDefectos(guardado: Partial<AjustesSitio> | undefined): AjustesSitio {
  const base = ajustesPorDefecto();
  const tienda = guardado?.tienda;
  return {
    tienda: {
      ...base.tienda,
      ...tienda,
      entrega: {
        ...base.tienda.entrega,
        ...tienda?.entrega,
        local: { ...base.tienda.entrega.local, ...tienda?.entrega?.local },
        nacional: { ...base.tienda.entrega.nacional, ...tienda?.entrega?.nacional },
      },
      pagos: { ...base.tienda.pagos, ...tienda?.pagos },
    },
    cursos: { ...base.cursos, ...guardado?.cursos },
  };
}
