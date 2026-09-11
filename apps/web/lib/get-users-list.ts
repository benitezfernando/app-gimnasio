import { cache } from 'react';
import { apiFetch } from './api-client';

export interface UserRow {
  id: string;
  username: string;
  nombre: string;
  role: 'ADMIN' | 'PROFESOR' | 'ALUMNO';
  activo: boolean;
}

/**
 * `React.cache` memoiza por request: (admin)/layout.tsx la llama solo para
 * verificar que responda 200 (auth gate) y admin/page.tsx la llama de
 * nuevo para los datos reales — mismo endpoint, mismo render. Sin esto,
 * cada navegación a /admin pagaba el round-trip a GET /users dos veces.
 */
export const getUsersList = cache(async (): Promise<UserRow[]> => {
  return apiFetch<UserRow[]>('/users');
});
