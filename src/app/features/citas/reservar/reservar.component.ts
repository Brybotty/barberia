import { Component, DestroyRef, DoCheck, OnInit, effect, inject, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { User } from '@angular/fire/auth';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReplaySubject, of, switchMap } from 'rxjs';
import { BARBERO_CUALQUIERA, Cita, RESERVAS_POR_DIA, esActiva } from '../../../core/models/cita.model';
import { BarberoPublico, iniciales } from '../../../core/models/barbero.model';
import { Servicio, iconoDe } from '../../../core/models/servicio.model';
import { AjustesService } from '../../../core/services/ajustes.service';
import { AuthService } from '../../../core/services/auth.service';
import { BarberosService } from '../../../core/services/barberos.service';
import { CitasService, CupoAgotadoError, HorarioNoDisponibleError } from '../../../core/services/citas.service';
import { MarcoService } from '../../../core/services/marco.service';
import { ServiciosService } from '../../../core/services/servicios.service';
import { NotificationService } from '../../../core/services/notification.service';
import { CLIENTE } from '../../../config/cliente';
import { IconoComponent } from '../../../shared/components/icono/icono.component';
import { RedSocialComponent } from '../../../shared/components/red-social/red-social.component';
import { DuracionPipe } from '../../../shared/pipes/duracion.pipe';
import { esCelularValido, limpiarCelular } from '../../../core/utils/colombia';
import {
  HorarioDisponible, MAX_BLOQUES_EN_LINEA, bloquesDe, claveDia, diasReservables, duracionDe, fechaDesdeClave, horariosDisponibles,
  inicioDeCita, minutosAHora24,
} from '../../../core/utils/horario';

type Paso = 1 | 2 | 3 | 4;

interface CeldaCalendario {
  fecha: Date;
  clave: string;
  delMes: boolean;
  reservable: boolean;
  esHoy: boolean;
}

/** Lo que el visitante llevaba elegido cuando se fue a iniciar sesión (se guarda solo en esta pestaña). */
interface ReservaPendiente {
  barberoId: string;
  servicioId: string;
  dia: string;
  minutos: number;
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const CLAVE_PENDIENTE = 'reserva-pendiente';

@Component({
  selector: 'app-reservar',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, DuracionPipe, IconoComponent, RedSocialComponent],
  templateUrl: './reservar.component.html',
})
export class ReservarComponent implements OnInit, DoCheck {
  readonly iconoDe = iconoDe;
  readonly iniciales = iniciales;
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private citasService = inject(CitasService);
  private barberosService = inject(BarberosService);
  private serviciosService = inject(ServiciosService);
  private notificaciones = inject(NotificationService);
  private ajustes = inject(AjustesService);
  private marco = inject(MarcoService);
  private destroyRef = inject(DestroyRef);

  /** Con la agenda por periodos: hasta cuándo se puede reservar (se le cuenta al cliente bajo el calendario). */
  readonly periodo = this.ajustes.periodo;
  /** No queda ningún día en el que se pueda reservar: el periodo terminó y aún no abren el siguiente. */
  agendaCerrada = false;

  readonly cliente = CLIENTE;
  readonly CUALQUIERA = BARBERO_CUALQUIERA;
  // En números romanos, como las capitales del logo.
  readonly pasos: { numero: Paso; romano: string; titulo: string }[] = [
    { numero: 1, romano: 'I', titulo: 'Barbero' },
    { numero: 2, romano: 'II', titulo: 'Servicio' },
    { numero: 3, romano: 'III', titulo: 'Horario' },
    { numero: 4, romano: 'IV', titulo: 'Confirmar' },
  ];
  readonly diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  paso: Paso = 1;

  /** Sesión: se puede elegir todo sin ella; solo se pide para confirmar. */
  usuario: User | null = null;
  entrando = false;

  barberoElegido = false;
  barberoSeleccionado: string = BARBERO_CUALQUIERA;
  servicioSeleccionado: Servicio | null = null;
  horaSeleccionada: HorarioDisponible | null = null;
  horasDisponibles: HorarioDisponible[] = [];

  staff: BarberoPublico[] = [];
  private servicios: Servicio[] = [];
  categorias: { nombre: string; servicios: Servicio[] }[] = [];
  cargandoDisponibilidad = false;
  private ocupados = new Set<string>();
  // Con memoria: el calendario se arma antes de que exista quien escucha el día elegido.
  private cambioDeDia$ = new ReplaySubject<string>(1);

  // Calendario
  private diasReservablesClaves = new Set<string>();
  private primerDia = new Date();
  private ultimoDia = new Date();
  mesVisible = new Date();
  celdas: CeldaCalendario[] = [];
  diaSeleccionado: string | null = null;

  isSubmitting = false;

  // Formulario del cliente
  clienteNombre = '';
  clienteApellido = '';
  clienteTelefono = '';
  clienteCorreo = '';
  /** Solo con el correo verificado se envía la confirmación (las reglas lo exigen). */
  correoVerificado = false;
  /** Se muestra el error del celular solo después de intentar confirmar. */
  intentoConfirmar = false;

  /** Citas del cliente: para avisarle si ya llenó su cupo del día y para reagendar. */
  private misCitas: Cita[] = [];
  /** Cita que se está cambiando de horario (viene de "Mis reservas"). */
  reagendando: Cita | null = null;
  private reagendarId: string | null = null;
  /** Lo que venía elegido al llegar (reserva pendiente, "reservar de nuevo" o reagendar): se aplica al cargar los datos. */
  private porRestaurar: Partial<ReservaPendiente> | null = null;

  // Confirmación
  reservaConfirmada = false;
  reservaDetalles: Cita | null = null;
  fueReagendada = false;

  constructor() {
    // Si el admin cambia el horario o abre otro periodo de agenda mientras alguien reserva, el calendario se rehace.
    effect(() => {
      this.ajustes.horario();
      this.ajustes.agenda();
      untracked(() => this.prepararCalendario());
    });
    this.destroyRef.onDestroy(() => this.marco.barraPropia.set(false));
  }

  /** En celular, el total y "Confirmar" van fijos abajo: se avisa al marco para que quite los accesos rápidos. */
  get barraDeConfirmar(): boolean {
    return this.paso === 4 && !!this.usuario && !this.reservaConfirmada && !this.agendaCerrada;
  }

  ngDoCheck() {
    this.marco.barraPropia.set(this.barraDeConfirmar);
  }

  ngOnInit() {
    const estado = (this.router.getCurrentNavigation()?.extras.state ?? history.state ?? {}) as { servicio?: Servicio; servicioId?: string; barberoId?: string };
    this.servicioSeleccionado = estado.servicio ?? null;
    this.reagendarId = this.route.snapshot.queryParamMap.get('reagendar');
    this.porRestaurar = this.leerPendiente() ?? (estado.servicioId || estado.barberoId ? { servicioId: estado.servicioId, barberoId: estado.barberoId } : null);
    // El calendario se arma antes de escuchar los datos: los barberos y los servicios pueden llegar en este mismo
    // paso (ya los tenía en memoria otra pantalla), y con ellos se restaura el día que venía elegido.
    this.prepararCalendario();

    this.authService.user$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(user => this.alCambiarSesion(user));

    // Citas propias (solo con sesión).
    this.authService.user$.pipe(
      switchMap(user => (user ? this.citasService.deUsuario(user.uid) : of([]))),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: citas => {
        this.misCitas = citas;
        this.prepararReagendar();
      },
      error: error => console.error('Error cargando tus reservas', error),
    });

    this.barberosService.listar().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: staff => {
        this.staff = staff;
        this.restaurar();
        this.construirCeldas();
        this.generarHoras();
      },
      error: error => console.error('Error cargando barberos', error),
    });

    this.serviciosService.listar().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: servicios => {
        this.agruparServicios(servicios);
        this.restaurar();
      },
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

    // Reagendar necesita la sesión: si no la hay, primero a entrar.
    if (this.reagendarId) {
      this.authService.user$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(user => {
        if (!user) this.router.navigate(['/login'], { queryParams: { volver: this.router.url } });
      });
    }
  }

  // ---------- Sesión ----------

  private alCambiarSesion(user: User | null) {
    this.usuario = user;
    if (!user) return;
    const nombres = user.displayName?.trim().split(/\s+/) ?? [];
    this.clienteNombre ||= nombres[0] ?? '';
    this.clienteApellido ||= nombres.slice(1).join(' ');
    this.clienteCorreo = (user.email ?? '').toLowerCase();
    // Quien entró con el celular ya lo tiene: se precarga (sin el +57).
    if (user.phoneNumber && !this.clienteTelefono) this.clienteTelefono = limpiarCelular(user.phoneNumber);
    // Si ya abrió el enlace de verificación, se refresca la sesión para que las reglas lo sepan.
    this.authService.correoVerificado().then(verificado => (this.correoVerificado = verificado));
  }

  /** Entrar con Google sin salir de la reserva. */
  async entrarConGoogle() {
    try {
      this.entrando = true;
      await this.authService.loginConGoogle();
    } catch (error: any) {
      if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') return;
      if (error?.code === 'auth/popup-blocked') {
        this.notificaciones.error('El navegador no dejó abrir la ventana de Google', 'Toca el botón otra vez o usa otra forma de entrar.');
        return;
      }
      console.error('Error al iniciar sesión:', error);
      this.notificaciones.error('No pudimos abrir tu cuenta de Google', 'Inténtalo de nuevo o usa otra forma de entrar.');
    } finally {
      this.entrando = false;
    }
  }

  /** Correo o celular: va a la pantalla de ingreso y vuelve con lo que ya eligió. */
  entrarDeOtraForma() {
    this.guardarPendiente();
    this.router.navigate(['/login'], { queryParams: { volver: '/reservar' } });
  }

  private guardarPendiente() {
    if (!this.servicioSeleccionado?.id || !this.diaSeleccionado || !this.horaSeleccionada) return;
    const pendiente: ReservaPendiente = {
      barberoId: this.barberoSeleccionado,
      servicioId: this.servicioSeleccionado.id,
      dia: this.diaSeleccionado,
      minutos: this.horaSeleccionada.minutos,
    };
    try {
      sessionStorage.setItem(CLAVE_PENDIENTE, JSON.stringify(pendiente));
    } catch { /* sin almacenamiento: tendrá que elegir de nuevo */ }
  }

  private leerPendiente(): ReservaPendiente | null {
    try {
      const guardado = JSON.parse(sessionStorage.getItem(CLAVE_PENDIENTE) ?? 'null');
      sessionStorage.removeItem(CLAVE_PENDIENTE);
      return guardado && typeof guardado.servicioId === 'string' ? guardado : null;
    } catch {
      return null;
    }
  }

  /** Aplica lo que venía elegido cuando ya cargaron barberos y servicios. */
  private restaurar() {
    const p = this.porRestaurar;
    if (!p || this.staff.length === 0 || this.servicios.length === 0) return;
    this.porRestaurar = null;

    if (p.barberoId) {
      this.barberoSeleccionado = this.staff.some(b => b.id === p.barberoId) ? p.barberoId : BARBERO_CUALQUIERA;
      this.barberoElegido = true;
    }
    if (p.servicioId) {
      const servicio = this.servicios.find(s => s.id === p.servicioId);
      if (servicio && this.reservableEnLinea(servicio)) this.servicioSeleccionado = servicio;
    }
    this.construirCeldas();
    if (!this.barberoElegido) return;
    if (!this.servicioSeleccionado) {
      this.paso = 2;
      return;
    }
    this.paso = 3;
    if (p.dia && this.diasReservablesClaves.has(p.dia)) {
      this.mesVisible = new Date(fechaDesdeClave(p.dia).getFullYear(), fechaDesdeClave(p.dia).getMonth(), 1);
      this.construirCeldas();
      this.seleccionarDia(p.dia);
      // La hora se marca cuando llegue la disponibilidad de ese día (si sigue libre).
      if (p.minutos !== undefined) this.horaPorRestaurar = p.minutos;
    } else {
      this.generarHoras();
    }
  }
  private horaPorRestaurar: number | null = null;

  private prepararReagendar() {
    if (!this.reagendarId || this.reagendando || this.reservaConfirmada) return;
    const cita = this.misCitas.find(c => c.id === this.reagendarId);
    if (!cita) return;
    if (!esActiva(cita.estado) || inicioDeCita(cita) <= new Date()) {
      this.reagendarId = null;
      this.notificaciones.error('Esa cita ya no se puede cambiar', 'Solo se cambian las reservas que aún no pasan.');
      this.router.navigate(['/mis-citas']);
      return;
    }
    this.reagendando = cita;
    const nombres = cita.userName.trim().split(/\s+/);
    this.clienteNombre = nombres[0] ?? this.clienteNombre;
    this.clienteApellido = nombres.slice(1).join(' ') || this.clienteApellido;
    this.clienteTelefono = limpiarCelular(cita.phone ?? '') || this.clienteTelefono;
    this.porRestaurar = { barberoId: cita.barberoId, servicioId: cita.servicioId };
    this.restaurar();
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
    // Sin sesión, el paso siguiente al horario pide entrar: la ventana de Google se deja lista con tiempo.
    if (paso >= 3 && !this.usuario) this.authService.prepararGoogle();
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
    this.construirCeldas();
    this.generarHoras();
    // Si el servicio ya venía elegido desde el catálogo, se salta directo al horario.
    this.irAPaso(this.servicioSeleccionado ? 3 : 2);
  }

  // ---------- Paso 2: servicio ----------

  private agruparServicios(servicios: Servicio[]) {
    this.servicios = servicios;
    const porCategoria = new Map<string, Servicio[]>();
    for (const s of [...servicios].sort((a, b) => b.precio - a.precio)) {
      const categoria = s.categoria || 'Otros';
      porCategoria.set(categoria, [...(porCategoria.get(categoria) ?? []), s]);
    }
    this.categorias = [...porCategoria].map(([nombre, lista]) => ({ nombre, servicios: lista }));

    // Usa la versión actual del servicio que venía del catálogo (precio o duración pudieron cambiar).
    if (this.servicioSeleccionado?.id) {
      this.servicioSeleccionado = servicios.find(s => s.id === this.servicioSeleccionado!.id) ?? this.servicioSeleccionado;
      if (!this.reservableEnLinea(this.servicioSeleccionado)) this.servicioSeleccionado = null;
    }
  }

  /** Los servicios muy largos no se reservan en línea (las reglas comprueban hasta 7 bloques): se agendan con la barbería. */
  reservableEnLinea(servicio: Servicio): boolean {
    return bloquesDe(duracionDe(servicio)) <= MAX_BLOQUES_EN_LINEA;
  }

  seleccionarServicio(servicio: Servicio) {
    if (!this.reservableEnLinea(servicio)) return;
    this.servicioSeleccionado = servicio;
    this.horaSeleccionada = null;
    this.generarHoras();
    this.irAPaso(3);
  }

  // ---------- Paso 3: horario ----------

  private prepararCalendario() {
    const horario = this.ajustes.horario();
    // Si ya no cabe ni un turno hoy, el calendario empieza mañana.
    const ahora = new Date();
    const cerradoHoy = ahora.getHours() * 60 + ahora.getMinutes() >= horario.cierre - horario.intervalo;
    const dias = diasReservables(ahora, horario, this.ajustes.agenda()).filter(d => !(cerradoHoy && claveDia(d) === claveDia(ahora)));
    this.diasReservablesClaves = new Set(dias.map(claveDia));
    this.agendaCerrada = dias.length === 0;
    if (dias.length === 0) {
      this.celdas = [];
      this.diaSeleccionado = null;
      this.horaSeleccionada = null;
      this.horasDisponibles = [];
      return;
    }
    this.primerDia = dias[0];
    this.ultimoDia = dias[dias.length - 1];
    const seleccionVigente = this.diaSeleccionado && this.diasReservablesClaves.has(this.diaSeleccionado);
    if (!seleccionVigente) this.mesVisible = new Date(this.primerDia.getFullYear(), this.primerDia.getMonth(), 1);
    this.construirCeldas();
    if (!seleccionVigente) this.seleccionarDia(claveDia(this.primerDia));
    else this.generarHoras();
  }

  /** El barbero elegido no trabaja ese día de la semana. */
  private esDiaLibreDelBarbero(fecha: Date): boolean {
    if (this.barberoSeleccionado === BARBERO_CUALQUIERA) {
      // Con "cualquiera", el día solo se cierra si ninguno trabaja.
      return this.staff.length > 0 && this.staff.every(b => b.diasLibres?.includes(fecha.getDay()));
    }
    return !!this.staff.find(b => b.id === this.barberoSeleccionado)?.diasLibres?.includes(fecha.getDay());
  }

  private construirCeldas() {
    if (this.diasReservablesClaves.size === 0) return;
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
        reservable: this.diasReservablesClaves.has(clave) && !this.esDiaLibreDelBarbero(fecha),
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

  /** Reservas activas del cliente para el día elegido (sin contar la que está cambiando). */
  get cupoAgotado(): boolean {
    if (!this.diaSeleccionado) return false;
    const activas = this.misCitas.filter(c => esActiva(c.estado) && c.dia === this.diaSeleccionado && c.id !== this.reagendando?.id);
    return activas.length >= RESERVAS_POR_DIA;
  }

  generarHoras() {
    if (!this.diaSeleccionado) {
      this.horasDisponibles = [];
      return;
    }

    // Al reagendar, los bloques de la cita que se cambia cuentan como libres: se los queda la nueva.
    const propios = new Set(this.reagendando?.slotIds ?? []);
    const ocupados = propios.size ? new Set([...this.ocupados].filter(id => !propios.has(id))) : this.ocupados;

    this.horasDisponibles = horariosDisponibles({
      dia: this.diaSeleccionado,
      duracion: this.servicioSeleccionado ? duracionDe(this.servicioSeleccionado) : this.ajustes.horario().intervalo,
      barberos: this.barberosCandidatos(),
      ocupados,
      disponibilidad: Object.fromEntries(this.staff.map(b => [b.id!, b])),
      horario: this.ajustes.horario(),
    });

    if (this.horaPorRestaurar !== null && !this.cargandoDisponibilidad) {
      const hora = this.horasDisponibles.find(h => h.minutos === this.horaPorRestaurar);
      this.horaPorRestaurar = null;
      if (hora) {
        this.horaSeleccionada = hora;
        this.paso = 4;
      }
      return;
    }

    // Si la hora elegida se ocupó mientras el cliente llenaba el formulario, se deselecciona.
    const previa = this.horaSeleccionada?.minutos;
    this.horaSeleccionada = this.horasDisponibles.find(h => h.minutos === previa) ?? null;
    // (Al confirmar, los bloques propios también aparecen ocupados: ahí no se avisa.)
    if (previa !== undefined && !this.horaSeleccionada && !this.cargandoDisponibilidad && !this.isSubmitting && !this.reservaConfirmada) {
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

  get celularValido(): boolean {
    return esCelularValido(this.clienteTelefono);
  }

  get formularioInvalido(): boolean {
    return !this.horaSeleccionada || !this.clienteNombre.trim() || !this.clienteApellido.trim() || !this.celularValido;
  }

  /** Enlace para guardar la cita en Google Calendar (el correo de confirmación también trae el archivo .ics). */
  get enlaceCalendario(): string {
    const cita = this.reservaDetalles;
    if (!cita) return '';
    const inicio = inicioDeCita(cita);
    const fin = new Date(inicio.getTime() + cita.duracionMinutos * 60_000);
    const formato = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const datos = new URLSearchParams({
      action: 'TEMPLATE',
      text: `${cita.serviceName} en ${this.cliente.nombre}`,
      dates: `${formato(inicio)}/${formato(fin)}`,
      details: `Con ${cita.barberoNombre}.`,
      location: this.cliente.ubicacion?.direccion ?? '',
    });
    return `https://calendar.google.com/calendar/render?${datos}`;
  }

  get enlaceWhatsApp(): string {
    const cita = this.reservaDetalles;
    if (!cita || !this.cliente.whatsapp) return '';
    const fecha = inicioDeCita(cita).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
    const mensaje = `Hola ${this.cliente.nombre}, soy ${cita.userName}. Reservé ${cita.serviceName} con ${cita.barberoNombre} para el ${fecha} a las ${cita.horaStr}.`;
    return `https://wa.me/${this.cliente.whatsapp}?text=${encodeURIComponent(mensaje)}`;
  }

  /** Desde el comprobante: empezar una reserva nueva, sin lo que se había elegido. */
  otraReserva() {
    this.reservaConfirmada = false;
    this.reservaDetalles = null;
    this.reagendando = null;
    this.reagendarId = null;
    this.barberoElegido = false;
    this.barberoSeleccionado = BARBERO_CUALQUIERA;
    this.servicioSeleccionado = null;
    this.horaSeleccionada = null;
    this.intentoConfirmar = false;
    this.paso = 1;
    this.construirCeldas();
    this.generarHoras();
    this.router.navigate(['/reservar'], { replaceUrl: true });
    window.scrollTo({ top: 0 });
  }

  async continuar() {
    this.intentoConfirmar = true;
    if (!this.servicioSeleccionado) {
      this.irAPaso(2);
      return;
    }
    const user = this.usuario;
    if (!user) return;

    if (this.formularioInvalido || !this.diaSeleccionado || !this.horaSeleccionada) {
      this.notificaciones.error('Revisa tus datos', this.celularValido || !this.clienteTelefono.trim()
        ? 'Completa tu nombre, apellido y celular.'
        : 'El celular debe tener 10 dígitos y empezar por 3.');
      return;
    }
    if (this.cupoAgotado) {
      this.notificaciones.error(`Ya tienes ${RESERVAS_POR_DIA} reservas ese día`, 'Elige otro día o cancela una desde "Mis reservas".');
      return;
    }

    const dia = this.diaSeleccionado;
    const hora = this.horaSeleccionada;
    const barberoId = this.elegirBarbero(hora.barberosLibres, dia);
    const barbero = this.staff.find(b => b.id === barberoId);
    const datos = {
      userId: user.uid,
      userName: `${this.clienteNombre.trim()} ${this.clienteApellido.trim()}`.slice(0, 120),
      // La confirmación solo puede ir a un correo verificado (las reglas rechazan otro).
      userEmail: this.correoVerificado ? this.clienteCorreo.trim() : '',
      phone: limpiarCelular(this.clienteTelefono),
      servicioId: this.servicioSeleccionado.id!,
      serviceName: this.servicioSeleccionado.nombre,
      precio: this.servicioSeleccionado.precio,
      duracionMinutos: duracionDe(this.servicioSeleccionado),
      barberoId,
      barberoNombre: (barbero?.nombre ?? 'Cualquier barbero').slice(0, 80),
      dia,
      hora: minutosAHora24(hora.minutos),
      horaStr: hora.etiqueta,
      fecha: fechaDesdeClave(dia, hora.minutos).toISOString(),
    };

    try {
      this.isSubmitting = true;
      this.reservaDetalles = this.reagendando
        ? await this.citasService.reagendar(this.reagendando, datos)
        : await this.citasService.reservar(datos);
      this.fueReagendada = !!this.reagendando;
      this.reservaConfirmada = true;
      this.notificaciones.cerrarToast();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      if (error instanceof CupoAgotadoError) {
        this.notificaciones.error(`Ya tienes ${RESERVAS_POR_DIA} reservas ese día`, 'Elige otro día o cancela una desde "Mis reservas".');
      } else if (error instanceof HorarioNoDisponibleError) {
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
