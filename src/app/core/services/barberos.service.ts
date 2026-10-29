import { Injectable, NgZone, inject } from '@angular/core';
import { Firestore, collection, doc, query, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { Observable, combineLatest, map, shareReplay } from 'rxjs';
import { Barbero, BarberoPublico, DatosPrivadosBarbero, ordenarBarberos } from '../models/barbero.model';
import { conCopiaLocal, escuchar } from '../utils/firestore';
import { Disponibilidad } from '../utils/horario';
import { UsuariosService } from './usuarios.service';

/**
 * Cada barbero son dos documentos con el mismo id:
 * - `barberos/{id}`: nombre, rol, foto, Instagram y disponibilidad. Público (lo ve cualquiera).
 * - `barberosPrivado/{id}`: email de su cuenta y comisión. Solo el admin y el propio barbero.
 */
@Injectable({ providedIn: 'root' })
export class BarberosService {
  private firestore = inject(Firestore);
  private zone = inject(NgZone);
  private usuarios = inject(UsuariosService);
  private barberosRef = collection(this.firestore, 'barberos');
  private privadosRef = collection(this.firestore, 'barberosPrivado');

  /** Lo que hay ahora en Firestore. Una sola escucha para toda la visita: cambiar de página no vuelve a pedirlo. */
  private readonly barberos$ = escuchar<BarberoPublico>(this.zone, this.barberosRef).pipe(
    map(ordenarBarberos),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  /** Para las páginas públicas: primero la copia de la última visita y enseguida lo actual. */
  private readonly publicos$ = this.barberos$.pipe(
    conCopiaLocal('barberos'),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  /** Perfiles públicos (la página de inicio y la reserva). */
  listar(): Observable<BarberoPublico[]> {
    return this.publicos$;
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
    const correo = barbero.emailAsociado.trim().toLowerCase();
    const ref = doc(this.barberosRef);
    const lote = writeBatch(this.firestore);
    lote.set(ref, publico(barbero));
    lote.set(doc(this.privadosRef, ref.id), { emailAsociado: correo, comision: barbero.comision ?? null });
    await lote.commit();
    if (correo) {
      await this.usuarios.reasignarRolPorEmail(correo, 'cliente', 'barbero');
    }
  }

  /** Actualiza el perfil. Si cambia el email, mueve el rol 'barbero' a la cuenta nueva. */
  async actualizar(anterior: Barbero, cambios: Barbero): Promise<void> {
    const correo = cambios.emailAsociado.trim().toLowerCase();
    const lote = writeBatch(this.firestore);
    lote.set(doc(this.barberosRef, anterior.id), publico(cambios));
    lote.set(doc(this.privadosRef, anterior.id), { emailAsociado: correo, comision: cambios.comision ?? null });
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

  /** Servicios que no se reservan en línea con ese barbero (solo el admin). Sin ninguno, se reservan todos. */
  guardarServiciosCerrados(barberoId: string, cerrados: string[]): Promise<void> {
    return updateDoc(doc(this.barberosRef, barberoId), { serviciosCerrados: [...new Set(cerrados)].sort() });
  }

  /** Día libre de cada semana y descanso fijo. Lo cambia el propio barbero (o el admin). */
  guardarDisponibilidad(barberoId: string, disponibilidad: Disponibilidad): Promise<void> {
    return updateDoc(doc(this.barberosRef, barberoId), {
      diasLibres: [...(disponibilidad.diasLibres ?? [])].sort(),
      descanso: disponibilidad.descanso ?? null,
    });
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

/** Solo los campos del documento público, sin `undefined` (Firestore no lo acepta) ni datos privados. */
function publico(barbero: Barbero): Omit<BarberoPublico, 'id'> {
  return {
    nombre: barbero.nombre.trim().slice(0, 80),
    especialidad: (barbero.especialidad ?? '').trim().slice(0, 80),
    avatar: (barbero.avatar ?? '').trim(),
    instagram: (barbero.instagram ?? '').trim().replace(/^@/, '').slice(0, 30),
    orden: Number.isFinite(Number(barbero.orden)) ? Number(barbero.orden) : 0,
    diasLibres: [...(barbero.diasLibres ?? [])].sort(),
    descanso: barbero.descanso ?? null,
    // Se conserva al editar el perfil en Equipo (este documento se escribe completo).
    serviciosCerrados: [...(barbero.serviciosCerrados ?? [])],
  };
}

/** Junta cada perfil público con sus datos privados (mismo id). Sin datos privados: sin email y sin comisión. */
function unir(publicos: BarberoPublico[], privados: (DatosPrivadosBarbero & { id: string })[]): Barbero[] {
  return publicos.map(p => {
    const privado = privados.find(x => x.id === p.id);
    return { ...p, emailAsociado: privado?.emailAsociado ?? '', comision: privado?.comision ?? null };
  });
}
