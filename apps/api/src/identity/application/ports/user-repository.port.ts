import { Role } from '../../domain/role';

export interface UserRecord {
  id: string;
  authUserId: string;
  gymId: string;
  email: string;
  nombre: string;
  role: Role;
  activo: boolean;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepositoryPort {
  findByAuthUserId(authUserId: string): Promise<UserRecord | null>;
  findByGymIdAndEmail(gymId: string, email: string): Promise<UserRecord | null>;
  create(data: {
    gymId: string;
    authUserId: string;
    email: string;
    nombre: string;
    role: Role;
  }): Promise<UserRecord>;
}
