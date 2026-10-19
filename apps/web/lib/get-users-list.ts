import { cache } from 'react';
import { apiFetch } from './api-client';

export interface UserRow {
  id: string;
  username: string;
  nombre: string;
  role: 'ADMIN' | 'PROFESOR' | 'ALUMNO';
  activo: boolean;
}

/** `React.cache` memoiza por request por si más de un componente del render la pide. */
export const getUsersList = cache(async (): Promise<UserRow[]> => {
  return apiFetch<UserRow[]>('/users');
});
