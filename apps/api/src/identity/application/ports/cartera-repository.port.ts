import { UserRecord } from './user-repository.port';

export const CARTERA_REPOSITORY = Symbol('CARTERA_REPOSITORY');

export interface CarteraLink {
  id: string;
  gymId: string;
  profesorId: string;
  alumnoId: string;
  asignadoEn: Date;
}

/**
 * Cartera profesor↔alumno (PRD §6 regla 9). `existe()` es la única
 * superficie que el bounded context Routines (Bloque 3B) necesita para
 * autorizar: nunca alcanza con compartir gymId, siempre hay que validar
 * contra esta relación.
 */
export interface CarteraRepositoryPort {
  existe(profesorId: string, alumnoId: string): Promise<boolean>;
  crear(data: { gymId: string; profesorId: string; alumnoId: string }): Promise<CarteraLink>;
  eliminar(profesorId: string, alumnoId: string): Promise<void>;
  findAlumnosDeProfesor(profesorId: string): Promise<UserRecord[]>;
  findProfesoresDeAlumno(alumnoId: string): Promise<UserRecord[]>;
}
