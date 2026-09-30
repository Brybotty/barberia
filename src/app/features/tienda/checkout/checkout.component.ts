import { Component, computed, effect, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { User } from '@angular/fire/auth';
import { catchError, filter, firstValueFrom, of } from 'rxjs';
import { CLIENTE } from '../../../config/cliente';
import { MetodoPago, SolicitudPedido, TipoEntrega, costoEnvio, metodosPara } from '../../../core/models/pedido.model';
import { Producto } from '../../../core/models/producto.model';
import { AjustesService } from '../../../core/services/ajustes.service';
import { AuthService } from '../../../core/services/auth.service';
import { CarritoService, LineaCarrito, subtotalDe } from '../../../core/services/carrito.service';
import { NotificationService } from '../../../core/services/notification.service';
import { PagosService } from '../../../core/services/pagos.service';
import { PedidosService } from '../../../core/services/pedidos.service';
import { ProductosService } from '../../../core/services/productos.service';
import { UsuariosService } from '../../../core/services/usuarios.service';
import { DEPARTAMENTOS, esCelularValido, limpiarCelular } from '../../../core/utils/colombia';
import { ProductoImagenComponent } from '../../../shared/components/producto-imagen/producto-imagen.component';

interface OpcionEntrega {
  tipo: TipoEntrega;
  titulo: string;
  detalle: string;
  costo: number;
}

interface OpcionPago {
  metodo: MetodoPago;
  titulo: string;
  detalle: string;
}

type Campo = 'nombre' | 'telefono' | 'email' | 'direccion' | 'departamento' | 'ciudad' | 'politica';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, RouterLink, ProductoImagenComponent],
  templateUrl: './checkout.component.html',
})
export class CheckoutComponent {
  private auth = inject(AuthService);
  private pedidos = inject(PedidosService);
  private pagos = inject(PagosService);
  private usuarios = inject(UsuariosService);
  private router = inject(Router);
  private notificaciones = inject(NotificationService);
  readonly carrito = inject(CarritoService);
  readonly ajustes = inject(AjustesService).ajustes;
  readonly cliente = CLIENTE;
  readonly departamentos = DEPARTAMENTOS;

  private productos = toSignal(
    inject(ProductosService).todos().pipe(catchError(() => of([] as Producto[]))),
    { initialValue: null },
  );
  /** undefined mientras Firebase Auth resuelve la sesión. */
  readonly usuario = toSignal(this.auth.user$);
  private perfil = toSignal(this.auth.currentUserProfile$);

  readonly lineas = computed<LineaCarrito[]>(() => {
    const productos = this.productos();
    return productos ? this.carrito.lineas(productos) : [];
  });
  readonly cargando = computed(() => this.productos() === null);
  readonly hayNoDisponibles = computed(() => this.lineas().some(l => !l.disponible));
  readonly subtotal = computed(() => subtotalDe(this.lineas()));

  readonly entrega = signal<TipoEntrega>('recoger');
  readonly metodo = signal<MetodoPago | null>(null);

  readonly opcionesEntrega = computed<OpcionEntrega[]>(() => {
    const { entrega } = this.ajustes().tienda;
    const ciudad = CLIENTE.tienda?.ciudad ?? '';
    const opciones: OpcionEntrega[] = [];
    if (entrega.recoger) opciones.push({ tipo: 'recoger', titulo: 'Recoger en la barbería', detalle: CLIENTE.ubicacion?.direccion ?? CLIENTE.nombre, costo: 0 });
    if (entrega.local.activo) opciones.push({ tipo: 'local', titulo: `Domicilio en ${ciudad}`, detalle: 'Te lo llevamos a la puerta de tu casa', costo: costoEnvio('local', this.subtotal(), this.ajustes().tienda) });
    if (entrega.nacional.activo) opciones.push({ tipo: 'nacional', titulo: 'Envío nacional', detalle: 'A cualquier ciudad de Colombia por transportadora', costo: costoEnvio('nacional', this.subtotal(), this.ajustes().tienda) });
    return opciones;
  });

  readonly opcionesPago = computed<OpcionPago[]>(() =>
    metodosPara(this.entrega(), this.ajustes().tienda).map(metodo => ({
      metodo,
      ...{
        'en-linea': { titulo: 'Pago en línea', detalle: 'Tarjeta, PSE, Nequi o Bancolombia, con Wompi' },
        contraentrega: { titulo: 'Contraentrega', detalle: 'Pagas en efectivo o transferencia al recibir' },
        'en-tienda': { titulo: 'Pago en la barbería', detalle: 'Pagas cuando recojas tu pedido' },
      }[metodo],
    })),
  );

  readonly envio = computed(() => costoEnvio(this.entrega(), this.subtotal(), this.ajustes().tienda));
  readonly total = computed(() => this.subtotal() + this.envio());
  /** Cuánto falta para el envío gratis (0 si no aplica). */
  readonly faltaParaGratis = computed(() => {
    const gratisDesde = this.ajustes().tienda.entrega.gratisDesde;
    if (this.entrega() === 'recoger' || gratisDesde <= 0) return 0;
    return Math.max(0, gratisDesde - this.subtotal());
  });

  form = { nombre: '', telefono: '', email: '', documento: '', direccion: '', barrio: '', departamento: '', ciudad: '', notas: '' };
  /** Autorización del tratamiento de datos (Ley 1581 de 2012). */
  aceptaPolitica = false;
  readonly intentoEnviar = signal(false);
  readonly enviando = signal(false);

  constructor() {
    // Si el admin desactiva una opción, elegir otra válida.
    effect(() => {
      const entregas = this.opcionesEntrega().map(o => o.tipo);
      if (entregas.length && !entregas.includes(this.entrega())) this.entrega.set(entregas[0]);
    });
    effect(() => {
      const metodos = this.opcionesPago().map(o => o.metodo);
      if (!metodos.includes(this.metodo()!)) this.metodo.set(metodos[0] ?? null);
    });
    // Rellena con los datos de la cuenta lo que el cliente no haya escrito.
    effect(() => {
      const usuario = this.usuario();
      const perfil = this.perfil();
      this.form.nombre ||= perfil?.nombre ?? usuario?.displayName ?? '';
      this.form.email ||= perfil?.email ?? usuario?.email ?? '';
      this.form.telefono ||= perfil?.telefono ?? '';
    });
  }

  errores(): Partial<Record<Campo, string>> {
    const f = this.form;
    const errores: Partial<Record<Campo, string>> = {};
    if (f.nombre.trim().length < 3) errores.nombre = 'Escribe tu nombre completo';
    if (!esCelularValido(f.telefono)) errores.telefono = 'Celular de 10 dígitos (ej. 3101234567)';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) errores.email = 'Correo no válido';
    if (this.entrega() !== 'recoger' && f.direccion.trim().length < 5) errores.direccion = 'Escribe la dirección de entrega';
    if (this.entrega() === 'nacional') {
      if (!f.departamento) errores.departamento = 'Elige el departamento';
      if (f.ciudad.trim().length < 3) errores.ciudad = 'Escribe la ciudad';
    }
    if (!this.aceptaPolitica) errores.politica = 'Debes autorizar el tratamiento de tus datos para hacer el pedido';
    return errores;
  }

  error(campo: Campo): string | undefined {
    return this.intentoEnviar() ? this.errores()[campo] : undefined;
  }

  /** Devuelve el usuario si inició sesión, o null si cerró la ventana o falló. */
  async iniciarSesion(): Promise<User | null> {
    try {
      await this.auth.loginConGoogle();
      const usuario = await firstValueFrom(this.auth.user$.pipe(filter((u): u is User => !!u)));
      this.form.nombre ||= usuario.displayName ?? '';
      this.form.email ||= usuario.email ?? '';
      return usuario;
    } catch (error: any) {
      if (error?.code !== 'auth/popup-closed-by-user' && error?.code !== 'auth/cancelled-popup-request') {
        console.error(error);
        this.notificaciones.error('No se pudo iniciar sesión', 'Inténtalo de nuevo.');
      }
      return null;
    }
  }

  async confirmar() {
    if (this.enviando()) return;
    // Sin sesión: se inicia aquí mismo y el pedido sigue, sin perder lo escrito.
    const usuario = this.usuario() ?? await this.iniciarSesion();
    if (!usuario) return;

    this.intentoEnviar.set(true);
    if (Object.keys(this.errores()).length > 0) {
      setTimeout(() => document.querySelector('[data-error]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    if (this.hayNoDisponibles()) {
      this.notificaciones.error('Revisa tu carrito', 'Ajusta los productos marcados: alguno se agotó o quedan menos unidades.');
      return;
    }
    const metodo = this.metodo();
    if (!metodo) {
      this.notificaciones.error('Elige cómo pagar');
      return;
    }

    const f = this.form;
    const local = this.entrega() === 'local';
    const solicitud: SolicitudPedido = {
      cliente: {
        nombre: f.nombre.trim(),
        telefono: limpiarCelular(f.telefono),
        email: f.email.trim().toLowerCase(),
        documento: f.documento.trim(),
      },
      entrega: this.entrega() === 'recoger'
        ? { tipo: 'recoger', direccion: '', barrio: '', ciudad: '', departamento: '', notas: f.notas.trim() }
        : {
            tipo: this.entrega(),
            direccion: f.direccion.trim(),
            barrio: f.barrio.trim(),
            ciudad: local ? CLIENTE.tienda?.ciudad ?? '' : f.ciudad.trim(),
            departamento: local ? CLIENTE.tienda?.departamento ?? '' : f.departamento,
            notas: f.notas.trim(),
          },
      items: this.lineas().map(l => ({ productoId: l.productoId, opcion: l.opcion, cantidad: l.cantidad })),
      metodo,
      aceptaPolitica: this.aceptaPolitica,
    };

    this.enviando.set(true);
    let pedidoId: string;
    try {
      pedidoId = await this.pedidos.crear(solicitud);
    } catch (error: any) {
      console.error('Error creando el pedido', error);
      // Los errores de negocio (agotado, pocas unidades...) vienen con un mensaje para el cliente.
      const mensaje = error?.code === 'functions/failed-precondition' ? error.message : 'Revisa tu conexión e inténtalo de nuevo.';
      this.notificaciones.error('No pudimos registrar tu pedido', mensaje);
      this.enviando.set(false);
      return;
    }

    this.carrito.vaciar();
    // Para no pedirlo en la próxima compra. Si falla no pasa nada.
    this.usuarios.guardarTelefono(usuario.uid, solicitud.cliente.telefono).catch(() => {});

    if (metodo === 'en-linea') {
      try {
        await this.pagos.irAPagar(pedidoId);
        return; // El navegador se va a Wompi.
      } catch (error) {
        console.error('Error iniciando el pago', error);
        this.notificaciones.error('No pudimos abrir el pago', 'Tu pedido quedó guardado: puedes pagarlo desde aquí.');
      }
    }
    this.enviando.set(false);
    this.router.navigate(['/tienda/pedido', pedidoId]);
  }
}
