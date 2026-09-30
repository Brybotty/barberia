import { ConfigCliente } from '../cliente.model';

export const BARBERCALI: ConfigCliente = {
  id: 'barbercali',
  nombre: 'BarberCali',
  marca: { texto: 'BARBER', destacado: 'CALI' },
  favicon: 'favicon.ico',
  descripcion: 'Barbería, Peluquería y Tienda',
  hero: {
    imagen: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
    titulo: 'Tu estilo,',
    tituloDestacado: 'en manos expertas',
    subtitulo: 'Cortes, barba y cuidado personal con diagnóstico técnico y asesoría de imagen personalizada.',
  },
  instagram: { usuario: 'isazabarber', url: 'https://www.instagram.com/isazabarber' },
  whatsapp: '573217141454',
  reels: [
    'https://www.instagram.com/reel/DdFFMoMOii1/',
    'https://www.instagram.com/reel/DQhhuK9EdC6/',
    'https://www.instagram.com/reel/DLSJAg4gi5o/',
  ],
  equipo: [],
  ubicacion: {
    nombre: 'Barbería y Tatuajes Isaza',
    direccion: 'Barrio Granada, Cali, Colombia',
    zona: 'Granada, Cali',
    mapaEmbedUrl: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3982.555756237147!2d-76.54098605469164!3d3.4575777875632765!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8e30a7ccf037662f%3A0x69f52b66c9c95e30!2sBARBERIA%20Y%20TATUAJES%20ISAZA%20Granada%20cali!5e0!3m2!1ses-419!2sco!4v1790666054171!5m2!1ses-419!2sco',
    mapaUrl: 'https://maps.google.com/?q=BARBERIA+Y+TATUAJES+ISAZA+Granada+cali',
  },
  horario: { apertura: 10 * 60, cierre: 20 * 60, diasCerrados: [0] },
  catalogo: [
    { nombre: 'CORTE + BARBA', descripcion: 'Corte de cabello + arreglo de barba, con diagnóstico técnico y asesoría personalizada.', duracionMinutos: 90, precio: 110000, categoria: 'Combos', destacado: true, icono: 'poste' },
    { nombre: 'CORTE + BARBA + LIMPIEZA FACIAL', descripcion: 'Corte de cabello + arreglo de barba + limpieza facial profunda.', duracionMinutos: 120, precio: 150000, categoria: 'Combos', destacado: false, icono: 'corona' },
    { nombre: 'CORTE', descripcion: 'Corte de cabello con diagnóstico técnico y asesoría personalizada para encontrar tu estilo.', duracionMinutos: 60, precio: 57000, categoria: 'Cabello', destacado: true, icono: 'tijeras' },
    { nombre: 'CORTE NIÑO', descripcion: 'Corte de cabello para niños adaptado a su edad y personalidad.', duracionMinutos: 60, precio: 57000, categoria: 'Cabello', destacado: false, icono: 'peine' },
    { nombre: 'BARBA', descripcion: 'Arreglo de barba con diagnóstico técnico y asesoría para el mejor perfilado.', duracionMinutos: 40, precio: 55000, categoria: 'Barba', destacado: true, icono: 'barba' },
  ],
  // TODO: razón social, NIT y correo para la política de datos.
  legal: { vigenteDesde: '30 de septiembre de 2026' },
  resenas: {
    calificacion: '4.9',
    items: [
      { autor: 'Mateo Gómez', color: 'bg-indigo-500', texto: 'Excelente servicio. Luis y Harrison son unos duros para los cortes y el ambiente del local es espectacular. Muy recomendado.' },
      { autor: 'Andrés Felipe', color: 'bg-emerald-500', texto: 'La mejor barbería de Granada. La atención es de primera y siempre salgo contento con el resultado.' },
      { autor: 'Carlos Valencia', color: 'bg-rose-500', texto: 'Fui por primera vez a tatuarme y hacerme un corte, todo impecable, limpio y profesional. Volveré sin duda.' },
    ],
  },
  tema: {
    // amber de Tailwind (dorado)
    acento: {
      50: '255 251 235', 100: '254 243 199', 200: '253 230 138', 300: '252 211 77', 400: '251 191 36',
      500: '245 158 11', 600: '217 119 6', 700: '180 83 9', 800: '146 64 14', 900: '120 53 15',
    },
    sobreAcento: '255 255 255',
    fuenteDisplay: '"Plus Jakarta Sans", Inter, sans-serif',
  },
  firebase: {
    apiKey: 'AIzaSyDeCesctu_58zq2OMgLZ86W4_v4iZ-XMYE',
    authDomain: 'barbercali-db2.firebaseapp.com',
    projectId: 'barbercali-db2',
    storageBucket: 'barbercali-db2.firebasestorage.app',
    messagingSenderId: '870552898429',
    appId: '1:870552898429:web:f4fca6db222e0b99741a14',
  },
  adminEmail: 'ortizgonzalesbryanalexander1@gmail.com',
};
