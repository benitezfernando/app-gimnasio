import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api-client';

interface MeResponse {
  id: string;
  gymId: string;
  role: 'ADMIN' | 'PROFESOR' | 'ALUMNO';
}

/** Exige rol ALUMNO real — mismo criterio que (profesor)/layout.tsx. */
export default async function AlumnoLayout({ children }: { children: ReactNode }) {
  let me: MeResponse;
  try {
    me = await apiFetch<MeResponse>('/users/me');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  if (me.role !== 'ALUMNO') {
    redirect('/login');
  }

  return <>{children}</>;
}
