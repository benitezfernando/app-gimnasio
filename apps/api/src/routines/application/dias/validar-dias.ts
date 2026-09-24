import { EjercicioItem } from '../ports/routine-template-repository.port';
import { MAX_DIAS, MAX_EJERCICIOS_TOTALES } from './limites';
import { TooManyDaysError } from '../errors/too-many-days.error';
import { TooManyExercisesError } from '../errors/too-many-exercises.error';
import { EmptyDayError } from '../errors/empty-day.error';
import { DuplicateExerciseInDayError } from '../errors/duplicate-exercise-in-day.error';

export function validarDias(
  dias: ReadonlyArray<{ ejercicios: ReadonlyArray<EjercicioItem> }>,
): void {
  if (dias.length > MAX_DIAS) {
    throw new TooManyDaysError(dias.length);
  }

  const total = dias.reduce((suma, dia) => suma + dia.ejercicios.length, 0);
  if (total > MAX_EJERCICIOS_TOTALES) {
    throw new TooManyExercisesError(total);
  }

  dias.forEach((dia, indice) => {
    const numero = indice + 1;
    if (dia.ejercicios.length === 0) {
      throw new EmptyDayError(numero);
    }
    const vistos = new Set<string>();
    for (const ejercicio of dia.ejercicios) {
      if (vistos.has(ejercicio.exerciseId)) {
        throw new DuplicateExerciseInDayError(numero, ejercicio.exerciseId);
      }
      vistos.add(ejercicio.exerciseId);
    }
  });
}
