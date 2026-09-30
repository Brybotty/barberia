import { Cita } from '../models/cita.model';
import { comisionDe, enPeriodo, rangoDe, resumir, valorCobrado } from './ganancias';

const cita = (dia: string, estado: Cita['estado'], precio: number, precioFinal?: number) =>
  ({ dia, hora: '10:00', fecha: `${dia}T15:00:00.000Z`, estado, precio, precioFinal } as Cita);

describe('ganancias', () => {
  // Jueves 17 de septiembre de 2026
  const jueves = new Date(2026, 8, 17, 12);

  it('la semana va del lunes a hoy', () => {
    expect(rangoDe('semana', jueves)).toEqual({ desde: '2026-09-14', hasta: '2026-09-17' });
    // Un domingo pertenece a la semana que empezó el lunes anterior
    expect(rangoDe('semana', new Date(2026, 8, 20, 12))).toEqual({ desde: '2026-09-14', hasta: '2026-09-20' });
  });

  it('mes actual y mes anterior', () => {
    expect(rangoDe('mes', jueves)).toEqual({ desde: '2026-09-01', hasta: '2026-09-17' });
    expect(rangoDe('mes-anterior', jueves)).toEqual({ desde: '2026-08-01', hasta: '2026-08-31' });
    expect(rangoDe('mes-anterior', new Date(2026, 0, 10))).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' });
    expect(rangoDe('todo', jueves)).toBeNull();
  });

  it('filtra por período usando el día de la cita', () => {
    const rango = rangoDe('hoy', jueves);
    expect(enPeriodo(cita('2026-09-17', 'completada', 30000), rango)).toBeTrue();
    expect(enPeriodo(cita('2026-09-16', 'completada', 30000), rango)).toBeFalse();
  });

  it('usa el valor cobrado si existe', () => {
    expect(valorCobrado(cita('2026-09-17', 'completada', 300000, 380000))).toBe(380000);
    expect(valorCobrado(cita('2026-09-17', 'completada', 30000))).toBe(30000);
  });

  it('resume cortes, lo generado y la parte de cada uno', () => {
    const citas = [
      cita('2026-09-17', 'completada', 30000),
      cita('2026-09-17', 'completada', 40000, 45000),
      cita('2026-09-17', 'pendiente', 60000),
      cita('2026-09-17', 'no-asistio', 30000),
      cita('2026-09-17', 'cancelada', 30000),
    ];
    expect(resumir(citas, 60)).toEqual({ cortes: 2, generado: 75000, ganancia: 45000, barberia: 30000, noAsistio: 1 });
    expect(resumir(citas).ganancia).toBe(75000);
  });

  it('comisión por defecto 100 y acotada entre 0 y 100', () => {
    expect(comisionDe({})).toBe(100);
    expect(comisionDe(null)).toBe(100);
    expect(comisionDe({ comision: 55 })).toBe(55);
    expect(comisionDe({ comision: 150 })).toBe(100);
    expect(comisionDe({ comision: 0 })).toBe(0);
    expect(comisionDe({ comision: null })).toBe(100);
  });
});
