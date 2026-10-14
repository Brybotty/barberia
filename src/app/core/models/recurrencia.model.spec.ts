import { estaAlDia, fechasDeLaSerie, opcionDe, proximosDias } from './recurrencia.model';
import { fechaCorta } from '../utils/horario';

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
