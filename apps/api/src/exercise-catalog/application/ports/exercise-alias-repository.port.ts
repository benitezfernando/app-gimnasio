export const EXERCISE_ALIAS_REPOSITORY = Symbol('EXERCISE_ALIAS_REPOSITORY');

export interface ExerciseAliasRepositoryPort {
  /** Crea o actualiza el alias de ese profesor para ese ejercicio (uno solo por par). */
  upsert(data: {
    profesorId: string;
    exerciseId: string;
    nombre: string;
    nombreNormalizado: string;
  }): Promise<void>;
  /** Idempotente: no falla si el alias no existe. */
  delete(profesorId: string, exerciseId: string): Promise<void>;
}
