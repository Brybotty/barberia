import { Injectable, inject, NgZone } from '@angular/core';
import { Auth, authState, GoogleAuthProvider, signInWithPopup, signOut } from '@angular/fire/auth';
import { Firestore, doc, onSnapshot, setDoc, getDoc } from '@angular/fire/firestore';
import { Observable, of, shareReplay, switchMap } from 'rxjs';
import { Usuario } from '../models/usuario.model';
import { CLIENTE } from '../../config/cliente';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private ngZone = inject(NgZone);

  readonly user$ = authState(this.auth);

  /** Perfil del usuario en `usuarios/{uid}`. Compartido: un solo listener para toda la app. */
  readonly currentUserProfile$: Observable<Usuario | null> = this.user$.pipe(
    switchMap(user => {
      if (!user) return of(null);
      const userRef = doc(this.firestore, `usuarios/${user.uid}`);

      return new Observable<Usuario | null>(subscriber =>
        onSnapshot(userRef, (snapshot) => {
          this.ngZone.run(() => subscriber.next(snapshot.exists() ? snapshot.data() as Usuario : null));
        }, (error) => {
          this.ngZone.run(() => {
            console.error('Error leyendo el perfil de usuario:', error);
            subscriber.next(null);
          });
        })
      );
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  async loginConGoogle(): Promise<void> {
    const { user } = await signInWithPopup(this.auth, new GoogleAuthProvider());
    const userRef = doc(this.firestore, `usuarios/${user.uid}`);
    const email = (user.email ?? '').toLowerCase();

    const datos: Partial<Usuario> = {
      uid: user.uid,
      nombre: user.displayName || 'Usuario',
      email,
    };

    const docSnap = await getDoc(userRef);
    if (!docSnap.exists()) {
      // Usuario nuevo: rol por defecto. Las reglas de Firestore solo permiten 'admin' al email configurado.
      datos.rol = email === CLIENTE.adminEmail ? 'admin' : 'cliente';
    }
    // Prueba de la autorización de datos (el login muestra el aviso con la política).
    if (!docSnap.get('politicaAceptadaEn')) datos.politicaAceptadaEn = new Date().toISOString();
    // Si ya existe no se envía el rol: las reglas impiden que un usuario cambie el suyo.

    await setDoc(userRef, datos, { merge: true });
  }

  logout(): Promise<void> {
    return signOut(this.auth);
  }
}
