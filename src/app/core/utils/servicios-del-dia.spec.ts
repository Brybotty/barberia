import { serviciosPorDiaGuardados } from '../models/ajustes.model';
import { diasLimitados, nombresDeServicios, servicioPermitidoEl, serviciosDelDia } from './servicios-del-dia';

describe('servicios del día', () => {
  const porDia = { '2026-11-23': ['premium'], '2026-11-30': ['sencillo', 'barba'] };

  it('un día sin entrada deja reservar todo; uno limitado, solo lo suyo', () => {
    expect(serviciosDelDia(porDia, '2026-11-22')).toBeNull();
    expect(serviciosDelDia(porDia, '2026-11-23')).toEqual(['premium']);
    expect(servicioPermitidoEl(porDia, '2026-11-22', 'sencillo')).toBeTrue();
    expect(servicioPermitidoEl(porDia, '2026-11-23', 'premium')).toBeTrue();
    expect(servicioPermitidoEl(porDia, '2026-11-23', 'sencillo')).toBeFalse();
    expect(servicioPermitidoEl(porDia, '2026-11-23', undefined)).toBeFalse();
    expect(servicioPermitidoEl(porDia, '2026-11-30', 'barba')).toBeTrue();
  });

  it('de lo guardado descarta lo que no se entiende (y las listas vacías)', () => {
    expect(serviciosPorDiaGuardados(undefined)).toEqual({});
    expect(serviciosPorDiaGuardados(['premium'])).toEqual({});
    expect(serviciosPorDiaGuardados({
      '2026-11-23': ['premium', '', 7],
      '23/11/2026': ['premium'],
      '2026-11-24': [],
      '2026-11-25': 'premium',
    })).toEqual({ '2026-11-23': ['premium'] });
  });

  it('los días limitados desde hoy, en orden', () => {
    const guardado = { '2026-12-01': ['a'], '2026-10-01': ['b'], '2026-11-23': ['c'] };
    expect(diasLimitados(guardado, '2026-10-20').map(d => d.dia)).toEqual(['2026-11-23', '2026-12-01']);
  });

  it('nombra los servicios con los del catálogo', () => {
    const catalogo = [{ id: 'a', nombre: 'Acicale sencillo' }, { id: 'b', nombre: 'Barba2' }, { id: 'p', nombre: 'Premium' }];
    expect(nombresDeServicios(['p'], catalogo)).toBe('Premium');
    expect(nombresDeServicios(['p', 'b'], catalogo)).toBe('Premium y Barba2');
    expect(nombresDeServicios(['a', 'b', 'p'], catalogo)).toBe('Acicale sencillo, Barba2 y Premium');
    // Un servicio que se borró del menú no se nombra.
    expect(nombresDeServicios(['p', 'borrado'], catalogo)).toBe('Premium');
    expect(nombresDeServicios(['borrado'], catalogo)).toBe('ningún servicio del menú actual');
  });
});
