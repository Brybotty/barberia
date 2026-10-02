import { Injectable, inject, NgZone } from '@angular/core';
import {
  Auth, ConfirmationResult, RecaptchaVerifier, User, authState, createUserWithEmailAndPassword, getAdditionalUserInfo,
  GoogleAuthProvider, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPhoneNumber,
  signInWithPopup, signOut, updateProfile,
} from '@angular/fire/auth';
import { Firestore, doc, onSnapshot, setDoc, getDoc } from '@angular/fire/firestore';
import { Observable, of, shareReplay, switchMap } from 'rxjs';
import { Usuario } from '../models/usuario.model';
import { CLIENTE } from '../../config/cliente';

/** Resultado de entrar con el celular: si la cuenta es nueva hay que pedir el nombre. */
export interface IngresoCelular {
  rol: Usuario['rol'];
  pideNombre: boolean;
}

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

  constructor() {
    // Correos de verificación y de contraseña, y el SMS con el código, en español.
    this.auth.languageCode = 'es';
  }

  // ---------- Formas de entrar (todas devuelven el rol para llevar a cada quien a su panel) ----------

  async loginConGoogle(): Promise<Usuario['rol']> {
    const { user } = await signInWithPopup(this.auth, new GoogleAuthProvider());
    return this.guardarPerfil(user);
  }

  async loginConCorreo(email: string, clave: string): Promise<Usuario['rol']> {
    const { user } = await signInWithEmailAndPassword(this.auth, email.trim(), clave);
    return this.guardarPerfil(user);
  }

  /** Cuenta nueva con correo: se le envía el enlace para verificarlo (sin verificar no recibe correos de citas). */
  async crearCuenta(nombre: string, email: string, clave: string): Promise<Usuario['rol']> {
    const { user } = await createUserWithEmailAndPassword(this.auth, email.trim(), clave);
    await updateProfile(user, { displayName: nombre.trim() });
    await sendEmailVerification(user).catch(error => console.error('No se pudo enviar la verificación:', error));
    return this.guardarPerfil(user);
  }

  restablecerClave(email: string): Promise<void> {
    return sendPasswordResetEmail(this.auth, email.trim());
  }

  reenviarVerificacion(): Promise<void> {
    if (!this.auth.currentUser) return Promise.resolve();
    return sendEmailVerification(this.auth.currentUser);
  }

  /**
   * Si el usuario ya verificó su correo (abrió el enlace), refresca la sesión para que las reglas lo sepan.
   * Devuelve si el correo está verificado.
   */
  async correoVerificado(): Promise<boolean> {
    const user = this.auth.currentUser;
    if (!user?.email) return false;
    if (user.emailVerified) return true;
    await user.reload().catch(() => {});
    if (!this.auth.currentUser?.emailVerified) return false;
    await this.auth.currentUser.getIdToken(true);
    return true;
  }

  /** Envía el código por SMS. `verificador` es el reCAPTCHA invisible del botón. */
  enviarCodigo(telefono: string, verificador: RecaptchaVerifier): Promise<ConfirmationResult> {
    return signInWithPhoneNumber(this.auth, telefono, verificador);
  }

  crearVerificador(elemento: HTMLElement): RecaptchaVerifier {
    return new RecaptchaVerifier(this.auth, elemento, { size: 'invisible' });
  }

  async confirmarCodigo(confirmacion: ConfirmationResult, codigo: string): Promise<IngresoCelular> {
    const credencial = await confirmacion.confirm(codigo.trim());
    const perfil = await getDoc(doc(this.firestore, `usuarios/${credencial.user.uid}`));
    const nueva = !!getAdditionalUserInfo(credencial)?.isNewUser || !perfil.exists();
    if (nueva && !credencial.user.displayName) return { rol: 'cliente', pideNombre: true };
    return { rol: await this.guardarPerfil(credencial.user), pideNombre: false };
  }

  /** Último paso de una cuenta nueva por celular: su nombre. */
  async guardarNombre(nombre: string): Promise<Usuario['rol']> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('No hay sesión');
    await updateProfile(user, { displayName: nombre.trim() });
    return this.guardarPerfil(user);
  }

  // ---------- Perfil ----------

  /** Crea o actualiza `usuarios/{uid}` al iniciar sesión. Devuelve el rol (los del equipo ya lo tienen asignado). */
  private async guardarPerfil(user: User): Promise<Usuario['rol']> {
    const userRef = doc(this.firestore, `usuarios/${user.uid}`);
    const docSnap = await getDoc(userRef);
    const email = (user.email ?? '').toLowerCase();

    const datos: Partial<Usuario> = {
      uid: user.uid,
      nombre: user.displayName || docSnap.get('nombre') || 'Cliente',
    };
    // Las cuentas de celular no tienen correo: el perfil solo lleva el de la cuenta (las reglas lo exigen así).
    if (email) datos.email = email;
    if (user.phoneNumber && !docSnap.get('telefono')) datos.telefono = user.phoneNumber;

    if (!docSnap.exists()) {
      // Usuario nuevo: rol por defecto. Las reglas de Firestore solo permiten 'admin' al email configurado.
      datos.rol = email && email === CLIENTE.adminEmail ? 'admin' : 'cliente';
    }
    // Prueba de la autorización de datos (el login muestra el aviso con la política).
    if (!docSnap.get('politicaAceptadaEn')) datos.politicaAceptadaEn = new Date().toISOString();
    // Si ya existe no se envía el rol: las reglas impiden que un usuario cambie el suyo.

    await setDoc(userRef, datos, { merge: true });
    return (docSnap.get('rol') as Usuario['rol'] | undefined) ?? datos.rol ?? 'cliente';
  }

  logout(): Promise<void> {
    return signOut(this.auth);
  }
}
