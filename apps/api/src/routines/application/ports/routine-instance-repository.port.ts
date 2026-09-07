import { EjercicioItem } from './routine-template-repository.port';

export const ROUTINE_INSTANCE_REPOSITORY = Symbol('ROUTINE_INSTANCE_REPOSITORY');

export interface RoutineInstanceDetail {
  id: string;
  gymId: string;
  profesorId: string | null;
  alumnoId: string;
  nombre: string;
  origenTemplateId: string | null;
  vigenteDesde: Date;
  vigenteHasta: Date | null;
  activa: boolean;
  ejercicios: EjercicioItem[];
}

/**
 * Ninguno de estos métodos valida cartera — eso vive en los casos de uso
 * (Tarea 8), vía `CarteraRepositoryPort.existe()` de Identity/3A. El repo
 * solo ejecuta la query.
 */
export interface RoutineInstanceRepositoryPort {
  findVigentePorAlumno(alumnoId: string): Promise<RoutineInstanceDetail | null>;
  findById(id: string): Promise<RoutineInstanceDetail | null>;
  /**
   * Transaccional: si el alumno ya tiene una instancia vigente, la archiva
   * (`activa: false`, `vigenteHasta: now`) y crea la nueva en la misma
   * `$transaction` — nunca deja al alumno con dos vigentes ni sin ninguna
   * a mitad de camino.
   */
  crear(data: {
    gymId: string;
    profesorId: string;
    alumnoId: string;
    nombre: string;
    origenTemplateId: string | null;
    ejercicios: EjercicioItem[];
  }): Promise<RoutineInstanceDetail>;
  update(id: string, data: { nombre?: string }): Promise<RoutineInstanceDetail>;
  /** Replace-all transaccional — igual criterio que `RoutineTemplateRepositoryPort`. */
  replaceExercises(instanceId: string, ejercicios: EjercicioItem[]): Promise<void>;
}
