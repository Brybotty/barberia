import { Injectable, NgZone, inject } from '@angular/core';
import { Firestore, collection, doc, getDocs, query, updateDoc, where } from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { Usuario } from '../models/usuario.model';
import { escuchar } from '../utils/firestore';

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private firestore = inject(Firestore);
  private zone = inject(NgZone);
  private usuariosRef = collection(this.firestore, 'usuarios');

  /** Solo para administradores (las reglas lo exigen). */
  listar(): Observable<Usuario[]> {
    return escuchar<Usuario>(this.zone, this.usuariosRef).pipe(
      map(usuarios => usuarios.map(({ id, ...u }) => ({ ...u, uid: id }))),
    );
  }

  /** El propio usuario guarda su teléfono para no escribirlo en cada compra. */
  guardarTelefono(uid: string, telefono: string): Promise<void> {
    return updateDoc(doc(this.firestore, `usuarios/${uid}`), { telefono });
  }

  cambiarRol(uid: string, rol: Usuario['rol']): Promise<void> {
    return updateDoc(doc(this.firestore, `usuarios/${uid}`), { rol });
  }

  /** Pasa de `desde` a `hacia` el rol de las cuentas con ese email. No toca a los admins. */
  async reasignarRolPorEmail(email: string, desde: Usuario['rol'], hacia: Usuario['rol']): Promise<void> {
    const snap = await getDocs(query(this.usuariosRef, where('email', '==', email.toLowerCase())));
    await Promise.all(
      snap.docs
        .filter(d => d.data()['rol'] === desde)
        .map(d => updateDoc(d.ref, { rol: hacia })),
    );
  }
}
