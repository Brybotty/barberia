import { Horario } from './horario';
import {
  MARCAS_DIA, abrir, armarOcupacion, cargaDe, cerrar, cierresDe, estaLibreEn, horariosDisponibles, liberar, mapaVacio, ocupar, sinCitas, tramo,
  turnosEncadenados,
} from './ocupacion';

// Horario fijo para que los tests no dependan del cliente activo: lunes a jueves desde las 9:20, viernes y sábado
// desde las 9:00, cierre a las 7:40 p. m. y un turno cada 40 minutos.
const horario: Horario = { apertura: 560, cierre: 1180, aperturas: { 5: 540, 6: 540 }, intervalo: 40, diasCerrados: [0], diasReservables: 14 };
const rato = (mapa: string, desde: number, hasta: number) => mapa.slice(desde / 5, hasta / 5);
const h12 = (minutos: number) => `${((Math.floor(minutos / 60) + 11) % 12) + 1}:${String(minutos % 60).padStart(2, '0')}`;

// Los mismos casos que functions/src/ocupacion.test.ts: la página y la función deben ver el mismo mapa.
describe('ocupación de la agenda (al minuto)', () => {
  it('el día tiene 288 marcas de 5 minutos y un rato ocupa las que le tocan', () => {
    expect(MARCAS_DIA).toBe(288);
    expect(mapaVacio().length).toBe(288);
    expect(tramo(600, 25)).toEqual([120, 5]);
    expect(tramo(560, 40)).toEqual([112, 8]);
  });

  it('un fijo de 25 min a las 9:20 deja libre las 9:45 en punto (sin tiempo muerto)', () => {
    const mapa = ocupar(mapaVacio(), ...tramo(560, 25));
    expect(rato(mapa, 560, 585)).toBe('ccccc');
    expect(estaLibreEn(mapa, 585, 40)).toBeTrue();
    expect(estaLibreEn(mapa, 580, 40)).toBeFalse();
    expect(estaLibreEn(mapa, 1420, 40)).toBeFalse(); // no se sale del día
  });

  it('soltar una cita no abre un cierre, y cerrar no pisa una cita', () => {
    let mapa = ocupar(mapaVacio(), ...tramo(600, 40));
    mapa = cerrar(mapa, 124, 136, 'Almuerzo'); // de 10:20 a 11:20
    expect(rato(mapa, 600, 680)).toBe('c'.repeat(8) + 'A'.repeat(8));
    mapa = liberar(mapa, ...tramo(600, 40));
    expect(rato(mapa, 600, 680)).toBe('0'.repeat(8) + 'A'.repeat(8));
    expect(rato(abrir(mapa, 0, MARCAS_DIA), 600, 680)).toBe('0'.repeat(16));
  });

  it('dice qué ratos cerró el barbero y por qué, y cuántas citas tiene', () => {
    let mapa = ocupar(mapaVacio(), ...tramo(600, 40));
    mapa = cerrar(mapa, ...[156, 168] as [number, number], 'Almuerzo');
    mapa = cerrar(mapa, 168, 180, 'Permiso');
    expect(cierresDe(mapa)).toEqual([
      { desde: 780, hasta: 840, motivo: 'Almuerzo' },
      { desde: 840, hasta: 900, motivo: 'Permiso' },
    ]);
    expect(cargaDe(mapa)).toBe(8);
  });

  it('al mover o volver a apartar, se suelta solo el rato de las citas elegidas', () => {
    const mapa = ocupar(ocupar(mapaVacio(), ...tramo(600, 40)), ...tramo(700, 40));
    const libre = sinCitas({ mapa, citas: { R1_20261017: tramo(600, 40), OTRA: tramo(700, 40) } }, id => id.startsWith('R1_'));
    expect(rato(libre, 600, 640)).toBe('0'.repeat(8));
    expect(rato(libre, 700, 740)).toBe('c'.repeat(8));
  });

  it('el día se arma con lo que había: citas activas exactas y cierres de la agenda vieja', () => {
    const dia = '2026-10-17';
    const cita = (id: string, barberoId: string, hora: string, duracionMinutos: number, estado: 'pendiente' | 'confirmada' | 'cancelada') =>
      ({ id, barberoId, dia, hora, horaStr: '', duracionMinutos, estado });
    const o = armarOcupacion('B', dia, [
      cita('A', 'B', '10:00', 60, 'pendiente'), cita('Z', 'B', '11:30', 30, 'confirmada'),
      cita('X', 'B', '12:00', 40, 'cancelada'), cita('O', 'OTRO', '12:00', 40, 'pendiente'),
    ], [
      { hora: '13:00', motivo: 'Almuerzo' }, { hora: '13:20', motivo: 'Almuerzo' }, { hora: '13:40', motivo: 'Almuerzo' },
      { hora: '15:00', motivo: 'Permiso' }, { hora: '15:30', motivo: 'Permiso' }, { hora: '17:00', motivo: 'texto libre' },
    ]);
    expect(o.citas).toEqual({ A: [120, 12], Z: [138, 6] });
    expect(rato(o.mapa, 600, 660)).toBe('c'.repeat(12));
    expect(rato(o.mapa, 690, 720)).toBe('c'.repeat(6));
    expect(rato(o.mapa, 720, 780)).toBe('0'.repeat(12));
    expect(rato(o.mapa, 780, 840)).toBe('A'.repeat(12));
    expect(rato(o.mapa, 900, 960)).toBe('P'.repeat(12));
    expect(rato(o.mapa, 1020, 1050)).toBe('X'.repeat(6));
    expect(rato(o.mapa, 1050, 1060)).toBe('00');
  });
});

describe('turnos encadenados (sin tiempo muerto entre una cita y la siguiente)', () => {
  const turnos = (mapa: string, apertura = 540, duracion = 40, descanso: { desde: number; hasta: number } | null = null) =>
    turnosEncadenados({ mapa, apertura, cierre: 1180, duracion, descanso }).map(h12);

  it('con la agenda vacía son los de siempre: cada 40 minutos desde que abre', () => {
    expect(turnos(mapaVacio(), 560).slice(0, 4)).toEqual(['9:20', '10:00', '10:40', '11:20']);
    expect(turnos(mapaVacio(), 540).slice(0, 4)).toEqual(['9:00', '9:40', '10:20', '11:00']);
  });

  it('si un cliente fijo va de 10:00 a 10:30, el turno siguiente es a las 10:30 (no a las 10:40)', () => {
    const mapa = ocupar(mapaVacio(), ...tramo(600, 30));
    expect(turnos(mapa, 560).slice(0, 4)).toEqual(['9:20', '10:30', '11:10', '11:50']);
  });

  it('tras un servicio de una hora (10:00 a 11:00) el siguiente entra a las 11:00, no a las 11:20', () => {
    const mapa = ocupar(mapaVacio(), ...tramo(600, 60));
    expect(turnos(mapa, 560).slice(0, 3)).toEqual(['9:20', '11:00', '11:40']);
  });

  it('después del descanso la cadena vuelve a empezar justo al terminar', () => {
    const almuerzo = { desde: 780, hasta: 840 }; // 1:00 a 2:00
    const lista = turnos(mapaVacio(), 540, 40, almuerzo);
    expect(lista).toContain('12:20'); // termina justo a la 1:00
    expect(lista).not.toContain('1:00');
    expect(lista).toContain('2:00');
    expect(lista).not.toContain('2:20');
  });

  it('no ofrece una hora en la que el servicio no cabe antes de la cita siguiente o del cierre', () => {
    const mapa = ocupar(mapaVacio(), ...tramo(630, 40)); // una cita de 10:30 a 11:10
    // Desde las 9:00: 9:00, 9:40 (termina 10:20) y ya no cabe otra de 40 antes de las 10:30.
    expect(turnos(mapa).slice(0, 3)).toEqual(['9:00', '9:40', '11:10']);
    expect(turnos(mapaVacio(), 540, 120).at(-1)).toBe('5:40');
  });
});

describe('horariosDisponibles', () => {
  const manana = new Date(2026, 9, 1, 8, 0);
  const jueves = '2026-10-01';
  const viernes = '2026-10-02'; // abre a las 9:00
  const etiquetas = (dia: string, duracion = 40, mapas: Record<string, string | undefined> = { b1: mapaVacio() }) =>
    horariosDisponibles({ dia, duracion, barberos: Object.keys(mapas), mapas, ahora: new Date(2026, 8, 30, 8), horario }).map(h => h.etiqueta);

  it('los turnos van cada 40 minutos desde la hora en que abre ese día', () => {
    expect(etiquetas(jueves).slice(0, 4)).toEqual(['9:20 AM', '10:00 AM', '10:40 AM', '11:20 AM']);
    expect(etiquetas(viernes).slice(0, 4)).toEqual(['9:00 AM', '9:40 AM', '10:20 AM', '11:00 AM']);
  });

  it('el último turno es el que termina a más tardar a la hora del cierre (7:40 p. m.)', () => {
    expect(etiquetas(viernes).at(-1)).toBe('7:00 PM'); // viernes: 7:00 a 7:40
    expect(etiquetas(jueves).at(-1)).toBe('6:40 PM'); // jueves: el de las 7:20 terminaría a las 8:00
  });

  it('un barbero sin el día preparado (sin documento) no ofrece nada', () => {
    expect(etiquetas(viernes, 40, { b1: undefined })).toEqual([]);
  });

  it('con varios barberos, cada hora va con quienes la tienen como turno', () => {
    const ocupado = ocupar(mapaVacio(), ...tramo(540, 40)); // b1: de 9:00 a 9:40
    const horas = horariosDisponibles({ dia: viernes, duracion: 40, barberos: ['b1', 'b2'], mapas: { b1: ocupado, b2: mapaVacio() }, ahora: manana, horario });
    expect(horas[0]).toEqual({ minutos: 540, etiqueta: '9:00 AM', barberosLibres: ['b2'] });
    expect(horas[1]).toEqual({ minutos: 580, etiqueta: '9:40 AM', barberosLibres: ['b1', 'b2'] });
  });

  it('hoy solo ofrece horas futuras', () => {
    const ahora = new Date(2026, 9, 2, 14, 10);
    const horas = horariosDisponibles({ dia: viernes, duracion: 40, barberos: ['b1'], mapas: { b1: mapaVacio() }, ahora, horario });
    expect(horas[0].etiqueta).toBe('2:20 PM');
  });

  it('no ofrece días pasados ni el día libre del barbero', () => {
    const despues = new Date(2026, 9, 5, 8, 0);
    expect(horariosDisponibles({ dia: viernes, duracion: 30, barberos: ['b1'], mapas: { b1: mapaVacio() }, ahora: despues, horario })).toEqual([]);
    expect(horariosDisponibles({
      dia: viernes, duracion: 30, barberos: ['b1'], mapas: { b1: mapaVacio() }, disponibilidad: { b1: { diasLibres: [5] } }, ahora: manana, horario,
    })).toEqual([]);
  });
});
