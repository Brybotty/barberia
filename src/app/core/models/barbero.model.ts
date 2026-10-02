/** Lo que ve cualquiera en la página (`barberos/{id}`): nada personal. */
export interface BarberoPublico {
  id?: string;
  nombre: string;
  especialidad: string;
  avatar: string;
}

/** Datos privados (`barberosPrivado/{id}`, mismo id): solo los lee el admin y el propio barbero. */
export interface DatosPrivadosBarbero {
  /** Email (en minúsculas) de la cuenta del barbero. Enlaza este perfil con su usuario. */
  emailAsociado: string;
  /** Porcentaje de cada servicio que gana el barbero (0 a 100). Sin definir: 100 (p. ej. el dueño). */
  comision?: number | null;
}

/** Perfil completo: lo que ven el admin y el propio barbero. */
export interface Barbero extends BarberoPublico, DatosPrivadosBarbero {}

export function avatarDe(barbero: Pick<BarberoPublico, 'avatar' | 'nombre'>): string {
  return (
    barbero.avatar ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(barbero.nombre)}&background=f59e0b&color=000`
  );
}
