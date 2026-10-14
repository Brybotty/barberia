import { Cita } from '../models/cita.model';
import {
  Horario, claveDia, compararCitas, diaDeCita, diasReservables, estaLibre, formatearHora12, horariosDisponibles,
  minutosDeCita, normalizarEstado, parsearHora, resumenHorario, slotsDeCita, turnosDelDia,
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

  it('slotsDeCita ocupa todos los bloques de 20 min que dura el servicio', () => {
    expect(slotsDeCita('b1', '2026-10-01', 600, 60).map(s => s.id)).toEqual([
      'b1_2026-10-01_1000', 'b1_2026-10-01_1020', 'b1_2026-10-01_1040',
    ]);
    expect(slotsDeCita('b1', '2026-10-01', 560, 40).map(s => s.hora)).toEqual(['09:20', '09:40']);
  });

  describe('horariosDisponibles', () => {
    const manana = new Date(2026, 9, 1, 8, 0);
    const jueves = '2026-10-01';
    const dia = '2026-10-02'; // viernes: abre a las 9:00
    const etiquetas = (d: string, duracion = 40) =>
      horariosDisponibles({ dia: d, duracion, barberos: ['b1'], ocupados: new Set(), ahora: new Date(2026, 8, 30, 8), horario }).map(h => h.etiqueta);

    it('los turnos van cada 40 minutos desde la hora en que abre ese día', () => {
      expect(etiquetas(jueves).slice(0, 4)).toEqual(['9:20 AM', '10:00 AM', '10:40 AM', '11:20 AM']);
      expect(etiquetas(dia).slice(0, 4)).toEqual(['9:00 AM', '9:40 AM', '10:20 AM', '11:00 AM']);
    });

    it('el último turno es el que termina a más tardar a la hora del cierre (7:40 p. m.)', () => {
      expect(etiquetas(dia).at(-1)).toBe('7:00 PM'); // viernes: 7:00 a 7:40
      expect(etiquetas(jueves).at(-1)).toBe('6:40 PM'); // jueves: el de las 7:20 terminaría a las 8:00
      expect(turnosDelDia(horario, 5)).toHaveSize(16);
      expect(turnosDelDia(horario, 4)).toHaveSize(15);
    });

    it('no ofrece horas en las que el servicio terminaría después del cierre', () => {
      const horas = horariosDisponibles({ dia, duracion: 120, barberos: ['b1'], ocupados: new Set(), ahora: manana, horario });
      expect(horas[0].etiqueta).toBe('9:00 AM');
      expect(horas[horas.length - 1].etiqueta).toBe('5:40 PM');
    });

    it('bloquea las horas que se solapan con cualquier bloque ocupado', () => {
      const ocupados = new Set(['b1_2026-10-02_1100']);
      const horas = horariosDisponibles({ dia, duracion: 80, barberos: ['b1'], ocupados, ahora: manana, horario });
      const libres = horas.map(h => h.etiqueta);
      // Un servicio de 80 min que empieza a las 10:20 terminaría a las 11:40 y pisa el bloque de las 11:00.
      expect(libres).toContain('9:40 AM');
      expect(libres).not.toContain('10:20 AM');
      expect(libres).not.toContain('11:00 AM');
      expect(libres).toContain('11:40 AM');
    });

    it('un servicio de una hora deja ocupados dos turnos de 40 minutos', () => {
      const ocupados = new Set(slotsDeCita('b1', dia, 540, 60).map(s => s.id)); // de 9:00 a 10:00
      const horas = horariosDisponibles({ dia, duracion: 40, barberos: ['b1'], ocupados, ahora: manana, horario });
      expect(horas[0].etiqueta).toBe('10:20 AM');
    });

    it('con varios barberos, la hora sigue disponible mientras alguno esté libre', () => {
      const ocupados = new Set(['b1_2026-10-02_0900']);
      const horas = horariosDisponibles({ dia, duracion: 40, barberos: ['b1', 'b2'], ocupados, ahora: manana, horario });
      expect(horas[0]).toEqual({ minutos: 540, etiqueta: '9:00 AM', barberosLibres: ['b2'] });
    });

    it('hoy solo ofrece horas futuras', () => {
      const ahora = new Date(2026, 9, 2, 14, 10);
      const horas = horariosDisponibles({ dia, duracion: 40, barberos: ['b1'], ocupados: new Set(), ahora, horario });
      expect(horas[0].etiqueta).toBe('2:20 PM');
    });

    it('respeta las citas guardadas con la rejilla anterior, de media hora', () => {
      // Una cita vieja de 10:30 a 11:30 dejó los bloques de las 10:30 y las 11:00, de 30 minutos cada uno.
      const vieja = new Set(['b1_2026-10-02_1030', 'b1_2026-10-02_1100']);
      expect(estaLibre('b1', dia, 580, 40, vieja)).toBeTrue(); // 9:40 a 10:20
      expect(estaLibre('b1', dia, 620, 40, vieja)).toBeFalse(); // 10:20 a 11:00
      expect(estaLibre('b1', dia, 680, 40, vieja)).toBeFalse(); // 11:20 a 12:00: la vieja va hasta las 11:30
      expect(estaLibre('b1', dia, 700, 40, vieja)).toBeTrue(); // 11:40 a 12:20
      // Un bloque nuevo en punto dura 20 minutos: el turno de las 11:20 sigue libre.
      expect(estaLibre('b1', dia, 680, 40, new Set(['b1_2026-10-02_1100']))).toBeTrue();
    });

    it('no ofrece días pasados', () => {
      const despues = new Date(2026, 9, 5, 8, 0);
      expect(horariosDisponibles({ dia, duracion: 30, barberos: ['b1'], ocupados: new Set(), ahora: despues, horario })).toEqual([]);
    });
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
