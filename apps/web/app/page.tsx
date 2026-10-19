import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '../lib/api-client';
import { LOGIN_ALUMNO, RolUsuario } from '../lib/login-routes';
import { homeDeRol } from '../lib/role-home';

/**
 * Sin contenido propio — solo redirige. Mismo criterio server-side que
 * los layouts de cada rol (GET /users/me): sin sesión válida o error de
 * auth → login de alumno (la mayoría de quienes abren la app; linkea al
 * de staff); con sesión → la pantalla de su rol.
 */
export default async function HomePage() {
  try {
    const me = await apiFetch<{ role: RolUsuario }>('/users/me');
    redirect(homeDeRol(me.role));
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect(LOGIN_ALUMNO);
    }
    throw error;
  }
}
