export const EXERCISE_REPOSITORY = Symbol('EXERCISE_REPOSITORY');

export interface ExerciseSummary {
  id: string;
  nombre: string;
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
 * devuelve el detalle completo o null si no existe.
 */
export interface ExerciseRepositoryPort {
  findMany(filter: ListExercisesFilter): Promise<ListExercisesResult>;
  findById(id: string): Promise<ExerciseDetail | null>;
}
