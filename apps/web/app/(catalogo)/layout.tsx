import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { ApiError } from '../../lib/api-client';
import { getCurrentUser, CurrentUser } from '../../lib/get-current-user';
import { AppShell } from '../../components/ui/app-shell';
import {
  ALUMNO_NAV_ITEMS,
  PROFESOR_NAV_ITEMS,
  ADMIN_NAV_ITEMS,
  type BottomNavItem,
} from '../../components/ui/bottom-nav';

const NAV_ITEMS_POR_ROL: Partial<Record<CurrentUser['role'], BottomNavItem[]>> = {
  ALUMNO: ALUMNO_NAV_ITEMS,
  PROFESOR: PROFESOR_NAV_ITEMS,
  ADMIN: ADMIN_NAV_ITEMS,
};

/**
 * Catálogo compartido por PROFESOR y ADMIN (route group propio, separado de
 * (profesor)/(admin), que exigen un único rol). Usa `user.role` para saber
 * qué variante de nav mostrar. El ALUMNO ya no tiene catálogo: se lo manda
 * a su rutina, donde ve el detalle de sus ejercicios.
 */
export default async function CatalogoLayout({ children }: { children: ReactNode }) {
  let user: CurrentUser;
  try {
    user = await getCurrentUser();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/');
    }
    throw error;
  }

  // El alumno no tiene catálogo (ve el detalle de sus ejercicios en la rutina).
  if (user.role === 'ALUMNO') {
    redirect('/alumno');
  }

  return (
    <AppShell items={NAV_ITEMS_POR_ROL[user.role] ?? ALUMNO_NAV_ITEMS} user={user}>
      {children}
    </AppShell>
  );
}
