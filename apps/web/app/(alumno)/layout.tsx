import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { ApiError } from '../../lib/api-client';
import { getCurrentUser, CurrentUser } from '../../lib/get-current-user';
import { AppShell } from '../../components/ui/app-shell';
import { ALUMNO_NAV_ITEMS } from '../../components/ui/bottom-nav';

/** Exige rol ALUMNO real — mismo criterio que (profesor)/layout.tsx. */
export default async function AlumnoLayout({ children }: { children: ReactNode }) {
  let user: CurrentUser;
  try {
    user = await getCurrentUser();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  if (user.role !== 'ALUMNO') {
    redirect('/login');
  }

  return (
    <AppShell items={ALUMNO_NAV_ITEMS} user={user}>
      {children}
    </AppShell>
  );
}
