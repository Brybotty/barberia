import { Injectable, signal } from '@angular/core';

/** El aviso de instalación que entrega el navegador (aún no está en los tipos de TypeScript). */
interface AvisoDeInstalacion extends Event {
  prompt(): Promise<unknown>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface Dispositivo {
  sistema: 'ios' | 'android' | 'otro';
  /** La página está abierta dentro de otra app (Instagram, Facebook, TikTok…): desde ahí no se puede instalar. */
  dentroDeOtraApp: boolean;
}

/**
 * Qué celular y qué navegador es, a partir de cómo se presenta. `toques` y `plataforma` distinguen al iPad, que
 * se presenta como un Mac.
 */
export function detectarDispositivo(agente: string, toques = 0, plataforma = ''): Dispositivo {
  const ios = /iPad|iPhone|iPod/.test(agente) || (plataforma === 'MacIntel' && toques > 1);
  const android = /Android/.test(agente);
  return {
    sistema: ios ? 'ios' : android ? 'android' : 'otro',
    dentroDeOtraApp: /Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|musical_ly|Bytedance|Snapchat|; wv\)/.test(agente),
  };
}

/** ¿Está abierta desde su ícono, como una app (sin las barras del navegador)? */
function abiertaComoApp(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * Instalar la página como app (queda con su ícono en la pantalla de inicio).
 *
 * - **Android y computador** (Chrome, Edge, Samsung Internet): cuando el navegador considera que la página se puede
 *   instalar, avisa con un evento. Aquí se guarda, y `instalar()` abre el cuadro del sistema con un toque.
 *   El navegador decide cuándo avisar (pide que el visitante haya tocado la página y lleve un rato en ella), así
 *   que puede no estar listo al llegar: mientras tanto se muestran los pasos del menú.
 * - **iPhone y iPad:** Apple no deja que una página se instale por su cuenta ni ofrece ningún aviso. Siempre es a
 *   mano: Compartir → Agregar a inicio. La página de instalar muestra esos pasos.
 *
 * Se crea al arrancar la app (ver App): el navegador avisa una sola vez, esté o no abierta la página de instalar.
 */
@Injectable({ providedIn: 'root' })
export class InstalacionService {
  private aviso: AvisoDeInstalacion | null = null;

  readonly dispositivo = detectarDispositivo(navigator.userAgent, navigator.maxTouchPoints, navigator.platform);
  /** El navegador ya ofreció instalarla: se puede con un toque. */
  readonly conUnToque = signal(false);
  /** Ya está abierta como app, o se acaba de instalar. */
  readonly instalada = signal(abiertaComoApp());

  constructor() {
    addEventListener('beforeinstallprompt', evento => {
      // Se guarda para abrirlo cuando el visitante toque "Instalar" (el navegador solo lo abre con un toque).
      evento.preventDefault();
      this.aviso = evento as AvisoDeInstalacion;
      this.conUnToque.set(true);
    });
    addEventListener('appinstalled', () => {
      this.aviso = null;
      this.conUnToque.set(false);
      this.instalada.set(true);
    });
  }

  /** Abre el cuadro de instalación del sistema. Devuelve si el visitante aceptó. */
  async instalar(): Promise<boolean> {
    const aviso = this.aviso;
    if (!aviso) return false;
    // Cada aviso sirve una sola vez; si el visitante dice que no, el navegador entrega otro más adelante.
    this.aviso = null;
    this.conUnToque.set(false);
    await aviso.prompt();
    return (await aviso.userChoice).outcome === 'accepted';
  }
}
