import { ofreceServicio } from './barbero.model';
import { Servicio, esDelMenuDe, precioCon, preciosPropios } from './servicio.model';

type Precio = Pick<Servicio, 'id' | 'precio' | 'precios' | 'soloDe'>;

describe('precios y servicios propios de cada barbero', () => {
  const sencillo: Precio = { id: 'sencillo', precio: 30000, precios: { jose: 35000 } };
  const vip: Precio = { id: 'vip', precio: 80000, soloDe: 'jose' };
  const jose = { id: 'jose', nombre: 'Jose Julian' };
  const trip = { id: 'trip', nombre: 'Trip' };

  it('cada barbero cobra su precio propio; sin uno, el general', () => {
    expect(precioCon(sencillo, 'jose')).toBe(35000);
    expect(precioCon(sencillo, 'trip')).toBe(30000);
    expect(precioCon(sencillo, '')).toBe(30000);
    expect(precioCon(sencillo, undefined)).toBe(30000);
    expect(precioCon({ precio: 30000 }, 'jose')).toBe(30000);
  });

  it('un precio propio vacío o inválido no cuenta (como en las reglas, que nunca lo reciben)', () => {
    expect(precioCon({ precio: 30000, precios: { jose: 0 } }, 'jose')).toBe(30000);
    expect(precioCon({ precio: 30000, precios: { jose: '35000' as unknown as number } }, 'jose')).toBe(30000);
  });

  it('un servicio propio solo está en el menú de su barbero', () => {
    expect(esDelMenuDe(vip, 'jose')).toBeTrue();
    expect(esDelMenuDe(vip, 'trip')).toBeFalse();
    expect(esDelMenuDe(sencillo, 'trip')).toBeTrue();
    expect(ofreceServicio({ id: 'trip' }, vip)).toBeFalse();
    expect(ofreceServicio({ id: 'jose' }, vip)).toBeTrue();
    expect(ofreceServicio({ id: 'jose', serviciosCerrados: ['vip'] }, vip)).toBeFalse();
  });

  it('dice quién cobra otro precio, del más barato al más caro', () => {
    const premium = { precio: 60000, precios: { jose: 70000, trip: 55000 } };
    expect(preciosPropios(premium, [jose, trip]).map(p => [p.barbero.id, p.precio])).toEqual([['trip', 55000], ['jose', 70000]]);
    expect(preciosPropios(sencillo, [jose, trip]).map(p => p.barbero.id)).toEqual(['jose']);
    expect(preciosPropios(vip, [jose, trip])).toEqual([]);
  });
});
