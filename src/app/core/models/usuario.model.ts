export interface Usuario {
  uid: string;
  nombre: string;
  email: string;
  rol: 'admin' | 'barbero' | 'cliente';
  telefono?: string;
  /** Cuándo autorizó el tratamiento de datos (al iniciar sesión por primera vez). */
  politicaAceptadaEn?: string;
}
