import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '../lib/api-client';

interface MeResponse {
  id: string;
  gymId: string;
  role: 'ADMIN' | 'PROFESOR' | 'ALUMNO';
}

const DESTINO_POR_ROLE: Record<MeResponse['role'], string> = {
  ADMIN: '/admin',
  PROFESOR: '/profesor',
  ALUMNO: '/alumno',
};

/**
 * Sin contenido propio — solo redirige. Mismo criterio server-side que
 * los layouts de cada rol (GET /users/me): sin sesión válida o error de
 * auth → /login; con sesión → la pantalla de su rol.
 */
export default async function HomePage() {
  try {
    const me = await apiFetch<MeResponse>('/users/me');
    redirect(DESTINO_POR_ROLE[me.role]);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }
}
