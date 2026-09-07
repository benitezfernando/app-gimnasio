import { EjercicioItem } from '../../../application/ports/routine-template-repository.port';
import { EjercicioDto } from './ejercicio.dto';

/**
 * `EjercicioDto` deja `peso`/`notas` como opcionales (ausentes en el
 * body), mientras que `EjercicioItem` (puerto de dominio) los modela
 * como `T | null` explícito. Este mapper es el único punto de
 * traducción HTTP -> aplicación para ese detalle.
 */
export function toEjercicioItems(dtos: EjercicioDto[]): EjercicioItem[] {
  return dtos.map((dto) => ({
    exerciseId: dto.exerciseId,
    orden: dto.orden,
    series: dto.series,
    repeticiones: dto.repeticiones,
    peso: dto.peso ?? null,
    descanso: dto.descanso,
    notas: dto.notas ?? null,
  }));
}
