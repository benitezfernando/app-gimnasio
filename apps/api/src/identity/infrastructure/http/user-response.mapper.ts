import { UserRecord } from '../../application/ports/user-repository.port';

export interface UserResponse {
  id: string;
  gymId: string;
  username: string;
  nombre: string;
  role: UserRecord['role'];
  activo: boolean;
}

export function toUserResponse(user: UserRecord): UserResponse {
  return {
    id: user.id,
    gymId: user.gymId,
    username: user.username,
    nombre: user.nombre,
    role: user.role,
    activo: user.activo,
  };
}
