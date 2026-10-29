import { Injectable, inject } from '@angular/core';
import { Firestore, deleteField, doc, setDoc } from '@angular/fire/firestore';
import { claveDia } from '../utils/horario';
import { AjustesService } from './ajustes.service';

/**
 * Guarda los días con servicios limitados (`ajustes/sitio.serviciosPorDia`, ver utils/servicios-del-dia.ts). Va aparte
 * de AjustesService para que la página pública no descargue lo que solo usa el panel.
 */
@Injectable({ providedIn: 'root' })
export class ServiciosDelDiaService {
  private ref = doc(inject(Firestore), 'ajustes/sitio');
  private ajustes = inject(AjustesService);

  /**
   * Los servicios que se reservan en línea un día (null o vacío: todos otra vez). De paso se sueltan los días que ya
   * pasaron, para que el documento no crezca.
   */
  guardar(dia: string, servicios: string[] | null): Promise<void> {
    const hoy = claveDia(new Date());
    const cambios: Record<string, unknown> = {};
    for (const viejo of Object.keys(this.ajustes.serviciosPorDia())) {
      if (viejo < hoy) cambios[viejo] = deleteField();
    }
    cambios[dia] = servicios?.length ? [...servicios] : deleteField();
    return setDoc(this.ref, { serviciosPorDia: cambios }, { merge: true });
  }
}
