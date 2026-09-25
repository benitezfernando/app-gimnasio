import { EjercicioItem } from './routine-template-repository.port';

export const ROUTINE_INSTANCE_REPOSITORY = Symbol('ROUTINE_INSTANCE_REPOSITORY');

export interface DiaInstancia {
  id: string;
  numero: number;
  vinculadoADiaId: string | null;
  ejercicios: EjercicioItem[];
}

export interface RoutineInstanceDetail {
  id: string;
  gymId: string;
  profesorId: string | null;
  alumnoId: string;
  nombre: string;
  vigenteDesde: Date;
  vigenteHasta: Date | null;
  activa: boolean;
  dias: DiaInstancia[];
}

/** `vinculadoADiaId` ya viene resuelto por la regla de vínculo del caso de uso. */
export interface DiaInstanciaAGuardar {
  id?: string;
  vinculadoADiaId: string | null;
  ejercicios: EjercicioItem[];
}

/**
 * Ninguno de estos métodos valida cartera — eso vive en los casos de uso,
 * vía `CarteraRepositoryPort.existe()`. El repo solo ejecuta la query.
 */
export interface RoutineInstanceRepositoryPort {
  findVigentePorAlumno(alumnoId: string): Promise<RoutineInstanceDetail | null>;
  findById(id: string): Promise<RoutineInstanceDetail | null>;
  /** Instancias activas con al menos un día vinculado a alguno de esos días de plantilla; trae TODOS sus días. */
  findActivasConDiasVinculadosA(diasPlantillaIds: string[]): Promise<RoutineInstanceDetail[]>;
  /** Archiva la vigente del alumno y crea la nueva con sus días, en una sola transacción. */
  crear(data: {
    gymId: string;
    profesorId: string;
    alumnoId: string;
    nombre: string;
    dias: DiaInstanciaAGuardar[];
  }): Promise<RoutineInstanceDetail>;
  update(id: string, data: { nombre?: string }): Promise<RoutineInstanceDetail>;
  /** Persiste los días por id en una transacción; días ausentes se borran. */
  guardarDias(instanceId: string, dias: DiaInstanciaAGuardar[]): Promise<void>;
}
