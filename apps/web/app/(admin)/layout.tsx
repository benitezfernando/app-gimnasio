import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { ApiError } from '../../lib/api-client';
import { getUsersList } from '../../lib/get-users-list';
import { LogoutButton } from '../../components/logout-button';

/**
 * Valida server-side que la sesión actual pertenece a un ADMIN — sin
 * reimplementar la verificación del JWT: llama a `GET /users` del backend,
 * gateado por `@Roles(ADMIN)` + `JwtAuthGuard`. Si responde 401/403,
 * redirige a `/login`. Usa `getUsersList()` (memoizada por request) en vez
 * de `apiFetch` directo — admin/page.tsx pide la misma lista para sus
 * datos, y sin la memoización se pagaba el round-trip dos veces por
 * navegación.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  try {
    await getUsersList();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  return (
    <>
      <div className="flex justify-end p-3">
        <LogoutButton />
      </div>
      {children}
    </>
  );
}
