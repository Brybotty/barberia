import { Cita } from '../models/cita.model';
import { agruparPorDia, coincideBusqueda, filtrarCitas, rangoLista } from './lista-citas';

const cita = (dia: string, hora: string, extra: Partial<Cita> = {}) =>
  ({ id: `${dia}-${hora}-${extra.barberoId ?? 'J'}`, dia, hora, fecha: `${dia}T15:00:00.000Z`, estado: 'pendiente', barberoId: 'J', userName: 'Cliente', phone: '', ...extra } as Cita);

describe('lista de citas del panel', () => {
  // Jueves 17 de septiembre de 2026
  const jueves = new Date(2026, 8, 17, 12);

  it('hoy, mañana y la semana de lunes a domingo', () => {
    expect(rangoLista('hoy', jueves)).toEqual({ desde: '2026-09-17', hasta: '2026-09-17' });
    expect(rangoLista('manana', jueves)).toEqual({ desde: '2026-09-18', hasta: '2026-09-18' });
    expect(rangoLista('semana', jueves)).toEqual({ desde: '2026-09-14', hasta: '2026-09-20' });
    // Un domingo sigue en la semana que empezó el lunes anterior; mañana cambia de mes si toca.
    expect(rangoLista('semana', new Date(2026, 8, 20, 12))).toEqual({ desde: '2026-09-14', hasta: '2026-09-20' });
    expect(rangoLista('manana', new Date(2026, 8, 30, 12))).toEqual({ desde: '2026-10-01', hasta: '2026-10-01' });
  });

  it('próximas desde hoy, pasadas hasta ayer y todas sin límite', () => {
    expect(rangoLista('proximas', jueves)).toEqual({ desde: '2026-09-17' });
    expect(rangoLista('pasadas', jueves)).toEqual({ hasta: '2026-09-16' });
    expect(rangoLista('todas', jueves)).toEqual({});
  });

  it('filtra por período, barbero y sin las canceladas (salvo que se pidan)', () => {
    const citas = [
      cita('2026-09-16', '10:00'),
      cita('2026-09-17', '10:00'),
      cita('2026-09-17', '11:00', { barberoId: 'T' }),
      cita('2026-09-17', '12:00', { estado: 'cancelada' }),
      cita('2026-09-25', '10:00'),
    ];
    expect(filtrarCitas(citas, { periodo: 'hoy' }, jueves).length).toBe(2);
    expect(filtrarCitas(citas, { periodo: 'hoy', canceladas: true }, jueves).length).toBe(3);
    expect(filtrarCitas(citas, { periodo: 'hoy', barberoId: 'T' }, jueves).map(c => c.hora)).toEqual(['11:00']);
    expect(filtrarCitas(citas, { periodo: 'proximas', barberoId: 'J' }, jueves).map(c => c.dia)).toEqual(['2026-09-17', '2026-09-25']);
    expect(filtrarCitas(citas, { periodo: 'pasadas' }, jueves).map(c => c.dia)).toEqual(['2026-09-16']);
    expect(filtrarCitas(citas, { periodo: 'todas', canceladas: true }, jueves).length).toBe(5);
  });

  it('busca por nombre sin tildes ni mayúsculas, o por celular aunque lleve espacios', () => {
    const maria = cita('2026-09-17', '10:00', { userName: 'María  José Peña', phone: '+57 300 123 4567' });
    expect(coincideBusqueda(maria, 'maria jose')).toBeTrue();
    expect(coincideBusqueda(maria, 'PENA')).toBeTrue();
    expect(coincideBusqueda(maria, '300 123')).toBeTrue();
    expect(coincideBusqueda(maria, '3001234567')).toBeTrue();
    expect(coincideBusqueda(maria, '   ')).toBeTrue();
    expect(coincideBusqueda(maria, 'Pedro')).toBeFalse();
    // Menos de 3 dígitos no busca en el celular.
    expect(coincideBusqueda(maria, '30')).toBeFalse();
    expect(coincideBusqueda(cita('2026-09-17', '10:00', { userName: undefined as unknown as string, phone: undefined as unknown as string }), 'ana')).toBeFalse();
  });

  it('agrupa por día y ordena por hora; las pasadas, de la más reciente hacia atrás', () => {
    const citas = [cita('2026-09-18', '09:20'), cita('2026-09-17', '15:00'), cita('2026-09-17', '09:20'), cita('2026-09-15', '10:00')];
    const dias = agruparPorDia(citas);
    expect(dias.map(d => d.dia)).toEqual(['2026-09-15', '2026-09-17', '2026-09-18']);
    expect(dias[1].citas.map(c => c.hora)).toEqual(['09:20', '15:00']);
    const recientes = agruparPorDia(citas, true);
    expect(recientes.map(d => d.dia)).toEqual(['2026-09-18', '2026-09-17', '2026-09-15']);
    expect(recientes[1].citas.map(c => c.hora)).toEqual(['09:20', '15:00']);
  });
});
