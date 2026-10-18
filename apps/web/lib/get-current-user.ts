import { cache } from 'react';
import { apiFetch } from './api-client';

export type Role = 'ADMIN' | 'PROFESOR' | 'ALUMNO' | 'SUPER_ADMIN';

export interface CurrentUser {
  id: string;
  gymId: string | null;
  role: Role;
  nombre: string;
  username: string;
}

/**
 * `React.cache`, mismo patrón que `getUsersList` (`./get-users-list.ts`):
 * memoiza por request para que el layout (gate de rol) y `AppShell`
 * (bloque de usuario) puedan llamarla sin pagar el round-trip dos veces.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  return apiFetch<CurrentUser>('/users/me');
});
