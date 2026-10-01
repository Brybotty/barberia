import { CLIENTE } from '../../config/cliente';

/** Botón y sección de cursos: llevan a la página externa donde el barbero vende sus cursos. */
export interface AjustesCursos {
  activo: boolean;
  url: string;
  titulo: string;
  descripcion: string;
  textoBoton: string;
}

/** Configuración que el admin cambia desde el panel (documento `ajustes/sitio`). */
export interface AjustesSitio {
  cursos: AjustesCursos;
}

export function ajustesPorDefecto(): AjustesSitio {
  return {
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
  return { cursos: { ...base.cursos, ...guardado?.cursos } };
}
