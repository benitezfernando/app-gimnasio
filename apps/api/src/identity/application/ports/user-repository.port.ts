import { Role } from '../../domain/role';

export interface UserRecord {
  id: string;
  authUserId: string;
  gymId: string;
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
  create(data: {
    gymId: string;
    authUserId: string;
    username: string;
    nombre: string;
    role: Role;
  }): Promise<UserRecord>;
}
