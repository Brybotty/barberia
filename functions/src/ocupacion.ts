/**
 * Ocupación de la agenda de cada barbero, al minuto (de 5 en 5): un documento por barbero y día,
 * `ocupacion/{barberoId}_{dia}`, con `mapa` (288 caracteres: '0' libre, 'c' una cita, una letra por cada motivo de
 * cierre) y `citas` ({citaId: [primeraMarca, marcas]}). Sin base de datos: lo que se escribe está en
 * agenda-recurrente.ts.
 *
 * Debe coincidir con la página: src/app/core/utils/ocupacion.ts (y las reglas de `ocupacion` en firestore.rules).
 */

export const MARCA = 5;
export const MARCAS_DIA = 1440 / MARCA;
export const LIBRE = '0';
export const CITA = 'c';

const MOTIVOS = ['Descanso', 'Almuerzo', 'Permiso', 'Vacaciones', 'Otro'];
const LETRA_DE_MOTIVO: Record<string, string> = { '': 'X', Descanso: 'D', Almuerzo: 'A', Permiso: 'P', Vacaciones: 'V', Otro: 'O' };

export interface Ocupacion {
  barberoId: string;
  dia: string;
  mapa: string;
  citas: Record<string, [number, number]>;
}

/** Lo que se usa de una cita para armar el mapa de su día. */
export interface CitaParaMapa {
  id: string;
  barberoId?: string;
  dia?: string;
  hora?: string;
  /** '2:30 PM': las citas de antes podían no traer `hora` (como minutosDeCita en la página). */
  horaStr?: string;
  duracionMinutos?: number;
  estado?: string;
}

export function idOcupacion(barberoId: string, dia: string): string {
  return `${barberoId}_${dia}`;
}

export function mapaVacio(): string {
  return LIBRE.repeat(MARCAS_DIA);
}

/** Acepta '14:30', '9:30', '2:30 PM' o '1430', como parsearHora en la página. Minutos desde medianoche, o null. */
export function aMinutos(texto: string | undefined): number | null {
  const limpio = texto?.trim().replace(/^(\d{2})(\d{2})$/, '$1:$2');
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(limpio ?? '');
  if (!m) return null;
  let h = Number(m[1]);
  const minutos = Number(m[2]);
  const ampm = m[3]?.toUpperCase();
  if (minutos > 59) return null;
  if (ampm) {
    if (h < 1 || h > 12) return null;
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
  } else if (h > 23) {
    return null;
  }
  return h * 60 + minutos;
}

/** Marcas que ocupa un rato: [primera, cuántas]. 10:00 por 25 min -> [120, 5]. */
export function tramo(inicio: number, duracion: number): [number, number] {
  return [Math.floor(inicio / MARCA), Math.ceil(duracion / MARCA)];
}

/** ¿Están libres esas marcas? (sin salirse del día). */
export function tramoLibre(mapa: string, k: number, n: number): boolean {
  return k >= 0 && n > 0 && k + n <= MARCAS_DIA && /^0+$/.test(mapa.slice(k, k + n));
}

/** ¿Hay algo cerrado por el barbero en esas marcas? (para decir por qué no se pudo agendar). */
export function tieneCierre(mapa: string, k: number, n: number): boolean {
  return [...mapa.slice(k, k + n)].some(m => m !== LIBRE && m !== CITA);
}

export function ocupar(mapa: string, k: number, n: number): string {
  return mapa.slice(0, k) + CITA.repeat(n) + mapa.slice(k + n);
}

/** Suelta las marcas de cita de un tramo (un cierre que hubiera ahí se queda). */
export function liberar(mapa: string, k: number, n: number): string {
  return mapa.slice(0, k) + mapa.slice(k, k + n).replace(/c/g, LIBRE) + mapa.slice(k + n);
}

/** Cierra lo libre entre dos marcas con la letra del motivo (como `cerrar` en la página). */
export function cerrar(mapa: string, desde: number, hasta: number, motivo: string): string {
  const letra = LETRA_DE_MOTIVO[MOTIVOS.includes(motivo) ? motivo : ''];
  return mapa.slice(0, desde) + mapa.slice(desde, hasta).replace(/0/g, letra) + mapa.slice(hasta);
}

const ACTIVAS = ['pendiente', 'confirmada'];

/**
 * El día de un barbero armado con lo que había antes de que existiera su documento: sus citas activas (con su hora
 * y su duración exactas) y los cierres de la agenda vieja (documentos de `slots` con `bloqueo`). Esos cierres duraban
 * 20 minutos; los de antes del 2026-10-12, 30 (van a y media, o en punto sin el de "y 20" al lado: ante la duda se
 * cierra de más, nunca de menos). Igual que armarOcupacion en src/app/core/utils/ocupacion.ts.
 */
export function armarOcupacion(barberoId: string, dia: string, citas: CitaParaMapa[], cierresViejos: { hora?: string; motivo?: string }[]): Ocupacion {
  let mapa = mapaVacio();
  const ocupadas: Record<string, [number, number]> = {};
  for (const c of citas) {
    if (c.barberoId !== barberoId || c.dia !== dia || !ACTIVAS.includes(c.estado ?? '')) continue;
    const inicio = aMinutos(c.hora) ?? aMinutos(c.horaStr);
    if (inicio === null) continue;
    const [k, n] = tramo(inicio, c.duracionMinutos && c.duracionMinutos > 0 ? c.duracionMinutos : 40);
    if (k < 0 || n <= 0 || k + n > MARCAS_DIA) continue;
    mapa = ocupar(mapa, k, n);
    ocupadas[c.id] = [k, n];
  }
  const horas = new Set(cierresViejos.map(s => aMinutos(s.hora)).filter((m): m is number => m !== null));
  for (const s of cierresViejos) {
    const inicio = aMinutos(s.hora);
    if (inicio === null) continue;
    const minuto = inicio % 60;
    const duracion = minuto === 30 || (minuto === 0 && !horas.has(inicio + 20)) ? 30 : 20;
    const [k, n] = tramo(inicio, duracion);
    mapa = cerrar(mapa, k, Math.min(MARCAS_DIA, k + n), s.motivo ?? '');
  }
  return { barberoId, dia, mapa, citas: ocupadas };
}
