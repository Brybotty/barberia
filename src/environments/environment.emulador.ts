export const environment = {
  /** Conecta Firestore al emulador local con los datos de la demo (npm run demo). */
  emuladores: true,
  /**
   * El inicio de sesión es con Google real (cuentas de verdad); solo los datos van a los emuladores.
   * Los emuladores aceptan el token de Google sin verificarlo contra el proyecto de demo.
   */
  authEmulador: false,
};
