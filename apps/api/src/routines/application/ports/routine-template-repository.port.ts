export const ROUTINE_TEMPLATE_REPOSITORY = Symbol('ROUTINE_TEMPLATE_REPOSITORY');

/** Una línea de ejercicio; misma forma en plantillas e instancias. `orden` es relativo al día. */
export interface EjercicioItem {
  exerciseId: string;
  orden: number;
  series: number;
  repeticiones: number;
  peso: number | null;
  notas: string | null;
}

export interface DiaPlantilla {
  id: string;
  numero: number;
  ejercicios: EjercicioItem[];
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
  dias: DiaPlantilla[];
}

/** Día de plantilla con lo necesario para decidir un vínculo y mostrarlo. */
export interface DiaPlantillaReferencia {
  id: string;
  numero: number;
  templateId: string;
  templateNombre: string;
  profesorId: string;
  gymId: string;
  exerciseIds: string[];
}

/** `id` presente = día existente (se conserva su id); ausente = día nuevo. La posición en el array define `numero`. */
export interface DiaPlantillaAGuardar {
  id?: string;
  ejercicios: EjercicioItem[];
}

export interface ActualizacionDiaVinculado {
  diaInstanciaId: string;
  ejercicios: EjercicioItem[];
}

/**
 * Propiedad exclusiva del profesor que la creó — este puerto NUNCA valida
 * cartera (HLD §3 Routines). El chequeo de "es mía" vive en los casos de uso.
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
  findDiasByIds(ids: string[]): Promise<DiaPlantillaReferencia[]>;
  /**
   * Una sola transacción: persiste los días de la plantilla por id (días
   * ausentes se borran y sus vínculos pasan a null por SetNull), y aplica
   * `propagacion` sobre los días de instancia vinculados. Escribe en
   * tablas de instancia a propósito: plantilla + propagación tienen que ser
   * atómicas y no se arma un Unit of Work genérico para un solo caso de uso
   * (mismo criterio que la transacción de alta con cartera, HLD §Identity).
   */
  guardarDias(
    templateId: string,
    dias: DiaPlantillaAGuardar[],
    propagacion: ActualizacionDiaVinculado[],
  ): Promise<void>;
}
