import { DURACIONES, duracionRecurrente, duracionesHasta, estaAlDia, fechasDeLaSerie, opcionDe, proximosDias } from './recurrencia.model';
import { fechaCorta } from '../utils/horario';
import { estaLibreEn, mapaVacio, ocupar, tramo } from '../utils/ocupacion';

// El 17 de octubre de 2026 es sábado. Lo mismo que prueba functions/src/recurrencias.test.ts: el panel muestra
// las mismas fechas que aparta la Cloud Function.
describe('agendas recurrentes', () => {
  it('semanal, quincenal y mensual (cada 4 semanas) caen siempre el mismo día', () => {
    expect(fechasDeLaSerie('2026-10-17', 'semanal', '2026-10-14', '2026-11-14')).toEqual(['2026-10-17', '2026-10-24', '2026-10-31', '2026-11-07', '2026-11-14']);
    expect(fechasDeLaSerie('2026-10-17', 'quincenal', '2026-10-14', '2026-11-14')).toEqual(['2026-10-17', '2026-10-31', '2026-11-14']);
    expect(fechasDeLaSerie('2026-10-17', 'mensual', '2026-10-14', '2026-12-31')).toEqual(['2026-10-17', '2026-11-14', '2026-12-12']);
  });

  it('una serie que ya venía sigue su paso (no empieza en el primer sábado)', () => {
    expect(fechasDeLaSerie('2026-09-05', 'quincenal', '2026-10-04', '2026-11-01')).toEqual(['2026-10-17', '2026-10-31']);
    expect(fechasDeLaSerie('2026-12-26', 'semanal', '2026-12-20', '2027-01-09')).toEqual(['2026-12-26', '2027-01-02', '2027-01-09']);
  });

  it('las fechas para elegir el primer turno son las próximas de ese día, empezando hoy si cae', () => {
    // Miércoles 14 de octubre.
    expect(proximosDias(6, '2026-10-14', 4)).toEqual(['2026-10-17', '2026-10-24', '2026-10-31', '2026-11-07']);
    expect(proximosDias(3, '2026-10-14', 2)).toEqual(['2026-10-14', '2026-10-21']);
    expect(proximosDias(1, '2026-10-14', 1)).toEqual(['2026-10-19']);
  });

  it('la duración va de 5 en 5, de 5 min a 4 horas', () => {
    expect(DURACIONES.length).toBe(48);
    expect(DURACIONES.slice(0, 5)).toEqual([5, 10, 15, 20, 25]);
    expect(DURACIONES[DURACIONES.length - 1]).toBe(240);
    // La del catálogo se lleva a la más cercana hacia arriba, sin salirse de los límites.
    expect(duracionRecurrente(40)).toBe(40);
    expect(duracionRecurrente(42)).toBe(45);
    expect(duracionRecurrente(0)).toBe(5);
    expect(duracionRecurrente(300)).toBe(240);
  });

  it('una cita del panel con un servicio de más de 4 horas puede llegar a la del catálogo', () => {
    expect(duracionesHasta(300).length).toBe(60);
    expect(duracionesHasta(300)[59]).toBe(300);
    expect(duracionRecurrente(300, 300)).toBe(300);
    expect(duracionRecurrente(298, Infinity)).toBe(300);
    expect(duracionRecurrente(305, 300)).toBe(300);
  });

  it('un turno de 25 min ocupa justo su rato: el siguiente puede empezar a las 9:45', () => {
    // 9:20 = 560 min. Termina 9:45: las 9:45 (585) quedan libres; las 9:40 (580), no.
    const mapa = ocupar(mapaVacio(), ...tramo(560, 25));
    expect(estaLibreEn(mapa, 585, 40)).toBeTrue();
    expect(estaLibreEn(mapa, 580, 40)).toBeFalse();
    const largo = ocupar(mapaVacio(), ...tramo(560, 45));
    expect(estaLibreEn(largo, 600, 40)).toBeFalse();
    expect(estaLibreEn(largo, 605, 40)).toBeTrue();
  });

  it('sabe si la función ya apartó los turnos de la última versión', () => {
    expect(estaAlDia({ actualizadoEn: 'a', procesadaEn: 'a' })).toBe(true);
    expect(estaAlDia({ actualizadoEn: 'b', procesadaEn: 'a' })).toBe(false);
    expect(estaAlDia({ actualizadoEn: 'a' })).toBe(false);
  });

  it('nombres en claro', () => {
    expect(opcionDe('mensual')?.detalle).toBe('Cada 4 semanas');
    expect(fechaCorta('2026-10-17')).toBe('sáb 17 oct');
    expect(fechaCorta('2027-01-02')).toBe('sáb 2 ene');
  });
});
