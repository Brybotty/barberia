import { Component, ElementRef, OnDestroy, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationResult, RecaptchaVerifier } from '@angular/fire/auth';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CLIENTE } from '../../../config/cliente';
import { Usuario } from '../../../core/models/usuario.model';
import { MarcaComponent } from '../../../shared/components/marca/marca.component';

type Metodo = 'correo' | 'celular';
type ModoCorreo = 'entrar' | 'crear';
type PasoCelular = 'numero' | 'codigo' | 'nombre';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [MarcaComponent, RouterLink, FormsModule],
  templateUrl: './login.component.html'
})
export class LoginComponent implements OnDestroy {
  readonly cliente = CLIENTE;
  authService = inject(AuthService);
  router = inject(Router);
  private route = inject(ActivatedRoute);
  private notificaciones = inject(NotificationService);

  @ViewChild('recaptcha') private recaptcha?: ElementRef<HTMLElement>;
  private verificador?: RecaptchaVerifier;
  private confirmacion?: ConfirmationResult;

  metodo: Metodo = 'correo';
  modoCorreo: ModoCorreo = 'entrar';
  pasoCelular: PasoCelular = 'numero';

  nombre = '';
  correo = '';
  clave = '';
  verClave = false;
  celular = '';
  codigo = '';

  enviando = false;
  error = '';

  ngOnDestroy() {
    this.reiniciarVerificador();
  }

  cambiarMetodo(metodo: Metodo) {
    this.metodo = metodo;
    this.error = '';
    // El reCAPTCHA se prepara apenas se abre la pestaña: con más tiempo en la página, Google pide menos veces las imágenes.
    if (metodo === 'celular') setTimeout(() => this.prepararVerificador());
  }

  cambiarModo(modo: ModoCorreo) {
    this.modoCorreo = modo;
    this.error = '';
  }

  // ---------- Google ----------

  async login() {
    try {
      const rol = await this.authService.loginConGoogle();
      await this.irDespuesDeEntrar(rol);
    } catch (error: any) {
      // El usuario cerró el popup: no es un error que haya que mostrar.
      if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') return;
      console.error('Error al iniciar sesión:', error);
      this.notificaciones.error('Error al iniciar sesión', mensajeDeError(error?.code) || 'Inténtalo de nuevo.');
    }
  }

  // ---------- Correo ----------

  enviarCorreo() {
    return this.modoCorreo === 'entrar' ? this.entrarConCorreo() : this.crearCuenta();
  }

  private async entrarConCorreo() {
    if (!this.correo.trim() || !this.clave) return this.mostrarError('Escribe tu correo y tu contraseña.');
    await this.intentar(async () => this.irDespuesDeEntrar(await this.authService.loginConCorreo(this.correo, this.clave)));
  }

  private async crearCuenta() {
    if (!this.nombre.trim()) return this.mostrarError('Escribe tu nombre.');
    if (!this.correo.trim()) return this.mostrarError('Escribe tu correo.');
    if (this.clave.length < 6) return this.mostrarError('La contraseña debe tener al menos 6 caracteres.');
    await this.intentar(async () => {
      const rol = await this.authService.crearCuenta(this.nombre, this.correo, this.clave);
      this.notificaciones.exito('¡Bienvenido!', 'Te enviamos un correo para verificar tu cuenta. Verifícala para recibir la confirmación de tus citas.');
      await this.irDespuesDeEntrar(rol);
    });
  }

  async olvideClave() {
    this.error = '';
    if (!this.correo.trim()) return this.mostrarError('Escribe tu correo y vuelve a tocar "¿Olvidaste tu contraseña?".');
    await this.intentar(async () => {
      try {
        await this.authService.restablecerClave(this.correo);
      } catch (error: any) {
        // No se revela si el correo tiene cuenta: mismo mensaje en ambos casos.
        if (error?.code !== 'auth/user-not-found') throw error;
      }
      this.notificaciones.exito('Revisa tu correo', 'Si ese correo tiene una cuenta, te llegó un enlace para poner una contraseña nueva.');
    });
  }

  // ---------- Celular ----------

  /** Celular colombiano en formato internacional (+573001234567), o null si no es válido. */
  get celularCompleto(): string | null {
    const digitos = this.celular.replace(/\D/g, '');
    const local = digitos.length === 12 && digitos.startsWith('57') ? digitos.slice(2) : digitos;
    return /^3\d{9}$/.test(local) ? `+57${local}` : null;
  }

  async enviarCodigo() {
    const numero = this.celularCompleto;
    if (!numero) return this.mostrarError('Escribe tu celular: 10 dígitos que empiezan por 3.');
    await this.intentar(async () => {
      try {
        this.confirmacion = await this.authService.enviarCodigo(numero, this.prepararVerificador());
      } catch (error) {
        // El reCAPTCHA no se puede reutilizar tras un error: se crea uno nuevo para el siguiente intento.
        this.reiniciarVerificador();
        setTimeout(() => this.prepararVerificador());
        throw error;
      }
      this.codigo = '';
      this.pasoCelular = 'codigo';
    });
  }

  async verificarCodigo() {
    if (!/^\d{6}$/.test(this.codigo.trim())) return this.mostrarError('El código tiene 6 dígitos.');
    await this.intentar(async () => {
      const resultado = await this.authService.confirmarCodigo(this.confirmacion!, this.codigo);
      if (resultado.pideNombre) {
        this.pasoCelular = 'nombre';
        return;
      }
      await this.irDespuesDeEntrar(resultado.rol);
    });
  }

  async guardarNombre() {
    if (!this.nombre.trim()) return this.mostrarError('Escribe tu nombre.');
    await this.intentar(async () => this.irDespuesDeEntrar(await this.authService.guardarNombre(this.nombre)));
  }

  cambiarNumero() {
    this.pasoCelular = 'numero';
    this.codigo = '';
    this.error = '';
  }

  /** reCAPTCHA invisible, en un elemento nuevo cada vez (Firebase no deja volver a pintarlo en el mismo). */
  private prepararVerificador(): RecaptchaVerifier {
    if (!this.verificador) {
      const contenedor = this.recaptcha!.nativeElement;
      contenedor.replaceChildren();
      const elemento = document.createElement('div');
      contenedor.appendChild(elemento);
      this.verificador = this.authService.crearVerificador(elemento);
      this.verificador.render().catch(error => console.error('No se pudo preparar el reCAPTCHA:', error));
    }
    return this.verificador;
  }

  private reiniciarVerificador() {
    try { this.verificador?.clear(); } catch { /* ya estaba limpio */ }
    this.verificador = undefined;
  }

  // ---------- Común ----------

  private mostrarError(mensaje: string) {
    this.error = mensaje;
  }

  private async intentar(accion: () => Promise<unknown>) {
    this.error = '';
    this.enviando = true;
    try {
      await accion();
    } catch (error: any) {
      const mensaje = mensajeDeError(error?.code);
      if (!mensaje) console.error('Error al iniciar sesión:', error);
      this.error = mensaje || 'No se pudo completar. Inténtalo de nuevo.';
    } finally {
      this.enviando = false;
    }
  }

  /** Vuelve a donde iba; si no iba a ningún lado, el equipo entra a su panel y el cliente a reservar. */
  private irDespuesDeEntrar(rol: Usuario['rol']) {
    // Solo rutas internas ('/x', no '//dominio.com').
    const volver = this.route.snapshot.queryParamMap.get('volver');
    if (volver?.startsWith('/') && !volver.startsWith('//')) return this.router.navigateByUrl(volver);
    return this.router.navigateByUrl(rol === 'admin' ? '/admin' : rol === 'barbero' ? '/barbero' : '/reservar');
  }
}

function mensajeDeError(codigo: string | undefined): string {
  switch (codigo) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Correo o contraseña incorrectos.';
    case 'auth/invalid-email':
      return 'Revisa el correo: no parece válido.';
    case 'auth/email-already-in-use':
      return 'Ese correo ya tiene una cuenta. Entra con tu contraseña o usa "¿Olvidaste tu contraseña?".';
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres.';
    case 'auth/invalid-phone-number':
    case 'auth/missing-phone-number':
      return 'Revisa el celular: 10 dígitos que empiezan por 3.';
    case 'auth/invalid-verification-code':
      return 'El código no es correcto. Revísalo e inténtalo de nuevo.';
    case 'auth/code-expired':
      return 'El código venció. Toca "Cambiar número" y pide uno nuevo.';
    case 'auth/quota-exceeded':
      return 'Se alcanzó el límite de mensajes por hoy. Entra con Google o con tu correo.';
    case 'auth/invalid-app-credential':
    case 'auth/missing-app-credential':
      return 'No pudimos verificar el reCAPTCHA. Inténtalo de nuevo; si sigue fallando, entra con Google o con tu correo.';
    case 'auth/captcha-check-failed':
      return 'No pudimos comprobar que no eres un robot. Recarga la página e inténtalo de nuevo.';
    case 'auth/operation-not-allowed':
      return 'Esta forma de entrar no está disponible en este momento. Usa otra.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
    case 'auth/user-disabled':
      return 'Esta cuenta está desactivada. Escríbenos para ayudarte.';
    case 'auth/network-request-failed':
      return 'Sin conexión. Revisa tu internet.';
    default:
      return '';
  }
}
