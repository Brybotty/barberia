import { CLIENTE } from '../../config/cliente';
import { HorarioAtencion } from '../../config/cliente.model';
import { AGENDA_CONTINUA, Agenda, PASO_HORARIO } from '../utils/horario';

/** Botón y sección de cursos: llevan a la página externa donde el barbero vende sus cursos. */
export interface AjustesCursos {
  activo: boolean;
  url: string;
  titulo: string;
  descripcion: string;
  textoBoton: string;
}

/**
 * Multa a quien no llega a su turno (pedido del cliente). Se pone al marcar "No asistió" y se cobra en la siguiente
 * visita del cliente. `automatica`: se pone sola (se puede quitar en ese momento); si no, quien marca decide cada vez.
 */
export interface Multa {
  activa: boolean;
  /** En pesos. */
  valor: number;
  automatica: boolean;
}

/** Tope de una multa (también en las reglas). */
export const MULTA_MAXIMA = 1_000_000;

/** Días con servicios limitados: { 'YYYY-MM-DD': [IDs de los servicios que SÍ se reservan] } (ver utils/servicios-del-dia.ts). */
export type ServiciosPorDia = Record<string, string[]>;

/** Configuración que el admin cambia desde el panel (documento `ajustes/sitio`). */
export interface AjustesSitio {
  cursos: AjustesCursos;
  /** Horario de atención. Sin guardar: el de la configuración del cliente. */
  horario: Required<HorarioAtencion>;
  /** Hasta cuándo se puede reservar. Sin guardar: continua (siempre los próximos 14 días). */
  agenda: Agenda;
  /**
   * Días con servicios limitados (se eligen en *Citas*, tocando el día): solo esos servicios se reservan en línea ese
   * día. Se guarda aparte del formulario de Ajustes (ver AjustesService.guardarServiciosDelDia).
   */
  serviciosPorDia: ServiciosPorDia;
  /** Sin guardar: sin multa. */
  multa: Multa;
}

export function ajustesPorDefecto(): AjustesSitio {
  return {
    cursos: {
      activo: !!CLIENTE.cursos,
      url: CLIENTE.cursos?.url ?? '',
      titulo: CLIENTE.cursos?.titulo ?? 'Aprende con nosotros',
      descripcion: CLIENTE.cursos?.descripcion ?? '',
      textoBoton: CLIENTE.cursos?.textoBoton ?? 'Ver cursos',
    },
    horario: {
      apertura: CLIENTE.horario.apertura,
      cierre: CLIENTE.horario.cierre,
      aperturas: { ...CLIENTE.horario.aperturas },
      diasCerrados: [...CLIENTE.horario.diasCerrados],
      cierres: [...(CLIENTE.horario.cierres ?? [])],
    },
    agenda: { ...AGENDA_CONTINUA },
    serviciosPorDia: {},
    // Sin multa; al activarla arranca con un valor de ejemplo y puesta sola (lo que pidió el cliente).
    multa: { activa: false, valor: 10000, automatica: true },
  };
}

const ES_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Una multa sin valor (o con uno que no se entiende) no se cobra. */
function multaGuardada(guardada: Partial<Multa> | undefined, base: Multa): Multa {
  if (!guardada) return base;
  const valor = Math.round(Number(guardada?.valor));
  const valido = Number.isFinite(valor) && valor > 0 && valor <= MULTA_MAXIMA;
  return { activa: !!guardada?.activa && valido, valor: valido ? valor : 0, automatica: !!guardada?.automatica };
}

/** Los días con servicios limitados, sin entradas que no se entiendan (las reglas tampoco dejarían reservar con ellas). */
export function serviciosPorDiaGuardados(guardado: unknown): ServiciosPorDia {
  if (!guardado || typeof guardado !== 'object' || Array.isArray(guardado)) return {};
  const limpio: ServiciosPorDia = {};
  for (const [dia, ids] of Object.entries(guardado)) {
    if (!ES_DIA.test(dia) || !Array.isArray(ids)) continue;
    const validos = ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (validos.length > 0) limpio[dia] = validos;
  }
  return limpio;
}

/**
 * Por periodos solo si quedó guardado así. Una fecha que no se entiende queda vacía, y con eso la agenda
 * sale cerrada: es lo mismo que hacen las reglas, que tampoco dejarían reservar.
 */
function agendaGuardada(guardada: Partial<Agenda> | undefined): Agenda {
  if (guardada?.modo !== 'periodo') return { ...AGENDA_CONTINUA };
  const dia = (valor: unknown) => (typeof valor === 'string' && ES_DIA.test(valor) ? valor : '');
  return { modo: 'periodo', desde: dia(guardada.desde), hasta: dia(guardada.hasta) };
}

/** Una hora que cae en la rejilla de la agenda (múltiplo de 20 min): las reglas no aceptan turnos fuera de ella. */
function esHora(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0 && valor <= 1440 && valor % PASO_HORARIO === 0;
}

/**
 * El horario guardado vale si trae las horas de apertura por día (`aperturas`) y todas caen en la rejilla.
 * El que se guardó antes de los turnos de 40 min no las trae: de ese se conservan los días y las fechas
 * cerradas, y las horas salen de la configuración (si no, la página ofrecería turnos que las reglas rechazan).
 */
function horarioGuardado(guardado: Partial<HorarioAtencion> | undefined, base: Required<HorarioAtencion>): Required<HorarioAtencion> {
  if (!guardado) return base;
  const diasCerrados = Array.isArray(guardado.diasCerrados) ? guardado.diasCerrados : base.diasCerrados;
  const cierres = Array.isArray(guardado.cierres) ? guardado.cierres : base.cierres;
  const { apertura, cierre, aperturas } = guardado;
  const valido = esHora(apertura) && esHora(cierre) && !!aperturas && typeof aperturas === 'object'
    && Object.entries(aperturas).every(([dia, hora]) => /^[0-6]$/.test(dia) && esHora(hora))
    && [apertura, ...Object.values(aperturas)].every(hora => hora < cierre);
  return valido ? { apertura, cierre, aperturas: { ...aperturas }, diasCerrados, cierres } : { ...base, diasCerrados, cierres };
}

/** Completa lo que falte en el documento guardado con los valores por defecto (y descarta un horario imposible). */
export function conDefectos(guardado: Partial<AjustesSitio> | undefined): AjustesSitio {
  const base = ajustesPorDefecto();
  return {
    cursos: { ...base.cursos, ...guardado?.cursos },
    horario: horarioGuardado(guardado?.horario, base.horario),
    agenda: agendaGuardada(guardado?.agenda),
    serviciosPorDia: serviciosPorDiaGuardados(guardado?.serviciosPorDia),
    multa: multaGuardada(guardado?.multa, base.multa),
  };
}
