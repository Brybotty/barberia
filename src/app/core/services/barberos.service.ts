import { Injectable, NgZone, inject } from '@angular/core';
import { Firestore, collection, doc, query, where, writeBatch } from '@angular/fire/firestore';
import { Observable, combineLatest, map, shareReplay } from 'rxjs';
import { Barbero, BarberoPublico, DatosPrivadosBarbero } from '../models/barbero.model';
import { escuchar } from '../utils/firestore';
import { UsuariosService } from './usuarios.service';

/**
 * Cada barbero son dos documentos con el mismo id:
 * - `barberos/{id}`: nombre, especialidad y foto. Público (lo ve cualquiera).
 * - `barberosPrivado/{id}`: email de su cuenta y comisión. Solo el admin y el propio barbero.
 */
@Injectable({ providedIn: 'root' })
export class BarberosService {
  private firestore = inject(Firestore);
  private zone = inject(NgZone);
  private usuarios = inject(UsuariosService);
  private barberosRef = collection(this.firestore, 'barberos');
  private privadosRef = collection(this.firestore, 'barberosPrivado');

  private readonly barberos$ = escuchar<BarberoPublico>(this.zone, this.barberosRef).pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  /** Perfiles públicos (para reservar). */
  listar(): Observable<BarberoPublico[]> {
    return this.barberos$;
  }

  /** Perfiles completos. Solo para el admin: los lee todos. */
  listarCompleto(): Observable<Barbero[]> {
    return combineLatest([this.barberos$, escuchar<DatosPrivadosBarbero>(this.zone, this.privadosRef)]).pipe(
      map(([publicos, privados]) => unir(publicos, privados)),
    );
  }

  /** Perfiles de barbero enlazados a una cuenta (normalmente 0 o 1). Cada barbero solo encuentra el suyo. */
  delEmail(email: string): Observable<Barbero[]> {
    const suyos = query(this.privadosRef, where('emailAsociado', '==', email.toLowerCase()));
    return combineLatest([this.barberos$, escuchar<DatosPrivadosBarbero>(this.zone, suyos)]).pipe(
      map(([publicos, privados]) => unir(publicos.filter(p => privados.some(x => x.id === p.id)), privados)),
    );
  }

  async crear(barbero: Barbero): Promise<void> {
    const { id: _, emailAsociado, comision, ...publico } = barbero;
    const correo = emailAsociado.trim().toLowerCase();
    const ref = doc(this.barberosRef);
    const lote = writeBatch(this.firestore);
    lote.set(ref, publico);
    lote.set(doc(this.privadosRef, ref.id), { emailAsociado: correo, comision: comision ?? null });
    await lote.commit();
    if (correo) {
      await this.usuarios.reasignarRolPorEmail(correo, 'cliente', 'barbero');
    }
  }

  /** Actualiza el perfil. Si cambia el email, mueve el rol 'barbero' a la cuenta nueva. */
  async actualizar(anterior: Barbero, cambios: Barbero): Promise<void> {
    const { id: _, emailAsociado, comision, ...publico } = cambios;
    const correo = emailAsociado.trim().toLowerCase();
    const lote = writeBatch(this.firestore);
    lote.set(doc(this.barberosRef, anterior.id), publico);
    lote.set(doc(this.privadosRef, anterior.id), { emailAsociado: correo, comision: comision ?? null });
    await lote.commit();
    if (correo !== anterior.emailAsociado) {
      if (anterior.emailAsociado) {
        await this.usuarios.reasignarRolPorEmail(anterior.emailAsociado, 'barbero', 'cliente');
      }
      if (correo) {
        await this.usuarios.reasignarRolPorEmail(correo, 'cliente', 'barbero');
      }
    }
  }

  async eliminar(barbero: Barbero): Promise<void> {
    const lote = writeBatch(this.firestore);
    lote.delete(doc(this.barberosRef, barbero.id));
    lote.delete(doc(this.privadosRef, barbero.id));
    await lote.commit();
    if (barbero.emailAsociado) {
      await this.usuarios.reasignarRolPorEmail(barbero.emailAsociado, 'barbero', 'cliente');
    }
  }

  /**
   * Da el rol 'barbero' a las cuentas enlazadas que aún son 'cliente'.
   * Cubre al barbero que se registró en el staff antes de iniciar sesión por primera vez.
   */
  async sincronizarRoles(barberos: Barbero[]): Promise<void> {
    await Promise.all(
      barberos
        .filter(b => b.emailAsociado)
        .map(b => this.usuarios.reasignarRolPorEmail(b.emailAsociado, 'cliente', 'barbero')),
    );
  }
}

/** Junta cada perfil público con sus datos privados (mismo id). Sin datos privados: sin email y sin comisión. */
function unir(publicos: BarberoPublico[], privados: (DatosPrivadosBarbero & { id: string })[]): Barbero[] {
  return publicos.map(p => {
    const privado = privados.find(x => x.id === p.id);
    return { ...p, emailAsociado: privado?.emailAsociado ?? '', comision: privado?.comision ?? null };
  });
}
