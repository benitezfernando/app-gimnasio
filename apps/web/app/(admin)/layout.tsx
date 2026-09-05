import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api-client';

/**
 * Valida server-side que la sesión actual pertenece a un ADMIN — sin
 * reimplementar la verificación del JWT: llama a `GET /users` del backend,
 * gateado por `@Roles(ADMIN)` + `JwtAuthGuard`. Si responde 401/403,
 * redirige a `/login`.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  try {
    await apiFetch('/users');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  return <>{children}</>;
}
