/** Un ejercicio mientras se edita; `uid` es local (el mismo ejercicio puede estar en dos días). */
export interface EjercicioEnEdicion {
  uid: string;
  exerciseId: string;
  nombre: string;
  imageUrl: string | null;
  series: number;
  repeticiones: number;
  peso: number | null;
  notas: string | null;
}

export interface DiaEnEdicion {
  uid: string;
  /** Id persistido del día; ausente en días nuevos. */
  id?: string;
  /** Vínculo vigente según el servidor. */
  vinculadoADiaId: string | null;
  /** Texto del badge "Sincronizado · …" (solo días vinculados que vienen del servidor). */
  vinculoEtiqueta: string | null;
  /** Día de plantilla del que se importó en esta sesión de edición. */
  importadoDeDiaId: string | null;
  ejercicios: EjercicioEnEdicion[];
}

export interface DiaPlantillaParaImportar {
  id: string;
  numero: number;
  ejercicios: Array<Omit<EjercicioEnEdicion, 'uid'>>;
}

export interface PlantillaParaImportar {
  id: string;
  nombre: string;
  dias: DiaPlantillaParaImportar[];
}

export interface EjercicioApi {
  exerciseId: string;
  orden: number;
  series: number;
  repeticiones: number;
  peso: number | null;
  notas: string | null;
}

export interface TemplateDetailApi {
  id: string;
  nombre: string;
  activa: boolean;
  dias: Array<{ id: string; numero: number; ejercicios: EjercicioApi[] }>;
}

export interface EjercicioPayload {
  exerciseId: string;
  orden: number;
  series: number;
  repeticiones: number;
  peso?: number;
  notas?: string;
}

export function aPayloadDeEjercicios(ejercicios: EjercicioEnEdicion[]): EjercicioPayload[] {
  return ejercicios.map((e, indice) => ({
    exerciseId: e.exerciseId,
    orden: indice + 1,
    series: e.series,
    repeticiones: e.repeticiones,
    ...(e.peso !== null ? { peso: e.peso } : {}),
    ...(e.notas ? { notas: e.notas } : {}),
  }));
}
