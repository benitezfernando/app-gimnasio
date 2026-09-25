import { EjercicioItem } from '../ports/routine-template-repository.port';

export interface EntradaMergeDia {
  ejerciciosDiaPlantilla: EjercicioItem[];
  ejerciciosDiaInstancia: EjercicioItem[];
  /** Ejercicios de los OTROS días de la misma instancia vinculados a la misma plantilla. */
  ejerciciosOtrosDiasVinculados: EjercicioItem[][];
}

/**
 * Membresía, `orden` y `notas` siguen al día de plantilla. `series`/
 * `repeticiones`/`peso` son del alumno: se buscan primero en el mismo
 * día, después en otro día vinculado a la misma plantilla si el
 * ejercicio aparece ahí exactamente una vez (la plantilla lo cambió de
 * día), y si no, se toman de la plantilla.
 */
export function mergeDiaVinculado(entrada: EntradaMergeDia): EjercicioItem[] {
  const delMismoDia = new Map(entrada.ejerciciosDiaInstancia.map((e) => [e.exerciseId, e]));

  const apariciones = new Map<string, EjercicioItem[]>();
  for (const dia of entrada.ejerciciosOtrosDiasVinculados) {
    for (const ejercicio of dia) {
      apariciones.set(ejercicio.exerciseId, [
        ...(apariciones.get(ejercicio.exerciseId) ?? []),
        ejercicio,
      ]);
    }
  }

  return entrada.ejerciciosDiaPlantilla.map((dePlantilla) => {
    const otros = apariciones.get(dePlantilla.exerciseId);
    const propio =
      delMismoDia.get(dePlantilla.exerciseId) ?? (otros?.length === 1 ? otros[0] : undefined);
    if (!propio) {
      return { ...dePlantilla };
    }
    return {
      ...dePlantilla,
      series: propio.series,
      repeticiones: propio.repeticiones,
      peso: propio.peso,
    };
  });
}
