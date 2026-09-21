import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api-client';

interface MeResponse {
  id: string;
  gymId: string | null;
  role: 'ADMIN' | 'PROFESOR' | 'ALUMNO' | 'SUPER_ADMIN';
}

/**
 * Gate de rol SUPER_ADMIN. Mismo patrón que `(admin)/layout.tsx`, pero
 * usando `GET /users/me` (no hay lista propia del super admin que
 * memoizar) y redirigiendo a `/super-admin/login` en vez de `/login`.
 */
export default async function SuperAdminLayout({ children }: { children: ReactNode }) {
  let me: MeResponse;
  try {
    me = await apiFetch<MeResponse>('/users/me');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/super-admin/login');
    }
    throw error;
  }

  if (me.role !== 'SUPER_ADMIN') {
    redirect('/super-admin/login');
  }

  return <>{children}</>;
}
