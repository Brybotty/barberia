import { Pipe, PipeTransform } from '@angular/core';

/** 40 -> '40 min', 60 -> '1 h', 90 -> '1 h 30 min', 300 -> '5 h'. */
@Pipe({ name: 'duracion', standalone: true })
export class DuracionPipe implements PipeTransform {
  transform(minutos: number | null | undefined): string {
    if (!minutos || minutos <= 0) return '';
    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;
    if (horas === 0) return `${resto} min`;
    return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
  }
}
