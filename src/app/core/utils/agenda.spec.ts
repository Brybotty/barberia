import { CLIENTE } from '../../config/cliente';
import { conDefectos } from '../models/ajustes.model';
import { etiquetaEstado } from '../models/cita.model';
import { esCelularValido, formatoCelular, limpiarCelular } from './colombia';
import {
  AGENDA_CONTINUA, Agenda, Horario, claveDia, diaLargo, diasEntre, diasReservables, estaCerrado, estadoDelNegocio, extenderAgenda,
  opcionesDeHora, parsearHora, periodoDeAgenda, sumarDias, trabaja,
} from './horario';
import { horariosDisponibles, mapaVacio, ocupar, tramo } from './ocupacion';

// Lunes a sábado de 10:00 a. m. a 8:00 p. m.; domingo cerrado; el 14 de octubre de 2026 (miércoles) cerrado por festivo.
const horario: Horario = { apertura: 600, cierre: 1200, intervalo: 40, diasCerrados: [0], cierres: ['2026-10-14'], diasReservables: 14 };
/** Una hora de Colombia (UTC-5) como instante. */
const enColombia = (iso: string) => new Date(`${iso}-05:00`);

describe('agenda: horario de la barbería', () => {
  it('una fecha de cierre (festivo) no abre aunque sea día de semana', () => {
    expect(estaCerrado('2026-10-14', horario)).toBe(true);
    expect(estaCerrado('2026-10-13', horario)).toBe(false);
    expect(estaCerrado('2026-10-11', horario)).toBe(true); // domingo
  });

  it('los días para reservar saltan los cierres', () => {
    const dias = diasReservables(new Date(2026, 9, 12), horario).map(d => d.getDate());
    expect(dias).not.toContain(14);
    expect(dias).not.toContain(18); // domingo
    expect(dias).toContain(13);
  });

  it('no ofrece horas en una fecha cerrada', () => {
    const horas = horariosDisponibles({ dia: '2026-10-14', duracion: 60, barberos: ['b1'], mapas: { b1: mapaVacio() }, ahora: new Date(2026, 9, 12, 9), horario });
    expect(horas).toEqual([]);
  });

  it('dice si está abierto ahora, en la hora de Colombia', () => {
    expect(estadoDelNegocio(enColombia('2026-10-12T15:00:00'), horario)).toEqual(jasmine.objectContaining({ abierto: true, texto: 'Abierto ahora · cierra a las 8:00 PM' }));
    expect(estadoDelNegocio(enColombia('2026-10-12T08:00:00'), horario).texto).toBe('Cerrado · abre hoy a las 10:00 AM');
    expect(estadoDelNegocio(enColombia('2026-10-12T21:00:00'), horario).texto).toBe('Cerrado · abre mañana a las 10:00 AM');
    // Sábado en la noche: el domingo no abre.
    expect(estadoDelNegocio(enColombia('2026-10-10T21:00:00'), horario).texto).toBe('Cerrado · abre el lunes a las 10:00 AM');
    // Martes en la noche, y el miércoles es festivo.
    expect(estadoDelNegocio(enColombia('2026-10-13T21:00:00'), horario).texto).toBe('Cerrado · abre el jueves a las 10:00 AM');
    // En la fecha de cierre, a mediodía.
    expect(estadoDelNegocio(enColombia('2026-10-14T12:00:00'), horario).abierto).toBe(false);
  });

  it('con días que abren a otra hora, dice la de cada día', () => {
    // Viernes y sábado desde las 9:00; los demás, desde las 9:20.
    const porDia: Horario = { ...horario, apertura: 560, cierre: 1180, aperturas: { 5: 540, 6: 540 } };
    expect(estadoDelNegocio(enColombia('2026-10-12T09:10:00'), porDia).texto).toBe('Cerrado · abre hoy a las 9:20 AM'); // lunes
    expect(estadoDelNegocio(enColombia('2026-10-16T09:10:00'), porDia).texto).toBe('Abierto ahora · cierra a las 7:40 PM'); // viernes
    expect(estadoDelNegocio(enColombia('2026-10-15T21:00:00'), porDia).texto).toBe('Cerrado · abre mañana a las 9:00 AM'); // jueves en la noche
    expect(estadoDelNegocio(enColombia('2026-10-17T21:00:00'), porDia).texto).toBe('Cerrado · abre el lunes a las 9:20 AM'); // sábado en la noche
  });

  it('las horas de los selectores van cada 20 minutos (o de 5 en 5), y las de fin incluyen la del cierre', () => {
    expect(opcionesDeHora(horario).slice(0, 3).map(o => o.minutos)).toEqual([600, 620, 640]);
    expect(opcionesDeHora(horario, false, 5).slice(0, 3).map(o => o.minutos)).toEqual([600, 605, 610]);
    expect(opcionesDeHora(horario, true, 5).at(-1)?.minutos).toBe(1200);
    expect(opcionesDeHora(horario).at(-1)?.minutos).toBe(1180);
    expect(opcionesDeHora(horario, true).at(-1)?.minutos).toBe(1200);
    // Empiezan en la apertura más temprana de la semana.
    expect(opcionesDeHora({ ...horario, aperturas: { 6: 540 } })[0].minutos).toBe(540);
  });
});

describe('agenda: disponibilidad de cada barbero', () => {
  const lunes = '2026-10-12';

  it('no trabaja en su día libre', () => {
    expect(trabaja({ diasLibres: [1] }, lunes, 600, 60)).toBe(false);
    expect(trabaja({ diasLibres: [2] }, lunes, 600, 60)).toBe(true);
    expect(trabaja(undefined, lunes, 600, 60)).toBe(true);
  });

  it('no atiende en su descanso, ni citas que se metan en él', () => {
    const almuerzo = { descanso: { desde: 780, hasta: 840 } }; // 1:00 a 2:00 p. m.
    expect(trabaja(almuerzo, lunes, 780, 30)).toBe(false);
    expect(trabaja(almuerzo, lunes, 750, 60)).toBe(false); // 12:30 a 1:30
    expect(trabaja(almuerzo, lunes, 720, 60)).toBe(true); // termina justo a la 1:00
    expect(trabaja(almuerzo, lunes, 840, 60)).toBe(true); // empieza justo a las 2:00
  });

  it('con "cualquier barbero" ofrece la hora a quienes la tienen como turno', () => {
    // b1 almuerza de 1:00 a 2:00; b2 tiene una cita de 1:00 a 1:20.
    const horas = horariosDisponibles({
      dia: lunes, duracion: 60, barberos: ['b1', 'b2'], mapas: { b1: mapaVacio(), b2: ocupar(mapaVacio(), ...tramo(780, 20)) },
      disponibilidad: { b1: { descanso: { desde: 780, hasta: 840 } }, b2: { diasLibres: [] } },
      ahora: new Date(2026, 9, 11, 9), horario,
    });
    const a = (minutos: number) => horas.find(h => h.minutos === minutos)?.barberosLibres;
    expect(a(600)).toEqual(['b1', 'b2']);
    expect(a(720)).toEqual(['b1', 'b2']); // 12:00 a 1:00: los dos terminan justo antes de la 1:00
    expect(a(760)).toBeUndefined(); // 12:40 a 1:40: b1 entra a almorzar y b2 tiene la 1:00 ocupada
    expect(a(800)).toEqual(['b2']); // 1:20, justo cuando termina la cita de b2; b1 sigue almorzando
    expect(a(840)).toEqual(['b1', 'b2']); // 2:00: b1 vuelve de almorzar y b2 sigue su cadena (1:20, 2:00...)
    expect(a(780)).toBeUndefined();
  });

  it('si todos tienen el día libre no queda ninguna hora', () => {
    const horas = horariosDisponibles({
      dia: lunes, duracion: 30, barberos: ['b1'], mapas: { b1: mapaVacio() }, disponibilidad: { b1: { diasLibres: [1] } }, ahora: new Date(2026, 9, 11, 9), horario,
    });
    expect(horas).toEqual([]);
  });
});

describe('agenda: utilidades', () => {
  it('lee la hora de los bloques guardados sin dos puntos', () => {
    expect(parsearHora('1030')).toBe(630);
    expect(parsearHora('10:30')).toBe(630);
  });

  it('al cliente nunca le dice "pendiente": la reserva queda en firme', () => {
    expect(etiquetaEstado({ estado: 'pendiente' }, 'cliente')).toBe('Agendada');
    expect(etiquetaEstado({ estado: 'confirmada' }, 'cliente')).toBe('Agendada');
    expect(etiquetaEstado({ estado: 'completada' }, 'cliente')).toBe('Atendida');
    expect(etiquetaEstado({ estado: 'no-asistio' }, 'cliente')).toBe('No asististe');
    expect(etiquetaEstado({ estado: 'no-asistio' })).toBe('No asistió');
    expect(etiquetaEstado({ estado: 'cancelada' }, 'cliente')).toBe('Cancelada');
    expect(etiquetaEstado({ estado: 'cancelada', reemplazadaPor: 'x' }, 'cliente')).toBe('Reagendada');
  });

  it('valida y limpia celulares colombianos', () => {
    expect(esCelularValido('300 123 4567')).toBe(true);
    expect(esCelularValido('+57 300-123-4567')).toBe(true);
    expect(esCelularValido('601 123 4567')).toBe(false); // fijo
    expect(esCelularValido('30012345')).toBe(false);
    expect(limpiarCelular('+57 300 123 4567')).toBe('3001234567');
    expect(formatoCelular('+573001234567')).toBe('300 123 4567');
  });
});

describe('agenda: periodos que abre el admin', () => {
  // Domingo 11 de octubre de 2026 a mediodía: la barbería abre de lunes a sábado.
  const hoy = new Date(2026, 9, 11, 12, 0);
  const periodo: Agenda = { modo: 'periodo', desde: '2026-10-01', hasta: '2026-10-16' };

  it('con la agenda siempre abierta se ofrecen los próximos 14 días', () => {
    const dias = diasReservables(hoy, horario, AGENDA_CONTINUA).map(claveDia);
    expect(dias[0]).toBe('2026-10-12');
    expect(dias[dias.length - 1]).toBe('2026-10-24');
  });

  it('por periodos solo se ofrecen los días que quedan dentro del periodo (sin domingos ni festivos)', () => {
    expect(diasReservables(hoy, horario, periodo).map(claveDia)).toEqual(['2026-10-12', '2026-10-13', '2026-10-15', '2026-10-16']);
  });

  it('un periodo puede abrir más de 14 días, o empezar más adelante', () => {
    const largo = diasReservables(hoy, horario, { modo: 'periodo', desde: '2026-10-11', hasta: '2026-11-10' }).map(claveDia);
    expect(largo[largo.length - 1]).toBe('2026-11-10');
    const futuro = diasReservables(hoy, horario, { modo: 'periodo', desde: '2026-10-19', hasta: '2026-10-21' }).map(claveDia);
    expect(futuro).toEqual(['2026-10-19', '2026-10-20', '2026-10-21']);
  });

  it('nunca ofrece días a más de 60 de hoy, aunque el periodo guardado sea más largo', () => {
    const dias = diasReservables(hoy, horario, { modo: 'periodo', desde: '2026-10-01', hasta: '2027-10-01' }).map(claveDia);
    expect(dias[dias.length - 1]).toBe('2026-12-10');
  });

  it('cuando el periodo termina no queda ningún día: la agenda está cerrada', () => {
    const vencido: Agenda = { modo: 'periodo', desde: '2026-09-15', hasta: '2026-10-10' };
    expect(diasReservables(hoy, horario, vencido)).toEqual([]);
    expect(periodoDeAgenda(vencido, '2026-10-11')).toEqual({ porPeriodo: true, abierta: false, diasRestantes: null, texto: 'Agenda cerrada por ahora' });
    // Por periodos pero sin fechas (documento mal guardado): también cerrada, igual que en las reglas.
    expect(periodoDeAgenda({ modo: 'periodo', desde: '', hasta: '' }, '2026-10-11').abierta).toBe(false);
  });

  it('le cuenta al cliente hasta cuándo puede reservar', () => {
    expect(periodoDeAgenda(AGENDA_CONTINUA, '2026-10-11')).toEqual({ porPeriodo: false, abierta: true, diasRestantes: null, texto: '' });
    expect(periodoDeAgenda(periodo, '2026-10-11')).toEqual({ porPeriodo: true, abierta: true, diasRestantes: 5, texto: 'Agenda abierta hasta el 16 de octubre' });
    expect(periodoDeAgenda(periodo, '2026-10-16').diasRestantes).toBe(0);
    expect(periodoDeAgenda({ modo: 'periodo', desde: '2026-10-17', hasta: '2026-10-31' }, '2026-10-11').texto).toBe('Agenda abierta del 17 al 31 de octubre');
    expect(periodoDeAgenda({ modo: 'periodo', desde: '2026-10-28', hasta: '2026-11-12' }, '2026-10-11').texto).toBe('Agenda abierta del 28 de octubre al 12 de noviembre');
  });

  it('"15 días más" se cuenta desde el último día abierto; si ya cerró, desde hoy', () => {
    expect(extenderAgenda(periodo, 15, '2026-10-11')).toEqual({ modo: 'periodo', desde: '2026-10-01', hasta: '2026-10-31' });
    expect(extenderAgenda({ modo: 'periodo', desde: '2026-09-01', hasta: '2026-09-16' }, 15, '2026-10-11')).toEqual({ modo: 'periodo', desde: '2026-10-11', hasta: '2026-10-26' });
    expect(extenderAgenda(AGENDA_CONTINUA, 15, '2026-10-11')).toEqual({ modo: 'periodo', desde: '2026-10-11', hasta: '2026-10-26' });
    // No pasa del tope de 60 días.
    expect(extenderAgenda({ modo: 'periodo', desde: '2026-10-01', hasta: '2026-12-05' }, 15, '2026-10-11').hasta).toBe('2026-12-10');
  });

  it('suma días y cuenta días entre fechas sin enredarse con los meses', () => {
    expect(sumarDias('2026-10-01', 15)).toBe('2026-10-16');
    expect(sumarDias('2026-12-25', 15)).toBe('2027-01-09');
    expect(diasEntre('2026-10-01', '2026-10-16')).toBe(15);
    expect(diaLargo('2026-03-05')).toBe('5 de marzo');
  });

  it('el horario guardado antes de los turnos de 40 min toma las horas nuevas y conserva los días cerrados', () => {
    const viejo = { apertura: 600, cierre: 1200, diasCerrados: [0, 1], cierres: ['2026-12-25'] };
    expect(conDefectos({ horario: viejo as never }).horario).toEqual({
      apertura: CLIENTE.horario.apertura, cierre: CLIENTE.horario.cierre, aperturas: { ...CLIENTE.horario.aperturas },
      diasCerrados: [0, 1], cierres: ['2026-12-25'],
    });
    // El que guarda el panel nuevo (con las aperturas por día) se respeta tal cual.
    const nuevo = { apertura: 600, cierre: 1200, aperturas: { 6: 540 }, diasCerrados: [0], cierres: [] };
    expect(conDefectos({ horario: nuevo }).horario).toEqual(nuevo);
    // Una hora fuera de la rejilla de 20 minutos (las reglas rechazarían esos turnos): se descarta.
    expect(conDefectos({ horario: { ...nuevo, apertura: 630 } }).horario.apertura).toBe(CLIENTE.horario.apertura);
    expect(conDefectos({ horario: { ...nuevo, aperturas: { 6: 1210 } } }).horario.apertura).toBe(CLIENTE.horario.apertura);
  });

  it('los ajustes guardados sin agenda (los de antes) quedan como siempre abierta', () => {
    expect(conDefectos(undefined).agenda).toEqual(AGENDA_CONTINUA);
    expect(conDefectos({ agenda: periodo }).agenda).toEqual(periodo);
    // Fechas que no se entienden: por periodos y cerrada, nunca abierta por error.
    expect(conDefectos({ agenda: { modo: 'periodo', desde: 'mañana', hasta: 5 } as never }).agenda).toEqual({ modo: 'periodo', desde: '', hasta: '' });
  });
});
