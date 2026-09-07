import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api-client';

/**
 * Solo valida sesión — el catálogo es legible por ADMIN/PROFESOR/ALUMNO
 * por igual. Route group propio (separado de (profesor)/(alumno)/(admin),
 * que sí exigen rol) porque el alumno necesita esta pantalla para HU-09
 * y no puede vivir bajo un layout que excluya su rol.
 */
export default async function CatalogoLayout({ children }: { children: ReactNode }) {
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
