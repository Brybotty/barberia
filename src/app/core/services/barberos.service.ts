import { Injectable, NgZone, inject } from '@angular/core';
import { Firestore, addDoc, collection, deleteDoc, doc, query, updateDoc, where } from '@angular/fire/firestore';
import { Observable, shareReplay } from 'rxjs';
import { Barbero } from '../models/barbero.model';
import { escuchar } from '../utils/firestore';
import { UsuariosService } from './usuarios.service';

@Injectable({ providedIn: 'root' })
export class BarberosService {
  private firestore = inject(Firestore);
  private zone = inject(NgZone);
  private usuarios = inject(UsuariosService);
  private barberosRef = collection(this.firestore, 'barberos');

  private readonly barberos$ = escuchar<Barbero>(this.zone, this.barberosRef).pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  listar(): Observable<Barbero[]> {
    return this.barberos$;
  }

  /** Perfiles de barbero enlazados a una cuenta (normalmente 0 o 1). */
  delEmail(email: string): Observable<Barbero[]> {
    return escuchar<Barbero>(this.zone, query(this.barberosRef, where('emailAsociado', '==', email.toLowerCase())));
  }

  async crear(barbero: Barbero): Promise<void> {
    const emailAsociado = barbero.emailAsociado.trim().toLowerCase();
    await addDoc(this.barberosRef, { ...barbero, emailAsociado });
    if (emailAsociado) {
      await this.usuarios.reasignarRolPorEmail(emailAsociado, 'cliente', 'barbero');
    }
  }

  /** Actualiza el perfil. Si cambia el email, mueve el rol 'barbero' a la cuenta nueva. */
  async actualizar(anterior: Barbero, cambios: Barbero): Promise<void> {
    const { id, ...datos } = cambios;
    const emailAsociado = datos.emailAsociado.trim().toLowerCase();
    await updateDoc(doc(this.firestore, `barberos/${anterior.id}`), { ...datos, emailAsociado });
    if (emailAsociado !== anterior.emailAsociado) {
      if (anterior.emailAsociado) {
        await this.usuarios.reasignarRolPorEmail(anterior.emailAsociado, 'barbero', 'cliente');
      }
      if (emailAsociado) {
        await this.usuarios.reasignarRolPorEmail(emailAsociado, 'cliente', 'barbero');
      }
    }
  }

  async eliminar(barbero: Barbero): Promise<void> {
    await deleteDoc(doc(this.firestore, `barberos/${barbero.id}`));
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
