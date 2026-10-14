import { Injectable, inject } from '@angular/core';
import { FirebaseApp } from '@angular/fire/app';
import { environment } from '../../../environments/environment';
import { prepararFoto } from '../../shared/utils/imagen';

/** Carpeta del bucket con las fotos del staff. Debe coincidir con storage.rules. */
export const CARPETA_STAFF = 'staff';

export interface FotoStaff {
  nombre: string;
  url: string;
}

type Sdk = { m: typeof import('@angular/fire/storage'); storage: import('@angular/fire/storage').Storage };

/**
 * Fotos del staff en Firebase Storage (solo el admin puede subirlas, listarlas o borrarlas).
 * La página pública las muestra con su URL de descarga, así que el SDK de Storage se descarga
 * solo cuando el panel lo necesita y no pesa en la página de inicio.
 */
@Injectable({ providedIn: 'root' })
export class FotosStaffService {
  private app = inject(FirebaseApp);
  private sdk?: Promise<Sdk>;

  private cargar(): Promise<Sdk> {
    return (this.sdk ??= import('@angular/fire/storage').then(m => {
      const storage = m.getStorage(this.app);
      if (environment.emuladores) m.connectStorageEmulator(storage, '127.0.0.1', 9199);
      return { m, storage };
    }));
  }

  /** Comprime la foto, la sube a la carpeta del staff y devuelve su URL de descarga (la que se guarda como avatar). */
  async subir(archivo: File, nombreBarbero: string): Promise<string> {
    const foto = await prepararFoto(archivo);
    const { m, storage } = await this.cargar();
    const extension = foto.type === 'image/webp' ? 'webp' : 'jpg';
    const ref = m.ref(storage, `${CARPETA_STAFF}/${nombreDeArchivo(nombreBarbero)}-${Date.now()}.${extension}`);
    // El nombre del archivo nunca se repite: el navegador puede guardarla en caché por un año.
    await m.uploadBytes(ref, foto, { contentType: foto.type, cacheControl: 'public, max-age=31536000, immutable' });
    return m.getDownloadURL(ref);
  }

  /** Fotos que ya están en la carpeta (también las subidas desde la consola), de la más nueva a la más vieja. */
  async listar(): Promise<FotoStaff[]> {
    const { m, storage } = await this.cargar();
    const { items } = await m.listAll(m.ref(storage, CARPETA_STAFF));
    const fotos = await Promise.all(items.map(async item => {
      const datos = await m.getMetadata(item);
      // Algunas herramientas suben las fotos como "application/octet-stream": también vale la extensión.
      if (!datos.contentType?.startsWith('image/') && !/\.(jpe?g|png|webp|avif|gif)$/i.test(item.name)) return null;
      return { nombre: item.name, url: await m.getDownloadURL(item), creada: datos.timeCreated };
    }));
    return fotos
      .filter(f => f !== null)
      .sort((a, b) => b.creada.localeCompare(a.creada))
      .map(({ nombre, url }) => ({ nombre, url }));
  }

  /** Borra una foto de la carpeta del staff a partir de su URL. Los enlaces de otros sitios se ignoran. */
  async borrar(url: string): Promise<void> {
    if (!esDeLaCarpeta(url)) return;
    const { m, storage } = await this.cargar();
    await m.deleteObject(m.ref(storage, url));
  }
}

/** ¿La URL es de una foto de la carpeta del staff en Storage? (p. ej. .../o/staff%2Ftrip-123.webp?alt=media&token=...) */
export function esDeLaCarpeta(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    return decodeURIComponent(pathname).includes(`/o/${CARPETA_STAFF}/`);
  } catch {
    return false;
  }
}

/** "Juan Sebastián \"Trip\"" → "juan-sebastian-trip" */
function nombreDeArchivo(nombre: string): string {
  const limpio = nombre
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return limpio || 'barbero';
}
