import { Role } from './role';

/** Shape de `req.user`, inyectado por `JwtAuthGuard` en cada request autenticado. */
export interface AuthenticatedUser {
  id: string;
  gymId: string;
  role: Role;
}
