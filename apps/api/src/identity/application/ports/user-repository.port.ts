import { Role } from '../../domain/role';

export interface UserRecord {
  id: string;
  authUserId: string;
  gymId: string | null;
  username: string;
  nombre: string;
  role: Role;
  activo: boolean;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepositoryPort {
  findByAuthUserId(authUserId: string): Promise<UserRecord | null>;
  findByGymIdAndUsername(gymId: string, username: string): Promise<UserRecord | null>;
  findByGymId(gymId: string, role?: Role): Promise<UserRecord[]>;
  findById(id: string): Promise<UserRecord | null>;
  deactivate(id: string): Promise<UserRecord>;
  create(
    data: {
      gymId: string | null;
      authUserId: string;
      username: string;
      nombre: string;
      role: Role;
    },
    /**
     * Si viene seteado, crea también la fila de cartera `ProfesorAlumno`
     * en la misma transacción — el alta de un alumno por un PROFESOR
     * (HU-02) queda automáticamente en su cartera. Solo tiene sentido
     * cuando `data.role === Role.ALUMNO`; `CreateUserUseCase` es quien
     * decide cuándo pasarlo.
     */
    vinculoCartera?: { profesorId: string },
  ): Promise<UserRecord>;
  /** Actualiza solo `nombre` — usado por EditUserUseCase (Task 4) y EditAdminUseCase (Task 7). */
  updateNombre(id: string, nombre: string): Promise<UserRecord>;
}
