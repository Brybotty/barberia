import { ConfigCliente } from '../cliente.model';

export const ACICALE: ConfigCliente = {
  id: 'acicale',
  nombre: 'El Acicale',
  marca: { texto: 'EL ACICALE', destacado: '' },
  // La "A" del logo sobre negro: a 40 px el nombre no se leería, y va escrito al lado.
  logo: 'marca.png',
  simbolo: 'simbolo-acicale.webp',
  favicon: 'favicon.ico',
  descripcion: 'Barbería',
  fotoLocal: 'fotos/local.webp',
  firma: { texto: 'Bravik' },
  hero: {
    imagen: 'fotos/local.webp',
    titulo: 'El arte de',
    tituloDestacado: 'acicalarte',
    subtitulo: 'Cortes y barba con asesoría personalizada. Un espacio pensado para que salgas impecable.',
    logo: 'logo-el-acicale.webp',
    // TODO: confirmar la frase con el cliente (en español lleva el signo de apertura ¡).
    lema: '¡Energía, experiencia y calidad!',
  },
  instagram: { usuario: 'el_acicale__', url: 'https://www.instagram.com/el_acicale__' },
  // WhatsApp de la barbería (+57 315 322 9528): botón de la barra del celular, "Avisar por WhatsApp" del comprobante
  // y contacto de la política de datos.
  whatsapp: '573153229528',
  reels: [
    'https://www.instagram.com/reel/DXNJ4C6Jr9T/',
    'https://www.instagram.com/reel/DbmG08EpQgU/',
    'https://www.instagram.com/reel/Dd1v1U0pJle/',
    'https://www.instagram.com/reel/DdadqHzsa8_/',
    'https://www.instagram.com/reel/DcAZctMujlD/',
    'https://www.instagram.com/reel/DV-FKHljKZx/',
    'https://www.instagram.com/reel/DSa4V5yiU3b/',
  ],
  // Equipo inicial (se carga a Firestore desde Admin → Staff & Barberos; la página lee Firestore).
  equipo: [
    { nombre: 'Jose Julian', rol: 'CEO & Barbero', instagram: 'josejulian_barbero', foto: 'fotos/jose-julian.webp' },
    { nombre: 'Juan Sebastián Hoyos', apodo: 'Trip', rol: 'Barbero', instagram: 'triip_barbero', foto: 'fotos/trip.webp' },
  ],
  ubicacion: {
    nombre: 'Barbería El Acicale',
    direccion: 'Cl. 68 Nte. #4a - 52, Calima, Cali, Valle del Cauca',
    zona: 'Calima, Cali',
    mapaEmbedUrl: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3982.4360379710433!2d-76.50302802472544!3d3.485967896488413!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8e30a912971fb479%3A0x171de41347ba5586!2sBarber%C3%ADa%20El%20Acicale!5e0!3m2!1ses-419!2sco!4v1790731941348!5m2!1ses-419!2sco',
    mapaUrl: 'https://www.google.com/maps?cid=1665738208655857030',
  },
  // Lunes a jueves desde las 9:20 a. m.; viernes y sábado desde las 9:00 a. m.; se cierra a las 7:40 p. m.
  // Turnos cada 40 minutos desde la apertura (ver INTERVALO en core/utils/horario.ts).
  // El admin lo cambia en Admin → Ajustes sin tocar el código.
  horario: { apertura: 9 * 60 + 20, cierre: 19 * 60 + 40, aperturas: { 5: 9 * 60, 6: 9 * 60 }, diasCerrados: [0] },
  // Precios de su plataforma actual. Las descripciones venían recortadas en la captura: confirmarlas.
  catalogo: [
    { nombre: 'Acicale sencillo', descripcion: 'Corte sencillo con asesoría o guía personalizada.', duracionMinutos: 40, precio: 30000, categoria: 'Cortes', destacado: true, icono: 'tijeras' },
    { nombre: 'Barba2', descripcion: 'Corte sencillo más barba, con asesoría o guía personalizada.', duracionMinutos: 60, precio: 40000, categoria: 'Cortes', destacado: true, icono: 'barba' },
    { nombre: 'Acicale Premium', descripcion: 'Un servicio completo, con asesoría personalizada.', duracionMinutos: 60, precio: 60000, categoria: 'Cortes', destacado: true, icono: 'diamante' },
  ],
  // Sin reseñas hasta tener reseñas reales del negocio.
  resenas: undefined,
  // TODO: pedir al cliente razón social, NIT y un correo para datos personales. Mientras tanto la
  // política usa el nombre comercial y los canales de contacto que ya hay (dirección e Instagram).
  legal: {
    razonSocial: undefined,
    nit: undefined,
    correo: undefined,
    vigenteDesde: '11 de octubre de 2026',
  },
  // TODO: pedir la URL de la página de cursos. Mientras tanto el botón lleva al Instagram de Jose Julian.
  cursos: {
    url: 'https://www.instagram.com/josejulian_barbero',
    titulo: 'Aprende barbería con Jose Julian',
    descripcion: 'Cursos para barberos que quieren subir de nivel: técnica, visagismo y cómo convertir tu talento en negocio.',
    textoBoton: 'Ver cursos',
    imagen: 'fotos/jose-en-el-local.webp',
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
    // Cinzel va dentro de la página (ver styles.scss): no se pide a Google Fonts.
    fuenteDisplay: '"Cinzel Variable", Cinzel, Georgia, serif',
  },
  // Proyecto de Firebase de El Acicale (se llama barbercali-db2 por el nombre original de la plantilla).
  // Estas claves son públicas por diseño: lo que protege los datos son las reglas, App Check y la restricción
  // de la llave a los dominios de la página.
  firebase: {
    apiKey: 'AIzaSyDeCesctu_58zq2OMgLZ86W4_v4iZ-XMYE',
    // El dominio propio, para que la ventana de Google diga elacicale.com. Necesita la URI
    // https://elacicale.com/__/auth/handler en el cliente OAuth y el dominio en Auth (ambos hechos).
    authDomain: 'elacicale.com',
    projectId: 'barbercali-db2',
    storageBucket: 'barbercali-db2.firebasestorage.app',
    messagingSenderId: '870552898429',
    appId: '1:870552898429:web:f4fca6db222e0b99741a14',
  },
  // Clave pública de reCAPTCHA Enterprise "ElAcicale", limitada a elacicale.com, barbercali-db2.web.app y
  // barbercali-db2.firebaseapp.com. Un dominio nuevo hay que agregarlo a la clave o App Check dejará de funcionar ahí.
  appCheckSiteKey: '6LcOrtotAAAAACeTK09tTrYhKmr_dZOAGAjmazQV',
  adminEmail: 'ortizgonzalesbryanalexander1@gmail.com',
};
