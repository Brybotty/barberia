import { CLIENTE } from '../../config/cliente';
import { HorarioAtencion } from '../../config/cliente.model';
import { AGENDA_CONTINUA, Agenda, BLOQUE } from '../utils/horario';

/** Botón y sección de cursos: llevan a la página externa donde el barbero vende sus cursos. */
export interface AjustesCursos {
  activo: boolean;
  url: string;
  titulo: string;
  descripcion: string;
  textoBoton: string;
}

/** Configuración que el admin cambia desde el panel (documento `ajustes/sitio`). */
export interface AjustesSitio {
  cursos: AjustesCursos;
  /** Horario de atención. Sin guardar: el de la configuración del cliente. */
  horario: Required<HorarioAtencion>;
  /** Hasta cuándo se puede reservar. Sin guardar: continua (siempre los próximos 14 días). */
  agenda: Agenda;
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
  };
}

const ES_DIA = /^\d{4}-\d{2}-\d{2}$/;

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
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0 && valor <= 1440 && valor % BLOQUE === 0;
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
  };
}
