import { Prisma } from '@prisma/client';
import { EjercicioItem } from '../../application/ports/routine-template-repository.port';

/** Número de desplazamiento para la primera pasada de renumeración: fuera del rango 1..7. */
export const DESPLAZAMIENTO_TEMPORAL = 100;

/** Ver timeout: guardar 7 días + propagar a varios alumnos contra Supabase supera los 5s por defecto de Prisma. */
export const OPCIONES_TRANSACCION = { timeout: 30_000, maxWait: 10_000 };

export function aFilaEjercicio(dayId: string, e: EjercicioItem) {
  return {
    dayId,
    exerciseId: e.exerciseId,
    orden: e.orden,
    series: e.series,
    repeticiones: e.repeticiones,
    peso: e.peso === null ? null : new Prisma.Decimal(e.peso),
    notas: e.notas,
  };
}

export function aEjercicioItem(fila: {
  exerciseId: string;
  orden: number;
  series: number;
  repeticiones: number;
  peso: Prisma.Decimal | null;
  notas: string | null;
}): EjercicioItem {
  return {
    exerciseId: fila.exerciseId,
    orden: fila.orden,
    series: fila.series,
    repeticiones: fila.repeticiones,
    peso: fila.peso === null ? null : fila.peso.toNumber(),
    notas: fila.notas,
  };
}
