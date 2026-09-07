export const ROUTINE_TEMPLATE_REPOSITORY = Symbol('ROUTINE_TEMPLATE_REPOSITORY');

/**
 * Forma compartida de una línea de ejercicio — la usan tanto
 * `RoutineTemplateRepositoryPort` como `RoutineInstanceRepositoryPort`
 * (Tarea 7), porque el clonado plantilla→instancia copia esta forma 1:1.
 */
export interface EjercicioItem {
  exerciseId: string;
  orden: number;
  series: number;
  repeticiones: number;
  peso: number | null;
  descanso: number;
  notas: string | null;
}

export interface RoutineTemplateSummary {
  id: string;
  gymId: string;
  profesorId: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
}

export interface RoutineTemplateDetail extends RoutineTemplateSummary {
  ejercicios: EjercicioItem[];
}

/**
 * Propiedad exclusiva del profesor que la creó — este puerto NUNCA valida
 * cartera (HLD §3 Routines). El chequeo de "es mía" (`profesorId ===
 * invocadoPor.id`) vive en los casos de uso, no acá.
 */
export interface RoutineTemplateRepositoryPort {
  findByProfesor(profesorId: string): Promise<RoutineTemplateSummary[]>;
  findById(id: string): Promise<RoutineTemplateDetail | null>;
  create(data: {
    gymId: string;
    profesorId: string;
    nombre: string;
    descripcion: string | null;
  }): Promise<RoutineTemplateSummary>;
  update(
    id: string,
    data: { nombre?: string; descripcion?: string | null; activa?: boolean },
  ): Promise<RoutineTemplateSummary>;
  delete(id: string): Promise<void>;
  /** Replace-all transaccional — borra todas las líneas existentes y reinserta. */
  replaceExercises(templateId: string, ejercicios: EjercicioItem[]): Promise<void>;
}
