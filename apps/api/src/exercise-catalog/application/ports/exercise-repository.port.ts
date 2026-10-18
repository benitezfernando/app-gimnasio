export const EXERCISE_REPOSITORY = Symbol('EXERCISE_REPOSITORY');

export interface ExerciseSummary {
  id: string;
  /** Nombre a mostrar: el alias del profesor si se pidió con `aliasDeProfesorId` y tiene uno; si no, el del catálogo. */
  nombre: string;
  /** Nombre del catálogo cuando `nombre` es un alias; `null` (o ausente en fixtures) si no hay alias. */
  nombreCatalogo?: string | null;
  nombreOriginal: string | null;
  imageUrl: string | null;
  gifUrl: string | null;
  parteCuerpo: string;
  grupoMuscular: string;
  equipamiento: string | null;
}

export interface ExerciseDetail extends ExerciseSummary {
  gruposMuscularesSecundarios: string[];
  instrucciones: string | null;
  pasos: string[];
  atribucionMedia: string | null;
}

export interface ListExercisesFilter {
  search?: string;
  parteCuerpo?: string;
  equipamiento?: string;
  /** Si viene, `nombre` se resuelve con el alias de ese profesor y `search` también matchea sus alias. */
  aliasDeProfesorId?: string;
  page: number;
  limit: number;
}

export interface ListExercisesResult {
  items: ExerciseSummary[];
  total: number;
}

/**
 * Catálogo global de solo lectura en el MVP (sin scoping por gymId — ver
 * Global Constraints del plan). `findMany` filtra/pagina; `findById`
 * devuelve el detalle completo o null si no existe. En los tres métodos,
 * `aliasDeProfesorId` (opcional) resuelve `nombre` con el alias de ese
 * profesor; sin él, siempre el nombre del catálogo.
 */
export interface ExerciseRepositoryPort {
  findMany(filter: ListExercisesFilter): Promise<ListExercisesResult>;
  findById(id: string, aliasDeProfesorId?: string): Promise<ExerciseDetail | null>;
  /**
   * Resuelve varios ejercicios en un solo query — lo usa Routines para
   * enriquecer una rutina completa (nombre/imageUrl/gifUrl por ejercicio)
   * sin hacer un query por cada línea de la rutina.
   */
  findByIds(ids: string[], aliasDeProfesorId?: string): Promise<ExerciseSummary[]>;
}
