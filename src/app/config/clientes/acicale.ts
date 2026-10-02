import { ConfigCliente } from '../cliente.model';
import { BARBERCALI } from './barbercali';

export const ACICALE: ConfigCliente = {
  id: 'acicale',
  nombre: 'El Acicale',
  marca: { texto: 'EL ACICALE', destacado: '' },
  logo: 'acicale_logo.jpg',
  favicon: 'acicale_logo.jpg',
  descripcion: 'Barbería',
  hero: {
    imagen: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
    titulo: 'El arte de',
    tituloDestacado: 'acicalarte',
    subtitulo: 'Cortes, barba y color con asesoría personalizada. Un espacio pensado para que salgas impecable.',
    logo: 'el_acicale_transparente.png',
    // TODO: confirmar la frase con el cliente (en español lleva el signo de apertura ¡).
    lema: '¡Energía, experiencia y calidad!',
  },
  instagram: { usuario: 'el_acicale__', url: 'https://www.instagram.com/el_acicale__' },
  // TODO: pedir el número de WhatsApp de la barbería.
  whatsapp: undefined,
  reels: [
    'https://www.instagram.com/reel/DXNJ4C6Jr9T/',
    'https://www.instagram.com/reel/DbmG08EpQgU/',
    'https://www.instagram.com/reel/Dd1v1U0pJle/',
    'https://www.instagram.com/reel/DdadqHzsa8_/',
    'https://www.instagram.com/reel/DcAZctMujlD/',
    'https://www.instagram.com/reel/DV-FKHljKZx/',
    'https://www.instagram.com/reel/DSa4V5yiU3b/',
  ],
  equipo: [
    { nombre: 'Jose Julian', rol: 'CEO & Barbero', instagram: 'josejulian_barbero', foto: 'jjulian.jpg', fotoPosicion: '52% 42%', fotoZoom: 1.7 },
    { nombre: 'Juan Sebastián Hoyos', apodo: 'Trip', rol: 'Barbero', instagram: 'triip_barbero', foto: 'triip.jpg', fotoPosicion: '40% center' },
  ],
  ubicacion: {
    nombre: 'Barbería El Acicale',
    direccion: 'Cl. 68 Nte. #4a - 52, Calima, Cali, Valle del Cauca',
    zona: 'Calima, Cali',
    mapaEmbedUrl: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3982.4360379710433!2d-76.50302802472544!3d3.485967896488413!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8e30a912971fb479%3A0x171de41347ba5586!2sBarber%C3%ADa%20El%20Acicale!5e0!3m2!1ses-419!2sco!4v1790731941348!5m2!1ses-419!2sco',
    mapaUrl: 'https://www.google.com/maps?cid=1665738208655857030',
  },
  // TODO: confirmar el horario con el cliente (hoy es el mismo de BarberCali).
  horario: { apertura: 10 * 60, cierre: 20 * 60, diasCerrados: [0] },
  // Precios de su plataforma actual. Las descripciones venían recortadas en la captura: confirmarlas.
  catalogo: [
    { nombre: 'Acicale sencillo', descripcion: 'Corte sencillo con asesoría o guía personalizada.', duracionMinutos: 40, precio: 30000, categoria: 'Cortes', destacado: true, icono: 'tijeras' },
    { nombre: 'Barba2', descripcion: 'Corte sencillo más barba, con asesoría o guía personalizada.', duracionMinutos: 60, precio: 40000, categoria: 'Cortes', destacado: true, icono: 'barba' },
    { nombre: 'Acicale Premium', descripcion: 'Un servicio completo, con asesoría personalizada.', duracionMinutos: 60, precio: 60000, categoria: 'Cortes', destacado: true, icono: 'diamante' },
    { nombre: 'Total color', descripcion: 'Trabajo de colorimetría global de un solo tono.', duracionMinutos: 300, precio: 300000, precioDesde: true, categoria: 'Color cabello', destacado: false, icono: 'color' },
  ],
  // Sin reseñas hasta tener reseñas reales del negocio.
  resenas: undefined,
  // TODO: pedir al cliente razón social, NIT y un correo para datos personales. Mientras tanto la
  // política usa el nombre comercial y los canales de contacto que ya hay (dirección e Instagram).
  legal: {
    razonSocial: undefined,
    nit: undefined,
    correo: undefined,
    vigenteDesde: '30 de septiembre de 2026',
  },
  // TODO: pedir la URL de la página de cursos. Mientras tanto el botón lleva al Instagram de Jose Julian.
  cursos: {
    url: 'https://www.instagram.com/josejulian_barbero',
    titulo: 'Aprende barbería con Jose Julian',
    descripcion: 'Cursos para barberos que quieren subir de nivel: técnica, visagismo, color y cómo convertir tu talento en negocio.',
    textoBoton: 'Ver cursos',
    imagen: 'jjulian.jpg',
  },
  tema: {
    // Blanco y negro como el logo, con acento plateado.
    acento: {
      50: '250 250 250', 100: '244 244 245', 200: '240 240 242', 300: '235 235 238', 400: '228 228 231',
      500: '212 212 216', 600: '190 190 197', 700: '82 82 91', 800: '63 63 70', 900: '39 39 42',
    },
    // Un toque de dorado para los detalles (pedido del cliente), sin cambiar el blanco y negro.
    detalle: { 200: '240 222 172', 300: '228 201 138', 400: '212 176 102', 500: '194 154 78', 600: '160 122 56' },
    sobreAcento: '10 10 10',
    fuenteDisplay: 'Cinzel, Georgia, serif',
    fuenteUrl: 'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800;900&display=swap',
  },
  // TODO: crear un proyecto de Firebase propio para El Acicale. Mientras tanto usa el de BarberCali,
  // así que comparten servicios, barberos y citas.
  firebase: BARBERCALI.firebase,
  // Clave pública de reCAPTCHA Enterprise "ElAcicale", limitada a barbercali-db2.web.app y barbercali-db2.firebaseapp.com.
  // Si se conecta un dominio propio, agrégalo a la clave (Google Cloud → reCAPTCHA) o App Check dejará de funcionar ahí.
  appCheckSiteKey: '6LcOrtotAAAAACeTK09tTrYhKmr_dZOAGAjmazQV',
  adminEmail: BARBERCALI.adminEmail,
};
