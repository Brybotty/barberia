import { detectarDispositivo } from './instalacion.service';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko)';

describe('instalar la app: qué celular es', () => {
  it('reconoce el iPhone, en Safari o en Chrome', () => {
    expect(detectarDispositivo(`${IPHONE} Version/17.5 Mobile/15E148 Safari/604.1`)).toEqual({ sistema: 'ios', dentroDeOtraApp: false });
    expect(detectarDispositivo(`${IPHONE} CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1`).sistema).toBe('ios');
  });

  it('reconoce el iPad, que se presenta como un Mac con pantalla táctil', () => {
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
    expect(detectarDispositivo(mac, 5, 'MacIntel').sistema).toBe('ios');
    expect(detectarDispositivo(mac, 0, 'MacIntel').sistema).toBe('otro'); // un Mac de verdad
  });

  it('reconoce Android y el computador', () => {
    expect(detectarDispositivo(`${ANDROID} Chrome/126.0.0.0 Mobile Safari/537.36`)).toEqual({ sistema: 'android', dentroDeOtraApp: false });
    expect(detectarDispositivo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36').sistema).toBe('otro');
  });

  it('avisa cuando la página está abierta dentro de otra app (desde ahí no se puede instalar)', () => {
    expect(detectarDispositivo(`${IPHONE} Mobile/15E148 Instagram 337.0.2.24.92 (iPhone15,2; iOS 17_5)`).dentroDeOtraApp).toBeTrue();
    expect(detectarDispositivo(`${IPHONE} Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.31.107]`).dentroDeOtraApp).toBeTrue();
    // El navegador incrustado de Android se anuncia con "; wv)".
    expect(detectarDispositivo('Mozilla/5.0 (Linux; Android 14; SM-A546B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36').dentroDeOtraApp).toBeTrue();
  });
});
