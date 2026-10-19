import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { ApiError } from '../../lib/api-client';
import { getCurrentUser, CurrentUser } from '../../lib/get-current-user';
import { AppShell } from '../../components/ui/app-shell';
import { ADMIN_NAV_ITEMS } from '../../components/ui/bottom-nav';

/**
 * Exige rol ADMIN — mismo criterio que (profesor)/layout.tsx. Antes el gate
 * era `GET /users` seguido de `GET /users/me` (dos idas y vueltas en
 * serie); ahora alcanza con el usuario, y la página pide la lista en
 * paralelo con este layout. El backend igual exige ADMIN en cada endpoint.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  let user: CurrentUser;
  try {
    user = await getCurrentUser();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  if (user.role !== 'ADMIN') {
    redirect('/login');
  }

  return (
    <AppShell items={ADMIN_NAV_ITEMS} user={user}>
      {children}
    </AppShell>
  );
}
