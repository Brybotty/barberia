export interface Barbero {
  id?: string;
  nombre: string;
  especialidad: string;
  avatar: string;
  /** Email (en minúsculas) de la cuenta de Google del barbero. Enlaza este perfil con su usuario. */
  emailAsociado: string;
  /** Porcentaje de cada servicio que gana el barbero (0 a 100). Sin definir: 100 (p. ej. el dueño). */
  comision?: number | null;
}

export function avatarDe(barbero: Pick<Barbero, 'avatar' | 'nombre'>): string {
  return (
    barbero.avatar ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(barbero.nombre)}&background=f59e0b&color=000`
  );
}
