import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CurrencyPipe, NgClass } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { CitasService } from '../../../core/services/citas.service';
import { ConfirmarService } from '../../../core/services/confirmar.service';
import { NotificationService } from '../../../core/services/notification.service';
import { UsuariosService } from '../../../core/services/usuarios.service';
import { Usuario } from '../../../core/models/usuario.model';
import { Cita, esActiva } from '../../../core/models/cita.model';
import { AjustesService } from '../../../core/services/ajustes.service';
import { MAX_DIAS_AGENDA, claveDia, compararCitas, diaDeCita, diaLargo, extenderAgenda } from '../../../core/utils/horario';
import { BarberosService } from '../../../core/services/barberos.service';
import { OcupacionService } from '../../../core/services/ocupacion.service';
import { ServiciosService } from '../../../core/services/servicios.service';
import { BarberoPublico, ofreceServicio } from '../../../core/models/barbero.model';
import { Servicio, esDelMenuDe } from '../../../core/models/servicio.model';
import { rangoDe, enPeriodo, valorCobrado } from '../../../core/utils/ganancias';
import { formatoCelular } from '../../../core/utils/colombia';
import { CLIENTE } from '../../../config/cliente';
import { ResumenAsistencia, claveCliente, resumirAsistencia } from '../../../core/utils/asistencia';
import { CaritaComponent } from '../../../shared/components/carita/carita.component';
import { IconoComponent } from '../../../shared/components/icono/icono.component';
import { MarcaComponent } from '../../../shared/components/marca/marca.component';
import { AdminCitasComponent } from '../admin-citas/admin-citas.component';
import { AdminServiciosComponent } from '../admin-servicios/admin-servicios.component';
import { AdminBarberosComponent } from '../admin-barberos/admin-barberos.component';
import { AdminAjustesComponent } from '../admin-ajustes/admin-ajustes.component';
import { AdminRendimientoComponent } from '../admin-rendimiento/admin-rendimiento.component';
import { AdminRecurrentesComponent } from '../admin-recurrentes/admin-recurrentes.component';
import { RecurrenteComponent } from '../../../shared/components/recurrente/recurrente.component';

type Tab = 'dashboard' | 'usuarios' | 'barberos' | 'citas' | 'recurrentes' | 'rendimiento' | 'servicios' | 'ajustes';

interface Pestana {
  id: Tab;
  texto: string;
  /** Texto de la barra inferior en móvil. */
  corto: string;
  /** Nombre del ícono (app-icono). */
  icono: string;
}

const PESTANAS: Pestana[] = [
  { id: 'dashboard', texto: 'Inicio', corto: 'Inicio', icono: 'tablero' },
  { id: 'citas', texto: 'Citas', corto: 'Citas', icono: 'calendario' },
  { id: 'recurrentes', texto: 'Agendas recurrentes', corto: 'Recurrentes', icono: 'repetir' },
  { id: 'rendimiento', texto: 'Cortes y ganancias', corto: 'Ganancias', icono: 'moneda' },
  { id: 'servicios', texto: 'Servicios y precios', corto: 'Servicios', icono: 'tijeras' },
  { id: 'barberos', texto: 'Equipo', corto: 'Equipo', icono: 'equipo' },
  { id: 'usuarios', texto: 'Usuarios y roles', corto: 'Usuarios', icono: 'usuario' },
  { id: 'ajustes', texto: 'Ajustes', corto: 'Ajustes', icono: 'ajustes' },
];

const ROLES: { valor: Usuario['rol']; nombre: string }[] = [
  { valor: 'cliente', nombre: 'Cliente' },
  { valor: 'barbero', nombre: 'Barbero' },
  { valor: 'admin', nombre: 'Admin' },
];

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    NgClass, CurrencyPipe, RouterLink, IconoComponent, MarcaComponent, AdminCitasComponent, AdminServiciosComponent, AdminBarberosComponent,
    AdminAjustesComponent, AdminRendimientoComponent, AdminRecurrentesComponent, RecurrenteComponent, CaritaComponent,
  ],
  template: `
    <div class="flex h-[100dvh] overflow-hidden bg-neutral-950 font-sans text-white">

      <!-- Barra lateral (escritorio) -->
      <aside class="relative hidden w-64 shrink-0 flex-col overflow-hidden border-r border-white/10 bg-black md:flex">
        @if (cliente.simbolo) {
          <div class="marca-de-agua absolute -bottom-10 -right-16 h-72 w-72" [style.--simbolo]="'url(' + cliente.simbolo + ')'"></div>
        }
        <a routerLink="/" class="relative flex h-20 items-center border-b border-white/10 px-6 text-lg text-white transition-opacity hover:opacity-80" title="Ver la página">
          <app-marca claseLogo="w-9 h-9" />
        </a>

        <nav class="relative flex-1 space-y-1 overflow-y-auto px-3 py-5" aria-label="Secciones del panel">
          <p class="rotulo mb-3 px-3">Panel</p>
          @for (tab of pestanas; track tab.id) {
            <button type="button" (click)="currentTab.set(tab.id)" [attr.aria-current]="currentTab() === tab.id ? 'page' : null"
                    class="group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition-colors"
                    [ngClass]="currentTab() === tab.id ? 'bg-white/[0.06] text-white' : 'text-neutral-400 hover:bg-white/[0.03] hover:text-white'">
              @if (currentTab() === tab.id) { <span class="absolute inset-y-2 left-0 w-0.5 rounded-full bg-detalle-400"></span> }
              <app-icono [nombre]="tab.icono" class="h-5 w-5" [ngClass]="currentTab() === tab.id ? 'text-detalle-300' : ''" [grosor]="1.8" />
              {{ tab.texto }}
            </button>
          }
        </nav>

        <div class="relative border-t border-white/10 p-4">
          @if (perfil(); as user) {
            <div class="mb-3 flex items-center gap-3 px-1">
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-detalle-400/40 bg-detalle-500/10 font-display text-sm font-bold text-detalle-200">{{ user.nombre.charAt(0) }}</span>
              <div class="min-w-0">
                <p class="truncate text-sm font-bold text-white">{{ user.nombre }}</p>
                <p class="truncate text-[11px] font-bold uppercase tracking-widest text-neutral-500">Administrador</p>
              </div>
            </div>
          }
          <div class="grid grid-cols-2 gap-2">
            <a routerLink="/" class="boton-linea boton-chico !px-2">Ver página</a>
            <button type="button" (click)="logout()" class="boton-linea boton-chico !px-2">Salir</button>
          </div>
        </div>
      </aside>

      <!-- Contenido -->
      <main class="flex min-w-0 flex-1 flex-col overflow-hidden">

        <!-- Encabezado (celular) -->
        <header class="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-black px-4 md:hidden">
          <a routerLink="/" class="flex min-h-11 items-center text-base text-white" title="Ver la página"><app-marca claseLogo="w-8 h-8" /></a>
          <div class="flex items-center gap-2">
            <a routerLink="/" class="boton-linea boton-chico !px-3">Ver página</a>
            <button type="button" (click)="logout()" class="boton-icono" aria-label="Cerrar sesión" title="Cerrar sesión">
              <app-icono nombre="salir" class="h-5 w-5" [grosor]="1.8" />
            </button>
          </div>
        </header>

        <div id="contenido-panel" class="flex-1 overflow-y-auto p-4 pb-28 md:p-8 md:pb-10">

          <!-- ============ INICIO ============ -->
          @if (currentTab() === 'dashboard') {
            <div class="animate-in fade-in duration-500">
              <div class="mb-8">
                <p class="rotulo mb-2">{{ hoyTexto }}</p>
                <h2 class="titulo-panel">{{ saludo() }}</h2>
                <p class="mt-1 text-neutral-400">Así va {{ cliente.nombre }} hoy.</p>
              </div>

              <!-- Agenda por periodos: hasta cuándo se puede reservar, y abrir el siguiente periodo de un toque -->
              @if (agenda(); as a) {
                <div class="mb-6 flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center"
                     [ngClass]="a.urgente ? 'border-red-500/30 bg-red-500/[0.06]' : 'border-detalle-400/25 bg-detalle-500/[0.05]'">
                  <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border"
                        [ngClass]="a.urgente ? 'border-red-500/30 text-red-300' : 'border-detalle-400/40 text-detalle-200'">
                    <app-icono [nombre]="a.urgente ? 'alerta' : 'calendario'" class="h-5 w-5" [grosor]="1.8" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="font-black text-white">{{ a.titulo }}</p>
                    <p class="text-sm text-neutral-400">{{ a.texto }}</p>
                  </div>
                  <div class="flex shrink-0 flex-wrap gap-2">
                    <button type="button" (click)="abrirAgenda(15)" [disabled]="abriendoAgenda()" class="boton-acento boton-chico">Abrir 15 días más</button>
                    <button type="button" (click)="currentTab.set('ajustes')" class="boton-linea boton-chico">Elegir fechas</button>
                  </div>
                </div>
              }

              <!-- Servicios que por ahora no se reservan en la página con algún barbero: que no se olvide habilitarlos -->
              @if (serviciosLimitados().length) {
                <div class="mb-6 flex flex-col gap-4 rounded-2xl border border-detalle-400/25 bg-detalle-500/[0.05] p-4 sm:flex-row sm:items-center">
                  <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-detalle-400/40 text-detalle-200">
                    <app-icono nombre="candado" class="h-5 w-5" [grosor]="1.8" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="font-black text-white">No todos los servicios se pueden reservar</p>
                    @for (l of serviciosLimitados(); track l.id) { <p class="text-sm text-neutral-400">{{ l.texto }}</p> }
                  </div>
                  <button type="button" (click)="currentTab.set('servicios')" class="boton-linea boton-chico shrink-0">Habilitar servicios</button>
                </div>
              }

              <div class="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
                <div class="placa p-5">
                  <p class="text-sm font-bold text-neutral-400">Citas de hoy</p>
                  <p class="mt-1 font-display text-4xl font-black">{{ stats().citasHoy }}</p>
                  <p class="mt-1 text-xs font-semibold text-neutral-500">{{ stats().porAtenderHoy }} por atender</p>
                </div>
                <div class="placa p-5">
                  <p class="text-sm font-bold text-detalle-300">Ingresos de hoy</p>
                  <p class="mt-1 font-display text-2xl font-black tabular-nums md:text-3xl">{{ stats().ingresosHoy | currency:'COP':'symbol-narrow':'1.0-0' }}</p>
                  <p class="mt-1 text-xs font-semibold text-neutral-500">{{ stats().cobradoHoy | currency:'COP':'symbol-narrow':'1.0-0' }} ya cobrados</p>
                </div>
                <div class="placa p-5">
                  <p class="text-sm font-bold text-neutral-400">Esta semana</p>
                  <p class="mt-1 font-display text-4xl font-black">{{ stats().cortesSemana }}</p>
                  <p class="mt-1 text-xs font-semibold" [ngClass]="stats().ausenciasSemana ? 'text-red-300/80' : 'text-neutral-500'">
                    cortes hechos · {{ stats().ausenciasSemana }} no asistieron
                  </p>
                </div>
                <div class="placa p-5">
                  <p class="text-sm font-bold text-neutral-400">Por venir</p>
                  <p class="mt-1 font-display text-4xl font-black">{{ stats().proximas }}</p>
                  <p class="mt-1 text-xs font-semibold text-neutral-500">{{ clientes() }} clientes registrados</p>
                </div>
              </div>

              <section class="mt-10">
                <div class="mb-4 flex items-end justify-between gap-4">
                  <h3 class="text-lg font-black">Lo que sigue hoy</h3>
                  <button type="button" (click)="currentTab.set('citas')" class="enlace-toque text-sm font-bold text-detalle-200 hover:text-white">
                    Ver el calendario <app-icono nombre="flecha" class="h-4 w-4" [grosor]="2" />
                  </button>
                </div>
                @if (citas() === undefined) {
                  <div class="tarjeta h-32 animate-pulse"></div>
                } @else if (siguientes().length === 0) {
                  <div class="tarjeta border-dashed px-6 py-10 text-center text-neutral-500">No quedan turnos por atender hoy.</div>
                } @else {
                  <ul class="tarjeta divide-y divide-white/5 overflow-hidden">
                    @for (cita of siguientes(); track cita.id) {
                      <li class="flex items-center gap-4 px-5 py-3.5">
                        <p class="w-20 shrink-0 font-display text-base font-bold text-detalle-200">{{ cita.horaStr }}</p>
                        <div class="min-w-0 flex-1">
                          <p class="flex min-w-0 items-center gap-2">
                            <span class="truncate font-bold">{{ cita.userName }}</span>
                            <app-carita [resumen]="asistenciaDe(cita)" [conTexto]="true" />
                            @if (cita.recurrenciaId) { <app-recurrente [frecuencia]="cita.frecuencia" [corto]="true" /> }
                          </p>
                          <p class="truncate text-sm text-neutral-500">{{ cita.serviceName }} · {{ cita.barberoNombre }}</p>
                        </div>
                        <span class="hidden shrink-0 text-sm font-bold text-neutral-300 sm:inline">{{ cita.precio | currency:'COP':'symbol-narrow':'1.0-0' }}</span>
                      </li>
                    }
                  </ul>
                }
              </section>
            </div>
          }

          <!-- ============ USUARIOS ============ -->
          @if (currentTab() === 'usuarios') {
            <div class="animate-in fade-in duration-500">
              <div class="mb-8">
                <h2 class="titulo-panel">Usuarios y roles</h2>
                <p class="mt-1 text-neutral-400">Quién puede entrar al panel. El rol de barbero también se asigna solo al poner su correo en Equipo.</p>
              </div>

              @if (usuarios() === undefined) {
                <div class="tarjeta h-64 animate-pulse"></div>
              } @else if (usuarios()!.length === 0) {
                <div class="tarjeta border-dashed px-6 py-12 text-center text-neutral-500">Aún no hay usuarios registrados.</div>
              } @else {
                <ul class="tarjeta divide-y divide-white/5 overflow-hidden">
                  @for (u of usuarios(); track u.uid) {
                    <li class="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                      <div class="flex min-w-0 flex-1 items-center gap-3">
                        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] font-display text-sm font-bold uppercase text-neutral-300">{{ u.nombre ? u.nombre.charAt(0) : '?' }}</span>
                        <div class="min-w-0">
                          <p class="truncate font-bold">{{ u.nombre || 'Sin nombre' }}</p>
                          <p class="truncate text-sm text-neutral-500">{{ u.email || contacto(u) }}</p>
                        </div>
                      </div>
                      <!-- El rol se cambia aquí mismo; el actual va resaltado -->
                      <div class="flex shrink-0 rounded-xl border border-white/10 p-1" role="group" [attr.aria-label]="'Rol de ' + (u.nombre || 'este usuario')">
                        @for (r of roles; track r.valor) {
                          <button type="button" (click)="cambiarRol(u, r.valor)" [attr.aria-pressed]="(u.rol || 'cliente') === r.valor"
                                  class="min-h-10 flex-1 rounded-lg px-3 text-xs font-extrabold uppercase tracking-wider transition-colors sm:flex-none"
                                  [ngClass]="(u.rol || 'cliente') === r.valor
                                    ? (r.valor === 'admin' ? 'bg-detalle-400 text-neutral-950' : 'bg-acento-500 text-sobre-acento')
                                    : 'text-neutral-500 hover:text-white'">{{ r.nombre }}</button>
                        }
                      </div>
                    </li>
                  }
                </ul>
              }
            </div>
          }

          @if (currentTab() === 'barberos') { <app-admin-barberos /> }
          @if (currentTab() === 'citas') { <app-admin-citas /> }
          @if (currentTab() === 'recurrentes') { <app-admin-recurrentes /> }
          @if (currentTab() === 'servicios') { <app-admin-servicios (irACitas)="currentTab.set('citas')" /> }
          @if (currentTab() === 'rendimiento') { <app-admin-rendimiento /> }
          @if (currentTab() === 'ajustes') { <app-admin-ajustes /> }
        </div>
      </main>

      <!-- Barra inferior (celular) -->
      <nav class="fixed inset-x-0 bottom-0 z-50 flex overflow-x-auto border-t border-white/10 bg-black/95 px-1 pt-1 backdrop-blur-xl scrollbar-hide pb-seguro md:hidden" aria-label="Secciones del panel">
        @for (tab of pestanas; track tab.id) {
          <button type="button" (click)="currentTab.set(tab.id)" [attr.aria-current]="currentTab() === tab.id ? 'page' : null"
                  class="relative flex min-h-12 min-w-[70px] shrink-0 flex-1 flex-col items-center justify-center gap-1 px-2"
                  [ngClass]="currentTab() === tab.id ? 'text-white' : 'text-neutral-500'">
            @if (currentTab() === tab.id) { <span class="absolute inset-x-4 top-0 h-0.5 rounded-full bg-detalle-400"></span> }
            <app-icono [nombre]="tab.icono" class="h-5 w-5" [ngClass]="currentTab() === tab.id ? 'text-detalle-300' : ''" [grosor]="1.8" />
            <span class="whitespace-nowrap text-[11px] font-bold">{{ tab.corto }}</span>
          </button>
        }
      </nav>
    </div>
  `
})
export class AdminDashboardComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  private usuariosService = inject(UsuariosService);
  private citasService = inject(CitasService);
  private notificaciones = inject(NotificationService);
  private confirmar = inject(ConfirmarService);
  private ajustesService = inject(AjustesService);

  readonly cliente = CLIENTE;
  readonly pestanas = PESTANAS;
  readonly roles = ROLES;
  readonly currentTab = signal<Tab>('dashboard');
  readonly hoyTexto = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

  readonly perfil = toSignal(this.authService.currentUserProfile$);
  /** undefined mientras cargan. */
  readonly usuarios = toSignal(this.usuariosService.listar().pipe(catchError(error => {
    console.error('Error cargando usuarios:', error);
    return of<Usuario[]>([]);
  })));
  readonly citas = toSignal(this.citasService.todas().pipe(catchError(error => {
    console.error('Error cargando citas:', error);
    return of<Cita[]>([]);
  })));

  readonly saludo = computed(() => {
    const nombre = this.perfil()?.nombre?.split(' ')[0];
    return nombre ? `Hola, ${nombre}` : 'Hola de nuevo';
  });

  readonly clientes = computed(() => (this.usuarios() ?? []).filter(u => (u.rol ?? 'cliente') === 'cliente').length);

  readonly stats = computed(() => {
    const citas = this.citas() ?? [];
    const hoy = claveDia(new Date());
    const deHoy = citas.filter(c => diaDeCita(c) === hoy && c.estado !== 'cancelada');
    const semana = rangoDe('semana');
    const deLaSemana = citas.filter(c => enPeriodo(c, semana));
    const sumar = (lista: Cita[]) => lista.reduce((total, c) => total + valorCobrado(c), 0);
    return {
      citasHoy: deHoy.length,
      porAtenderHoy: deHoy.filter(c => esActiva(c.estado)).length,
      ingresosHoy: sumar(deHoy.filter(c => c.estado !== 'no-asistio')),
      cobradoHoy: sumar(deHoy.filter(c => c.estado === 'completada')),
      cortesSemana: deLaSemana.filter(c => c.estado === 'completada').length,
      ausenciasSemana: deLaSemana.filter(c => c.estado === 'no-asistio').length,
      proximas: citas.filter(c => esActiva(c.estado) && diaDeCita(c) >= hoy).length,
    };
  });

  /** Turnos de hoy que faltan por atender, en orden. */
  /** Las caritas de asistencia (ver utils/asistencia.ts): el admin ya tiene todas las citas. */
  private readonly asistencia = computed(() => resumirAsistencia(this.citas() ?? []));

  asistenciaDe(cita: Cita): ResumenAsistencia | undefined {
    const clave = claveCliente(cita);
    return clave ? this.asistencia().get(clave) : undefined;
  }

  readonly siguientes = computed(() => {
    const hoy = claveDia(new Date());
    return (this.citas() ?? []).filter(c => diaDeCita(c) === hoy && esActiva(c.estado)).sort(compararCitas).slice(0, 6);
  });

  /** Con la agenda por periodos: cómo va el periodo abierto. null con la agenda continua (no hay nada que abrir). */
  readonly agenda = computed(() => {
    const periodo = this.ajustesService.periodo();
    if (!periodo.porPeriodo) return null;
    if (!periodo.abierta) {
      return { urgente: true, titulo: 'La agenda está cerrada', texto: 'Ahora nadie puede reservar desde la página. Abre el siguiente periodo.' };
    }
    const quedan = periodo.diasRestantes ?? 0;
    return {
      urgente: quedan <= 3,
      titulo: periodo.texto,
      texto: this.ajustesService.agenda().desde > claveDia(new Date()) ? 'Tus clientes ya pueden reservar para esas fechas.'
        : quedan === 0 ? 'Hoy es el último día que se puede reservar.'
        : quedan === 1 ? 'Mañana es el último día que se puede reservar.'
        : `Tus clientes pueden reservar para los próximos ${quedan + 1} días.`,
    };
  });
  readonly abriendoAgenda = signal(false);

  private readonly equipo = toSignal(inject(BarberosService).listar().pipe(catchError(() => of<BarberoPublico[]>([]))), { initialValue: [] as BarberoPublico[] });
  private readonly catalogo = toSignal(inject(ServiciosService).actuales().pipe(catchError(() => of<Servicio[]>([]))), { initialValue: [] as Servicio[] });

  /** Barberos con servicios sin habilitar para reservar en la página (ver Servicios y precios). */
  readonly serviciosLimitados = computed(() => {
    // Cada uno con su menú: los servicios propios de otro barbero no cuentan como "sin habilitar".
    return this.equipo()
      .map(b => ({ b, menu: this.catalogo().filter(s => esDelMenuDe(s, b.id)) }))
      .map(({ b, menu }) => ({ b, menu, abiertos: menu.filter(s => ofreceServicio(b, s)) }))
      .filter(({ menu, abiertos }) => abiertos.length < menu.length)
      .map(({ b, abiertos }) => ({
        id: b.id!,
        texto: abiertos.length
          ? `Con ${b.nombre} solo se reserva: ${abiertos.map(s => s.nombre).join(', ')}.`
          : `Con ${b.nombre} no se reserva nada en la página.`,
      }));
  });

  constructor() {
    // Prepara los días de agenda que les falten a los barberos: sin su documento de ocupación, ese día no se puede
    // reservar. La primera vez (tras publicar este cambio) arma los próximos 62 días con las citas que ya había;
    // después casi nunca falta nada (la Cloud Function los prepara cada noche), salvo con un barbero nuevo.
    const ocupacion = inject(OcupacionService);
    let preparados = '';
    effect(() => {
      const ids = this.equipo().map(b => b.id!).filter(Boolean).sort();
      if (ids.length === 0 || ids.join(',') === preparados) return;
      preparados = ids.join(',');
      untracked(() => ocupacion.prepararPendientes(ids)
        .then(creados => { if (creados) console.info(`Agenda: ${creados} días preparados.`); })
        .catch(error => console.error('No se pudieron preparar los días de la agenda:', error)));
    });
  }

  /** Abre más días de agenda sin pasar por Ajustes: desde el último día abierto o, si ya cerró, desde hoy. */
  async abrirAgenda(dias: number) {
    const actual = this.ajustesService.agenda();
    const nueva = extenderAgenda(actual, dias);
    if (nueva.hasta === actual.hasta && nueva.desde === actual.desde) {
      this.notificaciones.error('La agenda ya está abierta al máximo', `No se puede abrir a más de ${MAX_DIAS_AGENDA} días desde hoy.`);
      return;
    }
    const seguro = await this.confirmar.preguntar({
      titulo: `¿Abrir la agenda hasta el ${diaLargo(nueva.hasta)}?`,
      texto: 'Tus clientes podrán reservar desde la página hasta ese día.',
      aceptar: 'Sí, abrirla',
    });
    if (!seguro) return;
    this.abriendoAgenda.set(true);
    try {
      await this.ajustesService.guardarAgenda(nueva);
      this.notificaciones.exito('Agenda abierta', `Ya se puede reservar hasta el ${diaLargo(nueva.hasta)}.`);
    } catch (error) {
      console.error('Error abriendo la agenda:', error);
      this.notificaciones.error('No se pudo abrir la agenda', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      this.abriendoAgenda.set(false);
    }
  }

  contacto(u: Usuario): string {
    return u.telefono ? formatoCelular(u.telefono) : 'Sin correo';
  }

  async cambiarRol(usuario: Usuario, rol: Usuario['rol']) {
    if ((usuario.rol ?? 'cliente') === rol) return;
    const nombre = usuario.nombre || 'este usuario';
    // Dar (o quitar) el control total merece una pausa.
    if (rol === 'admin' || usuario.rol === 'admin') {
      const seguro = await this.confirmar.preguntar(rol === 'admin'
        ? { titulo: `¿Hacer admin a ${nombre}?`, texto: 'Podrá ver y cambiar todo: citas, precios, equipo, ganancias y roles.', aceptar: 'Sí, hacerlo admin', peligro: true }
        : { titulo: `¿Quitarle el rol de admin a ${nombre}?`, texto: 'Dejará de poder entrar a este panel.', aceptar: 'Sí, quitárselo', peligro: true });
      if (!seguro) return;
    }
    try {
      await this.usuariosService.cambiarRol(usuario.uid, rol);
    } catch (error) {
      console.error('Error actualizando rol:', error);
      this.notificaciones.error('No se pudo cambiar el rol', 'Revisa tu conexión e inténtalo de nuevo.');
    }
  }

  async logout() {
    await this.authService.logout();
    this.router.navigate(['/']);
  }
}
