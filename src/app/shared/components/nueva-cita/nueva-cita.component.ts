import { Component, DestroyRef, OnInit, computed, effect, inject, input, output, untracked } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CitasService, DiaNoPreparadoError, HorarioNoDisponibleError } from '../../../core/services/citas.service';
import { AjustesService } from '../../../core/services/ajustes.service';
import { NotificationService } from '../../../core/services/notification.service';
import { OcupacionService } from '../../../core/services/ocupacion.service';
import { Cita, NuevaCita } from '../../../core/models/cita.model';
import { BarberoPublico } from '../../../core/models/barbero.model';
import { DURACION_MAXIMA, duracionRecurrente } from '../../../core/models/recurrencia.model';
import { Servicio, esDelMenuDe, precioCon } from '../../../core/models/servicio.model';
import {
  INTERVALO, LIMITE_DEL_EQUIPO, aperturaDe, claveDia, duracionDe, estaCerrado, fechaDesdeClave, formatearHora12, minutosAHora24,
  opcionesDeHora, trabaja,
} from '../../../core/utils/horario';
import { MARCA, Ocupacion, armarOcupacion, estaLibreEn, turnosEncadenados } from '../../../core/utils/ocupacion';
import { esCelularValido, limpiarCelular } from '../../../core/utils/colombia';
import { nombresDeServicios, servicioPermitidoEl, serviciosDelDia } from '../../../core/utils/servicios-del-dia';
import { DuracionPipe } from '../../pipes/duracion.pipe';
import { ElegirDuracionComponent } from '../elegir-duracion/elegir-duracion.component';
import { IconoComponent } from '../icono/icono.component';

const DIA_VALIDO = /^\d{4}-\d{2}-\d{2}$/;
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Hasta cuántos días adelante se agenda un barbero (las reglas aceptan 62 y los días se preparan hasta ahí). */
const DIAS_DEL_BARBERO = 60;
const DURACION = new DuracionPipe();

interface Hora {
  minutos: number;
  etiqueta: string;
}

/**
 * Agendar una cita desde el panel (la pidieron por WhatsApp, por teléfono o en el local). Además de las horas del
 * horario, ofrece las de después del cierre, hasta que la cita termine a LIMITE_DEL_EQUIPO (10:00 p. m.): esas solo
 * las agenda el equipo, la reserva en línea no las ofrece.
 * - Admin: con cualquier barbero y servicio. Lo que se sale de lo normal (día cerrado, día libre, descanso) solo se
 *   avisa; puede poner el correo del cliente para que le llegue la confirmación.
 * - Barbero (`barberoFijo`): solo para sí mismo, en los días y horas que trabaja, con sus servicios y sin correos
 *   (las reglas lo exigen igual: ver citaDelBarbero en firestore.rules).
 * Los dos pueden cambiar la duración (de 5 en 5, como en las agendas recurrentes) si ese cliente tarda más o menos:
 * la cita ocupa justo ese rato y las horas se calculan con ella (los turnos seguidos no dejan tiempo muerto).
 */
@Component({
  selector: 'app-nueva-cita',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, IconoComponent, ElegirDuracionComponent],
  template: `
    <div class="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="nueva-cita">
      <div class="absolute inset-0 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200" (click)="cerrar.emit()"></div>
      <form (ngSubmit)="guardar()" class="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-neutral-950 p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-300 sm:max-w-lg sm:rounded-3xl sm:p-7">
        <p class="rotulo mb-2">Agenda</p>
        <h3 id="nueva-cita" class="text-xl font-black">Nueva cita</h3>
        <p class="mt-1 text-sm text-neutral-400">Para las citas que te piden por WhatsApp, por teléfono o en el local.</p>

        <div class="mt-6 space-y-4">
          <label class="block">
            <span class="etiqueta">Cliente</span>
            <input type="text" name="nuevaNombre" [(ngModel)]="nueva.userName" maxlength="120" required autocomplete="off" class="campo"
                   [class.campo-error]="intento && !nueva.userName.trim()" placeholder="Nombre y apellido">
          </label>
          <div [class]="barberoFijo() ? 'grid gap-4' : 'grid gap-4 sm:grid-cols-2'">
            <label class="block">
              <span class="etiqueta">Celular (opcional)</span>
              <input type="tel" name="nuevaCelular" [(ngModel)]="nueva.phone" maxlength="25" inputmode="numeric" autocomplete="off" class="campo"
                     [class.campo-error]="intento && !celularValido" placeholder="300 123 4567">
              @if (intento && !celularValido) { <span class="texto-error">10 dígitos, empezando por 3.</span> }
            </label>
            @if (!barberoFijo()) {
              <label class="block">
                <span class="etiqueta">Correo (opcional)</span>
                <input type="email" name="nuevaCorreo" [(ngModel)]="nueva.userEmail" maxlength="120" autocomplete="off" class="campo"
                       [class.campo-error]="intento && !correoValido" placeholder="cliente@correo.com">
                @if (intento && !correoValido) { <span class="texto-error">Revisa el correo.</span> }
              </label>
            }
          </div>

          <div [class]="barberoFijo() ? 'grid gap-4' : 'grid gap-4 sm:grid-cols-2'">
            @if (!barberoFijo()) {
              <label class="block">
                <span class="etiqueta">Barbero</span>
                <select name="nuevaBarbero" [(ngModel)]="nueva.barberoId" (ngModelChange)="elegirBarbero()" class="campo [color-scheme:dark]">
                  @for (b of listaBarberos(); track b.id) {
                    <option [ngValue]="b.id">{{ b.nombre }}</option>
                  }
                </select>
              </label>
            }
            <label class="block">
              <span class="etiqueta">Servicio</span>
              <select name="nuevaServicio" [(ngModel)]="nueva.servicioId" (ngModelChange)="elegirServicio()" class="campo [color-scheme:dark]">
                @for (s of serviciosDelBarbero; track s.id) {
                  <option [ngValue]="s.id">{{ s.nombre }} · {{ duracion(s) }} min</option>
                }
              </select>
              @if (servicio) {
                <span class="ayuda" data-precio-cita>Precio: {{ precio | currency:'COP':'symbol-narrow':'1.0-0' }}{{ precio !== servicio.precio ? ' (el de ' + (barbero?.nombre ?? 'este barbero') + ')' : '' }}</span>
              }
            </label>
          </div>

          <app-elegir-duracion [duracion]="nueva.duracion" (duracionChange)="elegirDuracion($event)" [catalogo]="duracionCatalogo"
                               [maxima]="duracionMaxima" campoId="nueva-duracion" nombre="nuevaDuracion" />

          <div class="grid grid-cols-2 gap-3">
            <label class="block">
              <span class="etiqueta">Fecha</span>
              <input type="date" name="nuevaDia" [(ngModel)]="nueva.dia" (ngModelChange)="escucharDia()" required class="campo [color-scheme:dark]"
                     [attr.min]="barberoFijo() ? hoy : null" [attr.max]="barberoFijo() ? hasta : null">
            </label>
            <label class="block">
              <span class="etiqueta">Hora</span>
              <select name="nuevaMinutos" [(ngModel)]="nueva.minutos" [disabled]="horas.length === 0" class="campo [color-scheme:dark]"
                      [class.campo-error]="intento && nueva.minutos === null">
                @if (nueva.minutos === null) { <option [ngValue]="null" disabled>{{ cargando ? 'Cargando…' : 'Elige' }}</option> }
                @if (turnos.length) {
                  <optgroup label="Turnos seguidos (sin tiempo muerto)">
                    @for (opcion of turnos; track opcion.minutos) { <option [ngValue]="opcion.minutos">{{ opcion.etiqueta }}</option> }
                  </optgroup>
                }
                @if (otras.length) {
                  <optgroup label="Otras horas libres">
                    @for (opcion of otras; track opcion.minutos) { <option [ngValue]="opcion.minutos">{{ opcion.etiqueta }}</option> }
                  </optgroup>
                }
                @if (despuesDelCierre.length) {
                  <optgroup [label]="'Después del cierre (hasta las ' + limite + ')'">
                    @for (opcion of despuesDelCierre; track opcion.minutos) { <option [ngValue]="opcion.minutos">{{ opcion.etiqueta }}</option> }
                  </optgroup>
                }
              </select>
            </label>
          </div>
          @if (!cargando && horas.length === 0 && nueva.dia) {
            <p class="texto-error !mt-0">{{ sinHoras }}</p>
          }
          @for (aviso of avisos; track aviso) {
            <p class="flex items-start gap-2 text-xs font-semibold text-detalle-200"><app-icono nombre="alerta" class="mt-px h-4 w-4 shrink-0" [grosor]="1.8" /> {{ aviso }}</p>
          }
          <p class="ayuda">
            Solo se ofrecen las horas en que {{ barberoFijo() ? 'tienes' : 'el barbero tiene' }} libre todo el rato de la cita (con la duración de arriba), de 5 en 5 minutos.
            Los turnos seguidos empiezan justo cuando termina la cita anterior. Después del cierre se puede agendar hasta que la cita termine a las {{ limite }}
            (la reserva en línea no ofrece esas horas).
            @if (barberoFijo()) {
              No se envían correos: avísale tú al cliente.
            } @else {
              Al barbero le llega el aviso por correo{{ correoLleno ? ', y al cliente la confirmación' : '' }}.
            }
            Si el cliente entra a la página con ese celular{{ barberoFijo() ? '' : ' o ese correo' }}, verá la cita en "Mis reservas".
          </p>
        </div>

        <div class="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" (click)="cerrar.emit()" class="boton-linea">Cancelar</button>
          <button type="submit" [disabled]="guardando" class="boton-acento">{{ guardando ? 'Agendando…' : 'Agendar cita' }}</button>
        </div>
      </form>
    </div>
  `,
})
export class NuevaCitaComponent implements OnInit {
  private citasService = inject(CitasService);
  private ajustes = inject(AjustesService);
  private notificaciones = inject(NotificationService);
  private ocupacionService = inject(OcupacionService);

  readonly barberos = input<BarberoPublico[]>([]);
  readonly servicios = input<Servicio[]>([]);
  /** Las citas que ya hay: con ellas se arma un día que aún no tiene su documento (solo el admin lo puede crear). */
  readonly citas = input<Cita[]>([]);
  /** Un barbero que se agenda a sí mismo (desde su panel). */
  readonly barberoFijo = input<BarberoPublico | null>(null);
  /** Barbero con que abre el formulario del admin (el que se está mirando en Citas). Vacío: el primero. */
  readonly barberoInicial = input('');
  /** Día con que abre el formulario. */
  readonly dia = input(claveDia(new Date()));
  readonly cerrar = output<void>();
  readonly agendada = output<Cita>();

  readonly listaBarberos = computed(() => {
    const fijo = this.barberoFijo();
    return fijo ? [fijo] : this.barberos();
  });
  readonly listaServicios = computed(() => {
    const fijo = this.barberoFijo();
    return fijo ? this.servicios().filter(s => !fijo.serviciosCerrados?.includes(s.id!) && esDelMenuDe(s, fijo.id)) : this.servicios();
  });

  /** Los del menú del barbero elegido: los servicios propios de otro barbero no se le ofrecen. */
  get serviciosDelBarbero(): Servicio[] {
    return this.listaServicios().filter(s => esDelMenuDe(s, this.nueva.barberoId));
  }

  /** Lo que se cobra: el precio de ese barbero (el suyo propio, si tiene). */
  get precio(): number {
    return this.servicio ? precioCon(this.servicio, this.nueva.barberoId) : 0;
  }

  readonly limite = formatearHora12(LIMITE_DEL_EQUIPO);
  readonly hoy = claveDia(new Date());
  readonly hasta = claveDia(new Date(Date.now() + DIAS_DEL_BARBERO * 86_400_000));

  /** `duracion`: la del catálogo del servicio, salvo que se cambie para este cliente (de 5 en 5). */
  nueva = { userName: '', phone: '', userEmail: '', barberoId: '', servicioId: '', duracion: INTERVALO, dia: '', minutos: null as number | null };
  intento = false;
  guardando = false;
  cargando = false;
  /** Las horas libres, en tres grupos: turnos encadenados (sin tiempo muerto), otras del horario y después del cierre. */
  horas: Hora[] = [];
  turnos: Hora[] = [];
  otras: Hora[] = [];
  despuesDelCierre: Hora[] = [];
  /** Por qué no hay horas ese día. */
  sinHoras = '';
  private ocupacion = new Map<string, Ocupacion>();
  private escucha?: Subscription;

  constructor() {
    // Si cambian el equipo o los servicios con el formulario abierto, se ajusta lo elegido y las horas.
    effect(() => {
      const barberos = this.listaBarberos();
      const servicios = this.listaServicios();
      untracked(() => {
        if (!barberos.some(b => b.id === this.nueva.barberoId)) this.nueva.barberoId = barberos[0]?.id ?? '';
        if (!servicios.some(s => s.id === this.nueva.servicioId)) {
          this.nueva.servicioId = servicios[0]?.id ?? '';
          this.nueva.duracion = this.duracionSugerida;
        }
        this.elegirBarbero();
      });
    });
    inject(DestroyRef).onDestroy(() => this.escucha?.unsubscribe());
  }

  ngOnInit() {
    this.nueva.dia = this.dia();
    // Si no está en el equipo, el efecto de arriba pone el primero.
    if (this.barberoInicial()) this.nueva.barberoId = this.barberoInicial();
    this.escucharDia();
  }

  duracion(servicio: Servicio): number {
    return duracionDe(servicio);
  }

  get barbero(): BarberoPublico | undefined {
    return this.listaBarberos().find(b => b.id === this.nueva.barberoId);
  }

  get servicio(): Servicio | undefined {
    return this.serviciosDelBarbero.find(s => s.id === this.nueva.servicioId);
  }

  /** Al cambiar de barbero: si el servicio elegido es propio de otro, pasa al primero de su menú. */
  elegirBarbero() {
    const menu = this.serviciosDelBarbero;
    if (!menu.some(s => s.id === this.nueva.servicioId)) {
      this.nueva.servicioId = menu[0]?.id ?? '';
      this.nueva.duracion = this.duracionSugerida;
    }
    this.calcularHoras();
  }

  /** La del catálogo para el servicio elegido. */
  get duracionCatalogo(): number {
    return this.servicio ? duracionDe(this.servicio) : INTERVALO;
  }

  /** Hasta 4 horas, como en las agendas recurrentes (o lo que diga el catálogo, si es más). */
  get duracionMaxima(): number {
    return Math.max(DURACION_MAXIMA, duracionRecurrente(this.duracionCatalogo, Infinity));
  }

  /** La del catálogo llevada a una que se puede elegir (de 5 en 5): con la que arranca cada servicio. */
  get duracionSugerida(): number {
    return duracionRecurrente(this.duracionCatalogo, this.duracionMaxima);
  }

  /** Al cambiar de servicio, la duración vuelve a la de su catálogo. */
  elegirServicio() {
    this.nueva.duracion = this.duracionSugerida;
    this.calcularHoras();
  }

  /** Para un cliente que tarda más o menos: las horas se vuelven a calcular con esa duración. */
  elegirDuracion(minutos: number) {
    this.nueva.duracion = minutos;
    this.calcularHoras();
  }

  get celularValido(): boolean {
    return !this.nueva.phone.trim() || esCelularValido(this.nueva.phone);
  }

  get correoLleno(): boolean {
    return !!this.nueva.userEmail.trim();
  }

  get correoValido(): boolean {
    return !this.correoLleno || CORREO_VALIDO.test(this.nueva.userEmail.trim());
  }

  /** Lo que conviene saber antes de agendar, sin impedirlo (el admin puede atender fuera de lo normal). */
  get avisos(): string[] {
    const { dia, minutos, duracion } = this.nueva;
    if (!DIA_VALIDO.test(dia)) return [];
    const avisos: string[] = [];
    // Un día que el admin dejó para otros servicios: el equipo agenda igual (el límite es para lo que se reserva en línea).
    const porDia = this.ajustes.serviciosPorDia();
    if (this.servicio && !servicioPermitidoEl(porDia, dia, this.servicio.id)) {
      avisos.push(`Ese día en línea solo se reserva ${nombresDeServicios(serviciosDelDia(porDia, dia) ?? [], this.servicios())}. Puedes agendar ${this.servicio.nombre} igual.`);
    }
    if (this.barberoFijo()) return avisos;
    const horario = this.ajustes.horario();
    if (dia < claveDia(new Date())) avisos.push('Es un día que ya pasó. La cita queda registrada, sin avisos por correo.');
    if (estaCerrado(dia, horario)) avisos.push('La barbería está cerrada ese día.');
    else if (minutos !== null && minutos < aperturaDe(horario, fechaDesdeClave(dia).getDay())) avisos.push('Es antes de la hora en que abre la barbería ese día.');
    const barbero = this.barbero;
    if (barbero && barbero.diasLibres?.includes(fechaDesdeClave(dia).getDay())) {
      avisos.push(`Es el día libre de ${barbero.nombre}.`);
    } else if (barbero && minutos !== null && !trabaja(barbero, dia, minutos, duracion)) {
      avisos.push(`Se cruza con el descanso de ${barbero.nombre}.`);
    }
    if (minutos !== null && minutos + duracion > horario.cierre) {
      avisos.push('Termina después del cierre de la barbería: confírmalo con el barbero.');
    }
    return avisos;
  }

  /** Escucha la agenda del día elegido: si alguien reserva mientras se llena el formulario, esa hora desaparece. */
  escucharDia() {
    this.escucha?.unsubscribe();
    this.ocupacion = new Map();
    const dia = this.nueva.dia;
    this.cargando = DIA_VALIDO.test(dia);
    this.calcularHoras();
    if (!this.cargando) return;
    this.escucha = this.ocupacionService.delDia(dia).subscribe({
      next: ocupacion => {
        this.ocupacion = ocupacion;
        this.cargando = false;
        this.calcularHoras();
      },
      error: error => {
        console.error('Error cargando la agenda del día', error);
        this.cargando = false;
        this.calcularHoras();
      },
    });
  }

  /**
   * Horas de 5 en 5 en que el barbero tiene libre todo el rato de la cita (con la duración elegida), hasta que termine
   * a LIMITE_DEL_EQUIPO. Primero van los turnos encadenados del horario (justo al abrir, o cuando termina la cita o el
   * cierre anterior), que no dejan tiempo muerto; al final, las de después del cierre.
   */
  calcularHoras() {
    const { barberoId, dia, duracion } = this.nueva;
    const servicio = this.servicio;
    const fijo = this.barberoFijo();
    const horario = this.ajustes.horario();
    this.horas = [];
    this.sinHoras = '';
    if (!this.cargando && barberoId && servicio && DIA_VALIDO.test(dia)) {
      const diaSemana = fechaDesdeClave(dia).getDay();
      const documento = this.ocupacion.get(barberoId);
      if (fijo && estaCerrado(dia, horario)) this.sinHoras = 'La barbería está cerrada ese día.';
      else if (fijo && fijo.diasLibres?.includes(diaSemana)) this.sinHoras = 'Es tu día libre.';
      else if (fijo && !documento) this.sinHoras = 'La agenda de ese día aún no está lista. Prueba más tarde o pídele al administrador que abra su panel.';
      else {
        // Un día que aún no tiene su documento (muy adelante) se arma con las citas que ya hay (solo el admin).
        const mapa = documento?.mapa ?? armarOcupacion(barberoId, dia, this.citas(), []).mapa;
        // El barbero, desde que abre ese día y fuera de su descanso; el admin, desde la apertura más temprana (avisa).
        const desde = fijo ? aperturaDe(horario, diaSemana) : 0;
        this.horas = opcionesDeHora({ ...horario, cierre: LIMITE_DEL_EQUIPO }, false, MARCA).filter(o =>
          o.minutos >= desde && o.minutos + duracion <= LIMITE_DEL_EQUIPO && estaLibreEn(mapa, o.minutos, duracion)
          && (!fijo || trabaja(fijo, dia, o.minutos, duracion)));
        const seguidos = new Set(turnosEncadenados({
          mapa, apertura: aperturaDe(horario, diaSemana), cierre: horario.cierre, duracion, descanso: this.barbero?.descanso, paso: horario.intervalo,
        }));
        const enHorario = this.horas.filter(o => o.minutos + duracion <= horario.cierre);
        this.turnos = enHorario.filter(o => seguidos.has(o.minutos));
        this.otras = enHorario.filter(o => !seguidos.has(o.minutos));
        this.despuesDelCierre = this.horas.filter(o => o.minutos + duracion > horario.cierre);
        if (this.horas.length === 0) {
          const para = `ese día para un servicio de ${DURACION.transform(duracion)}`;
          this.sinHoras = fijo ? `No tienes horas libres ${para}.` : `${this.barbero?.nombre ?? 'El barbero'} no tiene horas libres ${para}.`;
        }
      }
    }
    if (this.horas.length === 0) {
      this.turnos = [];
      this.otras = [];
      this.despuesDelCierre = [];
    }
    if (!this.horas.some(o => o.minutos === this.nueva.minutos)) this.nueva.minutos = null;
  }

  async guardar() {
    this.intento = true;
    const { dia, minutos } = this.nueva;
    const servicio = this.servicio;
    const barbero = this.barbero;
    const fijo = this.barberoFijo();
    if (!this.nueva.userName.trim() || !this.celularValido || !this.correoValido
      || !servicio || !barbero || !DIA_VALIDO.test(dia) || minutos === null) {
      this.notificaciones.error('Revisa la cita', `Completa el cliente${fijo ? '' : ', el barbero'}, el servicio, la fecha y la hora.`);
      return;
    }
    const datos: NuevaCita = {
      userId: '',
      userName: this.nueva.userName.trim().slice(0, 120),
      // En minúsculas, como el de las cuentas: así el cliente la ve en "Mis reservas" si entra con ese correo.
      userEmail: fijo ? '' : this.nueva.userEmail.trim().toLowerCase(),
      phone: this.nueva.phone.trim() ? limpiarCelular(this.nueva.phone) : '',
      servicioId: servicio.id!,
      serviceName: servicio.nombre,
      precio: precioCon(servicio, barbero.id),
      duracionMinutos: this.nueva.duracion,
      barberoId: barbero.id!,
      barberoNombre: barbero.nombre.slice(0, 80),
      dia,
      hora: minutosAHora24(minutos),
      horaStr: formatearHora12(minutos),
      fecha: fechaDesdeClave(dia, minutos).toISOString(),
    };
    try {
      this.guardando = true;
      const cita = fijo ? await this.citasService.registrarDelBarbero(datos) : await this.citasService.registrarDesdePanel(datos);
      const cuando = fechaDesdeClave(dia).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
      this.notificaciones.exito('Cita agendada', fijo
        ? `${datos.userName}, ${cuando} a las ${datos.horaStr}.`
        : `${datos.userName}, ${datos.horaStr} con ${datos.barberoNombre}.`);
      this.agendada.emit(cita);
    } catch (e) {
      if (e instanceof HorarioNoDisponibleError) {
        this.notificaciones.error('Horario ocupado', 'Esa hora se acaba de ocupar. Elige otra.');
      } else if (e instanceof DiaNoPreparadoError) {
        this.notificaciones.error('Ese día aún no está listo', 'Prueba con otra fecha o pídele al administrador que abra su panel.');
      } else {
        console.error(e);
        this.notificaciones.error('No se pudo agendar la cita');
      }
    } finally {
      this.guardando = false;
    }
  }
}
