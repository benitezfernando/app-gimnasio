import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api-client';

/**
 * Valida server-side que hay una sesión autenticada — el catálogo es
 * legible por ADMIN/PROFESOR/ALUMNO por igual (a diferencia de
 * (admin)/layout.tsx, que usa GET /users porque esa sección SÍ es
 * ADMIN-only). Por eso acá se usa /users/me, que no exige ningún rol
 * específico — usar /users rompería el acceso de PROFESOR/ALUMNO a esta
 * sección con un 403.
 */
export default async function ProfesorLayout({ children }: { children: ReactNode }) {
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
