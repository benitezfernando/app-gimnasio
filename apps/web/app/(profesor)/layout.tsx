import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api-client';

interface MeResponse {
  id: string;
  gymId: string;
  role: 'ADMIN' | 'PROFESOR' | 'ALUMNO';
}

/**
 * Exige rol PROFESOR real — pendiente desde el Bloque 3A, que dejó este
 * layout validando solo sesión porque /catalogo vivía acá adentro y lo
 * necesitaban los tres roles. Con /catalogo movido a su propio route
 * group (Bloque 3B), esta sección puede exigir el rol de verdad.
 * `/users/me` nunca devuelve 403 por rol (no tiene `@Roles`) — el
 * chequeo de rol se hace acá, comparando el campo `role` de la respuesta.
 */
export default async function ProfesorLayout({ children }: { children: ReactNode }) {
  let me: MeResponse;
  try {
    me = await apiFetch<MeResponse>('/users/me');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  if (me.role !== 'PROFESOR') {
    redirect('/login');
  }

  return <>{children}</>;
}
