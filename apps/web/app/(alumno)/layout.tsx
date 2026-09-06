import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api-client';

/**
 * Valida server-side que hay una sesión autenticada — mismo patrón que
 * (profesor)/layout.tsx (Bloque 2, Task 9): usa /users/me (no /users, que
 * es ADMIN-only) porque cualquier rol autenticado puede acceder a esta
 * sección. Faltaba este guard desde el scaffold de Fase 0 — quedaba
 * abierto sin sesión.
 */
export default async function AlumnoLayout({ children }: { children: ReactNode }) {
  try {
    await apiFetch('/users/me');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  return <>{children}</>;
}
