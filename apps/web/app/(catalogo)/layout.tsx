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
 * Solo valida sesión — el catálogo es legible por ADMIN/PROFESOR/ALUMNO
 * por igual. Route group propio (separado de (profesor)/(alumno)/(admin),
 * que sí exigen rol) porque el alumno necesita esta pantalla para HU-09
 * y no puede vivir bajo un layout que excluya su rol. Usa `user.role`
 * para saber qué variante de nav mostrar — es la única pantalla
 * compartida por los 3 roles.
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

  return (
    <AppShell items={NAV_ITEMS_POR_ROL[user.role] ?? ALUMNO_NAV_ITEMS} user={user}>
      {children}
    </AppShell>
  );
}
