import { Cita } from '../models/cita.model';
import {
  Horario, claveDia, compararCitas, diaDeCita, diasReservables, formatearHora12, minutosDeCita, normalizarEstado, parsearHora, resumenHorario,
  turnosDelDia,
} from './horario';

// Horario fijo para que los tests no dependan del cliente activo: lunes a jueves desde las 9:20, viernes y sábado
// desde las 9:00, cierre a las 7:40 p. m. y un turno cada 40 minutos.
const horario: Horario = { apertura: 560, cierre: 1180, aperturas: { 5: 540, 6: 540 }, intervalo: 40, diasCerrados: [0], diasReservables: 14 };

describe('horario', () => {
  describe('parsearHora', () => {
    it('acepta formato de 12 horas', () => {
      expect(parsearHora('10:00 AM')).toBe(600);
      expect(parsearHora('2:30 PM')).toBe(870);
      expect(parsearHora('12:00 PM')).toBe(720);
      expect(parsearHora('12:30 AM')).toBe(30);
      expect(parsearHora('7:30pm')).toBe(1170);
    });

    it('acepta formato de 24 horas', () => {
      expect(parsearHora('14:30')).toBe(870);
      expect(parsearHora('09:00')).toBe(540);
    });

    it('rechaza valores inválidos', () => {
      expect(parsearHora('')).toBeNull();
      expect(parsearHora(undefined)).toBeNull();
      expect(parsearHora('25:00')).toBeNull();
      expect(parsearHora('13:00 PM')).toBeNull();
      expect(parsearHora('10:75')).toBeNull();
    });
  });

  it('formatearHora12 usa el mismo formato que las citas guardadas', () => {
    expect(formatearHora12(600)).toBe('10:00 AM');
    expect(formatearHora12(720)).toBe('12:00 PM');
    expect(formatearHora12(810)).toBe('1:30 PM');
  });

  it('ordena por hora real y no alfabéticamente ("1:00 PM" va después de "11:00 AM")', () => {
    const cita = (horaStr: string) => ({ fecha: '2026-10-01T15:00:00.000Z', dia: '2026-10-01', horaStr } as Cita);
    const ordenadas = [cita('2:00 PM'), cita('1:00 PM'), cita('10:00 AM'), cita('12:00 PM')].sort(compararCitas);
    expect(ordenadas.map(c => c.horaStr)).toEqual(['10:00 AM', '12:00 PM', '1:00 PM', '2:00 PM']);
  });

  it('lee el día y la hora de citas antiguas sin los campos dia/hora', () => {
    const antigua = { fecha: new Date(2026, 9, 1, 18, 45).toISOString(), horaStr: '3:30 PM' } as Cita;
    expect(diaDeCita(antigua)).toBe('2026-10-01');
    expect(minutosDeCita(antigua)).toBe(930);
  });

  it('normaliza el estado antiguo "completado"', () => {
    expect(normalizarEstado('completado')).toBe('completada');
    expect(normalizarEstado('pendiente')).toBe('pendiente');
  });

  it('los turnos de un día vacío van cada 40 minutos desde la apertura (los ve el admin en Ajustes)', () => {
    expect(turnosDelDia(horario, 5)).toHaveSize(16);
    expect(turnosDelDia(horario, 4)).toHaveSize(15);
  });

  it('diasReservables excluye los domingos', () => {
    const dias = diasReservables(new Date(2026, 9, 1), horario);
    expect(dias.some(d => d.getDay() === 0)).toBeFalse();
    expect(claveDia(dias[0])).toBe('2026-10-01');
  });

  it('resumenHorario agrupa los días seguidos que tienen el mismo horario', () => {
    expect(resumenHorario(horario)).toEqual([
      { dias: 'Lun – Jue', horas: '9:20 AM – 7:40 PM', abierto: true, incluye: [1, 2, 3, 4] },
      { dias: 'Vie – Sáb', horas: '9:00 AM – 7:40 PM', abierto: true, incluye: [5, 6] },
      { dias: 'Dom', horas: 'Cerrado', abierto: false, incluye: [0] },
    ]);
    expect(resumenHorario({ ...horario, aperturas: {} })[0]).toEqual({ dias: 'Lun – Sáb', horas: '9:20 AM – 7:40 PM', abierto: true, incluye: [1, 2, 3, 4, 5, 6] });
    expect(resumenHorario({ ...horario, diasCerrados: [0, 1] })[0]).toEqual({ dias: 'Lun', horas: 'Cerrado', abierto: false, incluye: [1] });
  });
});
