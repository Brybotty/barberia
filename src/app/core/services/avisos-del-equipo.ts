import { Injector } from '@angular/core';
import { Observable, map, of, switchMap } from 'rxjs';
import { BARBERO_CUALQUIERA, Cita } from '../models/cita.model';
import { Usuario } from '../models/usuario.model';
import { BarberosService } from './barberos.service';
import { CitasService } from './citas.service';

/**
 * Las reservas que se crean mientras alguien del equipo tiene la app abierta: al admin, todas; a un barbero, las
 * suyas. Va en un archivo aparte que NotificationService carga solo para el equipo: así un visitante no descarga el
 * servicio de citas ni la agenda al abrir la página.
 */
export function citasNuevasPara(injector: Injector, perfil: Usuario): Observable<Cita[]> {
  const citas = injector.get(CitasService);
  // Los turnos de una agenda recurrente los aparta el sistema de a varios (uno por semana): no son reservas nuevas
  // y, si avisaran, sonarían nueve veces seguidas. Las que se acaban de crear desde aquí (una cita del panel) no se
  // anuncian a quien las creó.
  const nuevas$ = citas.creadasDesde(new Date().toISOString()).pipe(
    map(lista => lista.filter(c => !c.recurrenciaId && !citas.creadasAqui.has(c.id!))),
  );
  if (perfil.rol === 'admin') return nuevas$;

  // Las cuentas de celular no tienen correo: no pueden estar enlazadas a un perfil de barbero.
  return (perfil.email ? injector.get(BarberosService).delEmail(perfil.email) : of([])).pipe(
    map(perfiles => [...perfiles.map(b => b.id!), BARBERO_CUALQUIERA]),
    switchMap(ids => nuevas$.pipe(map(lista => lista.filter(c => ids.includes(c.barberoId))))),
  );
}
