import { Role } from './role';

/**
 * Shape de `req.user`, inyectado por `JwtAuthGuard` en cada request
 * autenticado. `gymId` es `null` únicamente para `SUPER_ADMIN` — todo
 * caso de uso gym-scoped usa `requireGymId()` (`application/require-gym-id.ts`)
 * para angostar el tipo, en vez de asumir que siempre hay un gymId.
 */
export interface AuthenticatedUser {
  id: string;
  gymId: string | null;
  role: Role;
}
