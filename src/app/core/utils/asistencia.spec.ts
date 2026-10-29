import { Cita } from '../models/cita.model';
import { caritaDe, claveCliente, multaParaCobrarEn, multaPendiente, nivelAsistencia, resumirAsistencia, textoAsistencia } from './asistencia';

let n = 0;
const cita = (estado: Cita['estado'], extra: Partial<Cita> = {}) =>
  ({ id: `c${++n}`, estado, dia: '2026-10-10', userId: '', userName: 'Laura Gómez', phone: '3001112233', ...extra } as Cita);

describe('caritas de asistencia', () => {
  it('reconoce al cliente por su celular, su cuenta o su nombre', () => {
    expect(claveCliente({ phone: '+57 300 111 2233', userId: 'u1' })).toBe('tel:3001112233');
    expect(claveCliente({ phone: '', userId: 'u1', userName: 'Laura' })).toBe('uid:u1');
    expect(claveCliente({ phone: '12', userId: '', userName: '  Laura   GÓMEZ ' })).toBe('nom:laura gomez');
    expect(claveCliente({ phone: '', userId: '', userName: ' ' })).toBeNull();
  });

  it('cuenta "Hecho" y "No asistió" (lo demás no), y junta las citas de la página y las del panel por el celular', () => {
    const resumen = resumirAsistencia([
      cita('completada', { userId: 'u1' }),
      cita('completada', { phone: '300 111 2233' }),
      cita('no-asistio', { dia: '2026-09-01' }),
      cita('no-asistio', { dia: '2026-10-05' }),
      cita('pendiente'),
      cita('cancelada'),
      cita('no-asistio', { phone: '3159998877' }),
    ]);
    expect(resumen.get('tel:3001112233')).toEqual({ vino: 2, falto: 2, ultimaFalta: '2026-10-05' });
    expect(resumen.get('tel:3159998877')).toEqual({ vino: 0, falto: 1, ultimaFalta: '2026-10-10' });
  });

  it('una cita que llega en dos listas cuenta una sola vez', () => {
    const falta = cita('no-asistio');
    expect(resumirAsistencia([falta, cita('completada')], [falta]).get('tel:3001112233')).toEqual({ vino: 1, falto: 1, ultimaFalta: '2026-10-10' });
  });

  it('de 1 a 5 según las faltas, y 0 para el cliente nuevo', () => {
    expect(nivelAsistencia(undefined)).toBe(0);
    expect(nivelAsistencia({ vino: 0, falto: 0 })).toBe(0);
    expect(nivelAsistencia({ vino: 7, falto: 0 })).toBe(1);
    expect(nivelAsistencia({ vino: 7, falto: 1 })).toBe(2);
    expect(nivelAsistencia({ vino: 0, falto: 2 })).toBe(3);
    expect(nivelAsistencia({ vino: 3, falto: 3 })).toBe(4);
    expect(nivelAsistencia({ vino: 1, falto: 4 })).toBe(5);
    expect(nivelAsistencia({ vino: 1, falto: 9 })).toBe(5);
    expect(caritaDe({ vino: 7, falto: 0 }).corto).toBe('Siempre viene');
    expect(caritaDe({ vino: 7, falto: 1 }).corto).toBe('Faltó 1 vez');
  });

  it('suma las multas puestas y las pagadas: lo que falta es lo que debe', () => {
    const resumen = resumirAsistencia([
      cita('no-asistio', { multa: 10000 }),
      cita('no-asistio', { multa: 15000 }),
      cita('no-asistio'),
      cita('completada', { multaCobrada: 10000 }),
    ]).get('tel:3001112233');
    expect(resumen).toEqual(jasmine.objectContaining({ multas: 25000, cobradas: 10000 }));
    expect(multaPendiente(resumen)).toBe(15000);
    expect(multaPendiente({ vino: 1, falto: 0, cobradas: 5000 })).toBe(0);
    expect(multaPendiente(undefined)).toBe(0);
  });

  it('al corregir con "Sí vino" un "No asistió" con multa, esa multa no se cobra', () => {
    const conMulta = cita('no-asistio', { multa: 10000 });
    const resumen = resumirAsistencia([conMulta, cita('no-asistio', { multa: 20000 })]).get('tel:3001112233');
    expect(multaParaCobrarEn(conMulta, resumen)).toBe(20000);
    expect(multaParaCobrarEn(cita('pendiente'), resumen)).toBe(30000);
  });

  it('lo dice en claro', () => {
    expect(textoAsistencia(undefined)).toBe('Cliente nuevo: aún no tiene turnos marcados');
    expect(textoAsistencia({ vino: 1, falto: 0 })).toBe('Vino a su turno');
    expect(textoAsistencia({ vino: 6, falto: 0 })).toBe('Ha venido a sus 6 turnos');
    expect(textoAsistencia({ vino: 0, falto: 1 })).toBe('Faltó 1 vez de 1 turno');
    expect(textoAsistencia({ vino: 7, falto: 2 })).toBe('Faltó 2 veces de 9 turnos');
  });
});
