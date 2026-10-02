export interface Usuario {
  uid: string;
  nombre: string;
  /** Correo de la cuenta. Las cuentas creadas con el celular no tienen. */
  email?: string;
  rol: 'admin' | 'barbero' | 'cliente';
  telefono?: string;
  /** Cuándo autorizó el tratamiento de datos (al iniciar sesión por primera vez). */
  politicaAceptadaEn?: string;
}
