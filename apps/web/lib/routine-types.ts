/**
 * Forma de un ejercicio mientras se edita una plantilla/instancia en el
 * cliente — combina los campos que manda el backend (`exerciseId`,
 * `orden`, `series`, `repeticiones`, `peso`, `descanso`, `notas`) con los
 * de solo display resueltos del catálogo (`nombre`, `imageUrl`) para no
 * tener que volver a pedirlos al guardar.
 */
export interface EjercicioEnEdicion {
  exerciseId: string;
  nombre: string;
  imageUrl: string | null;
  orden: number;
  series: number;
  repeticiones: number;
  peso: number | null;
  descanso: number;
  notas: string | null;
}

export function aPayloadDeEjercicios(ejercicios: EjercicioEnEdicion[]): Array<{
  exerciseId: string;
  orden: number;
  series: number;
  repeticiones: number;
  peso?: number;
  descanso: number;
  notas?: string;
}> {
  return ejercicios.map((e, indice) => ({
    exerciseId: e.exerciseId,
    orden: indice + 1,
    series: e.series,
    repeticiones: e.repeticiones,
    ...(e.peso !== null ? { peso: e.peso } : {}),
    descanso: e.descanso,
    ...(e.notas ? { notas: e.notas } : {}),
  }));
}
