import { Component, OnInit, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, switchMap } from 'rxjs';
import { BARBERO_CUALQUIERA, Cita } from '../../../core/models/cita.model';
import { BarberoPublico } from '../../../core/models/barbero.model';
import { Servicio, iconoDe } from '../../../core/models/servicio.model';
import { AuthService } from '../../../core/services/auth.service';
import { BarberosService } from '../../../core/services/barberos.service';
import { CitasService, HorarioNoDisponibleError } from '../../../core/services/citas.service';
import { ServiciosService } from '../../../core/services/servicios.service';
import { NotificationService } from '../../../core/services/notification.service';
import { CLIENTE } from '../../../config/cliente';
import { IconoComponent } from '../../../shared/components/icono/icono.component';
import { DuracionPipe } from '../../../shared/pipes/duracion.pipe';
import {
  HORARIO, HorarioDisponible, claveDia, diasReservables, duracionDe, fechaDesdeClave, horariosDisponibles, minutosAHora24,
} from '../../../core/utils/horario';

type Paso = 1 | 2 | 3 | 4;

interface CeldaCalendario {
  fecha: Date;
  clave: string;
  delMes: boolean;
  reservable: boolean;
  esHoy: boolean;
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

@Component({
  selector: 'app-reservar',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, DuracionPipe, IconoComponent],
  templateUrl: './reservar.component.html',
})
export class ReservarComponent implements OnInit {
  readonly iconoDe = iconoDe;
  private router = inject(Router);
  private auth = inject(Auth);
  private authService = inject(AuthService);
  private citasService = inject(CitasService);
  private barberosService = inject(BarberosService);
  private serviciosService = inject(ServiciosService);
  private notificaciones = inject(NotificationService);
  private destroyRef = inject(DestroyRef);

  readonly cliente = CLIENTE;
  readonly CUALQUIERA = BARBERO_CUALQUIERA;
  readonly pasos: { numero: Paso; titulo: string }[] = [
    { numero: 1, titulo: 'Profesional' },
    { numero: 2, titulo: 'Servicio' },
    { numero: 3, titulo: 'Horario' },
    { numero: 4, titulo: 'Confirmar' },
  ];
  readonly diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  paso: Paso = 1;

  barberoElegido = false;
  barberoSeleccionado: string = BARBERO_CUALQUIERA;
  servicioSeleccionado: Servicio | null = null;
  horaSeleccionada: HorarioDisponible | null = null;
  horasDisponibles: HorarioDisponible[] = [];

  staff: BarberoPublico[] = [];
  categorias: { nombre: string; servicios: Servicio[] }[] = [];
  cargandoDisponibilidad = false;
  private ocupados = new Set<string>();
  private cambioDeDia$ = new Subject<string>();

  // Calendario
  private diasReservablesClaves = new Set<string>();
  private primerDia = new Date();
  private ultimoDia = new Date();
  mesVisible = new Date();
  celdas: CeldaCalendario[] = [];
  diaSeleccionado: string | null = null;

  isSubmitting = false;

  // Formulario del cliente
  clienteNombre: string = '';
  clienteApellido: string = '';
  clienteTelefono: string = '';
  clienteCorreo: string = '';
  /** Solo con el correo verificado se envía la confirmación (las reglas lo exigen). */
  correoVerificado = false;

  // Confirmación
  reservaConfirmada = false;
  reservaDetalles: Cita | null = null;

  ngOnInit() {
    const nav = this.router.getCurrentNavigation();
    this.servicioSeleccionado = nav?.extras.state?.['servicio'] ?? history.state?.servicio ?? null;

    const user = this.auth.currentUser;
    if (user) {
      const nombres = user.displayName?.split(' ') || [];
      this.clienteNombre = nombres[0] || '';
      this.clienteApellido = nombres.slice(1).join(' ') || '';
      this.clienteCorreo = (user.email || '').toLowerCase();
      // Quien entró con el celular ya lo tiene: se precarga (sin el +57).
      if (user.phoneNumber && !this.clienteTelefono) this.clienteTelefono = user.phoneNumber.replace(/^\+57/, '');
      // Si ya abrió el enlace de verificación, se refresca la sesión para que las reglas lo sepan.
      this.authService.correoVerificado().then(verificado => this.correoVerificado = verificado);
    }

    this.barberosService.listar().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: staff => {
        this.staff = staff;
        this.generarHoras();
      },
      error: error => console.error('Error cargando barberos', error),
    });

    this.serviciosService.listar().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: servicios => this.agruparServicios(servicios),
      error: error => console.error('Error cargando servicios', error),
    });

    // Bloques ocupados del día elegido, en tiempo real.
    this.cambioDeDia$.pipe(
      switchMap(dia => this.citasService.slotsOcupados(dia)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: ocupados => {
        this.ocupados = ocupados;
        this.cargandoDisponibilidad = false;
        this.generarHoras();
      },
      error: error => {
        this.cargandoDisponibilidad = false;
        console.error('Error cargando disponibilidad', error);
      },
    });

    this.prepararCalendario();
  }

  // ---------- Navegación entre pasos ----------

  puedeIrA(paso: Paso): boolean {
    switch (paso) {
      case 1: return true;
      case 2: return this.barberoElegido;
      case 3: return this.barberoElegido && !!this.servicioSeleccionado;
      case 4: return this.puedeIrA(3) && !!this.horaSeleccionada;
    }
  }

  irAPaso(paso: Paso) {
    if (!this.puedeIrA(paso)) return;
    this.paso = paso;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- Paso 1: profesional ----------

  get barberoNombreSeleccionado(): string {
    if (this.barberoSeleccionado === BARBERO_CUALQUIERA) return 'Cualquier barbero';
    return this.staff.find(s => s.id === this.barberoSeleccionado)?.nombre ?? 'Barbero';
  }

  seleccionarBarbero(id: string) {
    this.barberoSeleccionado = id;
    this.barberoElegido = true;
    this.horaSeleccionada = null;
    this.generarHoras();
    // Si el servicio ya venía elegido desde el catálogo, se salta directo al horario.
    this.irAPaso(this.servicioSeleccionado ? 3 : 2);
  }

  iniciales(nombre: string): string {
    return nombre.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase();
  }

  // ---------- Paso 2: servicio ----------

  private agruparServicios(servicios: Servicio[]) {
    const porCategoria = new Map<string, Servicio[]>();
    for (const s of [...servicios].sort((a, b) => b.precio - a.precio)) {
      const categoria = s.categoria || 'Otros';
      porCategoria.set(categoria, [...(porCategoria.get(categoria) ?? []), s]);
    }
    this.categorias = [...porCategoria].map(([nombre, lista]) => ({ nombre, servicios: lista }));

    // Usa la versión actual del servicio que venía del catálogo (precio o duración pudieron cambiar).
    if (this.servicioSeleccionado?.id) {
      this.servicioSeleccionado = servicios.find(s => s.id === this.servicioSeleccionado!.id) ?? this.servicioSeleccionado;
    }
  }

  seleccionarServicio(servicio: Servicio) {
    this.servicioSeleccionado = servicio;
    this.horaSeleccionada = null;
    this.generarHoras();
    this.irAPaso(3);
  }

  // ---------- Paso 3: horario ----------

  private prepararCalendario() {
    // Si ya no cabe ni un turno hoy, el calendario empieza mañana.
    const ahora = new Date();
    const cerradoHoy = ahora.getHours() * 60 + ahora.getMinutes() >= HORARIO.cierre - HORARIO.intervalo;
    const dias = diasReservables().filter(d => !(cerradoHoy && claveDia(d) === claveDia(ahora)));
    this.diasReservablesClaves = new Set(dias.map(claveDia));
    if (dias.length === 0) return;
    this.primerDia = dias[0];
    this.ultimoDia = dias[dias.length - 1];
    this.mesVisible = new Date(this.primerDia.getFullYear(), this.primerDia.getMonth(), 1);
    this.construirCeldas();
    this.seleccionarDia(claveDia(this.primerDia));
  }

  private construirCeldas() {
    const year = this.mesVisible.getFullYear();
    const month = this.mesVisible.getMonth();
    const inicio = 1 - new Date(year, month, 1).getDay();
    const diasEnMes = new Date(year, month + 1, 0).getDate();
    const semanas = Math.ceil((diasEnMes - inicio + 1) / 7);
    const hoy = claveDia(new Date());

    this.celdas = Array.from({ length: semanas * 7 }, (_, i) => {
      const fecha = new Date(year, month, inicio + i);
      const clave = claveDia(fecha);
      return {
        fecha,
        clave,
        delMes: fecha.getMonth() === month,
        reservable: this.diasReservablesClaves.has(clave),
        esHoy: clave === hoy,
      };
    });
  }

  get tituloMes(): string {
    return `${MESES[this.mesVisible.getMonth()]} ${this.mesVisible.getFullYear()}`;
  }

  get hayMesAnterior(): boolean {
    return this.mesVisible > new Date(this.primerDia.getFullYear(), this.primerDia.getMonth(), 1);
  }

  get hayMesSiguiente(): boolean {
    return this.mesVisible < new Date(this.ultimoDia.getFullYear(), this.ultimoDia.getMonth(), 1);
  }

  cambiarMes(delta: number) {
    this.mesVisible = new Date(this.mesVisible.getFullYear(), this.mesVisible.getMonth() + delta, 1);
    this.construirCeldas();
  }

  get fechaSeleccionada(): Date | null {
    return this.diaSeleccionado ? fechaDesdeClave(this.diaSeleccionado) : null;
  }

  seleccionarDia(clave: string) {
    if (!this.diasReservablesClaves.has(clave)) return;
    this.diaSeleccionado = clave;
    this.horaSeleccionada = null;
    this.ocupados = new Set();
    this.horasDisponibles = [];
    this.cargandoDisponibilidad = true;
    this.cambioDeDia$.next(clave);
  }

  generarHoras() {
    if (!this.diaSeleccionado) {
      this.horasDisponibles = [];
      return;
    }

    this.horasDisponibles = horariosDisponibles({
      dia: this.diaSeleccionado,
      duracion: this.servicioSeleccionado ? duracionDe(this.servicioSeleccionado) : HORARIO.intervalo,
      barberos: this.barberosCandidatos(),
      ocupados: this.ocupados,
    });

    // Si la hora elegida se ocupó mientras el cliente llenaba el formulario, se deselecciona.
    const previa = this.horaSeleccionada?.minutos;
    this.horaSeleccionada = this.horasDisponibles.find(h => h.minutos === previa) ?? null;
    // (Al confirmar, los bloques propios también aparecen ocupados: ahí no se avisa.)
    if (previa !== undefined && !this.horaSeleccionada && !this.isSubmitting && !this.reservaConfirmada) {
      if (this.paso === 4) this.paso = 3;
      this.notificaciones.error('Esa hora se acaba de ocupar', 'Alguien la reservó mientras llenabas tus datos. Elige otra, por favor.');
    }
  }

  private barberosCandidatos(): string[] {
    if (this.barberoSeleccionado !== BARBERO_CUALQUIERA) return [this.barberoSeleccionado];
    return this.staff.length > 0 ? this.staff.map(b => b.id!) : [BARBERO_CUALQUIERA];
  }

  /** Con "Cualquiera", asigna el barbero libre con menos bloques ocupados ese día. */
  private elegirBarbero(libres: string[], dia: string): string {
    const carga = (id: string) => [...this.ocupados].filter(s => s.startsWith(`${id}_${dia}_`)).length;
    return libres.reduce((mejor, id) => (carga(id) < carga(mejor) ? id : mejor));
  }

  // ---------- Paso 4: confirmar ----------

  async reenviarVerificacion() {
    try {
      await this.authService.reenviarVerificacion();
      this.notificaciones.exito('Enlace enviado', 'Abre el correo y toca el enlace. Luego vuelve a esta página.');
    } catch {
      this.notificaciones.error('No se pudo enviar el enlace', 'Espera unos minutos e inténtalo de nuevo.');
    }
  }

  get formularioInvalido(): boolean {
    return !this.horaSeleccionada || !this.clienteNombre.trim() || !this.clienteApellido.trim() || !this.clienteTelefono.trim();
  }

  enviarWhatsApp() {
    if (!this.reservaDetalles || !this.cliente.whatsapp) return;

    const d = new Date(this.reservaDetalles.fecha);
    const dateStr = d.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const mensaje = `¡Hola ${this.cliente.nombre}! Acabo de agendar una cita en la plataforma. Aquí están mis datos:\n\n` +
                    `*Nombre:* ${this.reservaDetalles.userName}\n` +
                    `*Servicio:* ${this.reservaDetalles.serviceName}\n` +
                    `*Barbero:* ${this.reservaDetalles.barberoNombre}\n` +
                    `*Fecha:* ${dateStr}\n` +
                    `*Hora:* ${this.reservaDetalles.horaStr}\n\n` +
                    `¡Nos vemos pronto!`;

    const encodedMessage = encodeURIComponent(mensaje);

    const fullUrl = `https://api.whatsapp.com/send?phone=${this.cliente.whatsapp}&text=${encodedMessage}`;
    window.open(fullUrl, '_blank');
  }

  async continuar() {
    if (!this.servicioSeleccionado) {
      this.irAPaso(2);
      return;
    }

    const user = this.auth.currentUser;
    if (!user) {
      this.router.navigate(['/login']);
      return;
    }

    if (this.formularioInvalido || !this.diaSeleccionado || !this.horaSeleccionada) {
      this.notificaciones.error('Faltan datos', 'Completa tu nombre, apellido y celular.');
      return;
    }

    const dia = this.diaSeleccionado;
    const hora = this.horaSeleccionada;
    const barberoId = this.elegirBarbero(hora.barberosLibres, dia);
    const barbero = this.staff.find(b => b.id === barberoId);

    try {
      this.isSubmitting = true;
      this.reservaDetalles = await this.citasService.reservar({
        userId: user.uid,
        userName: `${this.clienteNombre.trim()} ${this.clienteApellido.trim()}`,
        // La confirmación solo puede ir a un correo verificado (las reglas rechazan otro).
        userEmail: this.correoVerificado ? this.clienteCorreo.trim() : '',
        phone: this.clienteTelefono.trim(),
        servicioId: this.servicioSeleccionado.id!,
        serviceName: this.servicioSeleccionado.nombre,
        precio: this.servicioSeleccionado.precio,
        duracionMinutos: duracionDe(this.servicioSeleccionado),
        barberoId,
        barberoNombre: barbero?.nombre ?? 'Cualquier barbero',
        dia,
        hora: minutosAHora24(hora.minutos),
        horaStr: hora.etiqueta,
        fecha: fechaDesdeClave(dia, hora.minutos).toISOString(),
      });
      this.reservaConfirmada = true;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      if (error instanceof HorarioNoDisponibleError) {
        this.horaSeleccionada = null;
        this.paso = 3;
        this.notificaciones.error('Horario no disponible', 'Alguien acaba de reservar esa hora. Por favor elige otra.');
      } else {
        console.error('Error al guardar cita', error);
        this.notificaciones.error('No se pudo agendar', 'Hubo un error al agendar tu cita. Inténtalo de nuevo.');
      }
    } finally {
      this.isSubmitting = false;
    }
  }
}
