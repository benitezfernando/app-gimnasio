import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { ApiError } from '../../lib/api-client';
import { getCurrentUser, CurrentUser } from '../../lib/get-current-user';
import { AppShell } from '../../components/ui/app-shell';
import { PROFESOR_NAV_ITEMS } from '../../components/ui/bottom-nav';

/**
 * Exige rol PROFESOR real — pendiente desde el Bloque 3A, que dejó este
 * layout validando solo sesión porque /catalogo vivía acá adentro y lo
 * necesitaban los tres roles. Con /catalogo movido a su propio route
 * group (Bloque 3B), esta sección puede exigir el rol de verdad.
 * `/users/me` nunca devuelve 403 por rol (no tiene `@Roles`) — el
 * chequeo de rol se hace acá, comparando el campo `role` de la respuesta.
 */
export default async function ProfesorLayout({ children }: { children: ReactNode }) {
  let user: CurrentUser;
  try {
    user = await getCurrentUser();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  if (user.role !== 'PROFESOR') {
    redirect('/login');
  }

  return (
    <AppShell items={PROFESOR_NAV_ITEMS} user={user}>
      {children}
    </AppShell>
  );
}
