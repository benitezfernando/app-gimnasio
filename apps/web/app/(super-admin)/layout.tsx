import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { ApiError } from '../../lib/api-client';
import { getCurrentUser, CurrentUser } from '../../lib/get-current-user';
import { AppShell } from '../../components/ui/app-shell';

/**
 * Gate de rol SUPER_ADMIN. Mismo patrón que `(admin)/layout.tsx`, pero
 * usando `getCurrentUser()` (no hay lista propia del super admin que
 * memoizar) y redirigiendo a `/super-admin/login` en vez de `/login`.
 * `items={[]}`: no hay NAV_ITEMS propio (una sola página), el sidebar
 * muestra solo el bloque de usuario + logout.
 */
export default async function SuperAdminLayout({ children }: { children: ReactNode }) {
  let user: CurrentUser;
  try {
    user = await getCurrentUser();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/super-admin/login');
    }
    throw error;
  }

  if (user.role !== 'SUPER_ADMIN') {
    redirect('/super-admin/login');
  }

  return (
    <AppShell items={[]} user={user} logoutRedirectTo="/super-admin/login">
      {children}
    </AppShell>
  );
}
