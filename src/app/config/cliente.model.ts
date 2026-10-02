import { FirebaseOptions } from '@angular/fire/app';
import { Servicio } from '../core/models/servicio.model';

/** Escala de color como canales RGB separados por espacio ('245 158 11'), para usar con opacidad en Tailwind. */
export type Paleta = Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900, string>;

/** Color de detalle (toques sutiles: etiquetas, líneas, insignias). Mismo formato RGB que Paleta. */
export type PaletaDetalle = Record<200 | 300 | 400 | 500 | 600, string>;

export interface MiembroEquipo {
  nombre: string;
  apodo?: string;
  rol: string;
  /** Usuario de Instagram, sin '@'. */
  instagram?: string;
  /** Ruta en /public. */
  foto?: string;
  /** Punto de la foto que se mantiene a la vista (CSS object-position / transform-origin), p. ej. '40% center'. */
  fotoPosicion?: string;
  /** Acercamiento de la foto (1 = sin zoom), útil si la persona sale pequeña. */
  fotoZoom?: number;
}

export interface Resena {
  autor: string;
  texto: string;
  /** Clase de Tailwind para el círculo con la inicial. */
  color: string;
}

export interface HorarioAtencion {
  /** Minutos desde medianoche (10:00 -> 600). */
  apertura: number;
  cierre: number;
  /** 0 = domingo ... 6 = sábado. */
  diasCerrados: number[];
}

/** Todo lo que cambia de una barbería a otra. */
export interface ConfigCliente {
  id: string;
  nombre: string;
  /** Nombre en el header: `texto` normal y `destacado` en color de acento. */
  marca: { texto: string; destacado: string };
  /** Ruta en /public. Si no hay, se muestra solo el nombre. */
  logo?: string;
  favicon: string;
  descripcion: string;
  hero: {
    imagen: string;
    titulo: string;
    /** Segunda línea del título, resaltada. */
    tituloDestacado: string;
    subtitulo: string;
    /** Logo grande del inicio (PNG transparente en /public). Si existe, reemplaza al título. */
    logo?: string;
    /** Frase bajo el logo del inicio (ej. '¡Energía, experiencia y calidad!'). */
    lema?: string;
  };
  instagram: { usuario: string; url: string };
  /** Número con indicativo y sin '+' (ej. 573001234567). Sin número se oculta el botón de WhatsApp. */
  whatsapp?: string;
  /** URLs de reels de Instagram para la galería del inicio. */
  reels: string[];
  equipo: MiembroEquipo[];
  ubicacion?: {
    nombre: string;
    direccion: string;
    /** Barrio y ciudad, para textos cortos (ej. 'Calima, Cali'). */
    zona: string;
    mapaEmbedUrl: string;
    mapaUrl: string;
  };
  horario: HorarioAtencion;
  /** Catálogo inicial. El admin lo carga en Firestore desde "Servicios & Precios" cuando la colección está vacía. */
  catalogo: Servicio[];
  resenas?: { calificacion: string; items: Resena[] };
  /** Datos del responsable del tratamiento de datos (página /politica-de-datos). */
  legal: {
    /** Razón social o nombre del titular del negocio. Sin ella se usa `nombre`. */
    razonSocial?: string;
    /** NIT o cédula del responsable. */
    nit?: string;
    /** Correo para consultas y reclamos sobre datos personales. */
    correo?: string;
    /** Fecha desde la que rige la política (texto, ej. '30 de septiembre de 2026'). */
    vigenteDesde: string;
  };
  /** Valores iniciales de la sección de cursos. El admin los cambia en Admin → Ajustes. */
  cursos?: {
    url: string;
    titulo: string;
    descripcion: string;
    textoBoton: string;
    /** Foto de fondo del banner (ruta en /public). */
    imagen?: string;
  };
  tema: {
    acento: Paleta;
    /** Color de detalle; si falta se usa el de acento. El Acicale: dorado. */
    detalle?: PaletaDetalle;
    /** Color del texto sobre botones de acento (RGB). */
    sobreAcento: string;
    fuenteDisplay: string;
    /** Hoja de Google Fonts para fuenteDisplay, si no es la fuente base. */
    fuenteUrl?: string;
  };
  /** Cada cliente debería tener su propio proyecto de Firebase. */
  firebase: FirebaseOptions;
  /**
   * Clave de sitio (pública) de reCAPTCHA Enterprise, de tipo "por puntaje", para App Check.
   * Sin ella la página no usa App Check. Debe permitir solo los dominios de la página.
   */
  appCheckSiteKey?: string;
  /** Cuenta que recibe el rol 'admin'. Debe coincidir con esEmailAdmin() en firestore.rules. */
  adminEmail: string;
}
