import { EjercicioItem } from './ports/routine-template-repository.port';

/**
 * Fusiona una plantilla editada con la copia actual de una instancia
 * vinculada a ella (ver diseño §B). `series`/`repeticiones`/`peso` SIEMPRE
 * vienen de la instancia si el alumno ya tenía ese ejercicio — son
 * siempre específicos del alumno, la plantilla nunca los pisa. `orden` y
 * `notas` siguen a la plantilla. Un exerciseId nuevo en la plantilla
 * arranca con los valores de la plantilla (no hay "propios" que
 * preservar). Un exerciseId que la plantilla sacó no aparece en el
 * resultado — la membresía de ejercicios de una instancia vinculada
 * siempre sigue a la plantilla.
 */
export function mergeEjerciciosVinculados(
  ejerciciosPlantilla: EjercicioItem[],
  ejerciciosInstanciaActual: EjercicioItem[],
): EjercicioItem[] {
  const actualesPorExerciseId = new Map(ejerciciosInstanciaActual.map((e) => [e.exerciseId, e]));

  return ejerciciosPlantilla.map((deTemplate) => {
    const actual = actualesPorExerciseId.get(deTemplate.exerciseId);
    if (!actual) {
      return { ...deTemplate };
    }
    return {
      exerciseId: deTemplate.exerciseId,
      orden: deTemplate.orden,
      notas: deTemplate.notas,
      series: actual.series,
      repeticiones: actual.repeticiones,
      peso: actual.peso,
    };
  });
}
