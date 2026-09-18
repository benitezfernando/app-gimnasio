import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api-client';
import {
  BottomNav,
  ALUMNO_NAV_ITEMS,
  PROFESOR_NAV_ITEMS,
  ADMIN_NAV_ITEMS,
  type BottomNavItem,
} from '../../components/ui/bottom-nav';

interface MeResponse {
  id: string;
  gymId: string;
  role: 'ADMIN' | 'PROFESOR' | 'ALUMNO';
}

const NAV_ITEMS_POR_ROL: Record<MeResponse['role'], BottomNavItem[]> = {
  ALUMNO: ALUMNO_NAV_ITEMS,
  PROFESOR: PROFESOR_NAV_ITEMS,
  ADMIN: ADMIN_NAV_ITEMS,
};

/**
 * Solo valida sesión — el catálogo es legible por ADMIN/PROFESOR/ALUMNO
 * por igual. Route group propio (separado de (profesor)/(alumno)/(admin),
 * que sí exigen rol) porque el alumno necesita esta pantalla para HU-09
 * y no puede vivir bajo un layout que excluya su rol. Captura `me.role`
 * (antes se descartaba, la respuesta se usaba solo como chequeo de sesión)
 * para saber qué variante de BottomNav mostrar — es la única pantalla
 * compartida por los 3 roles.
 */
export default async function CatalogoLayout({ children }: { children: ReactNode }) {
  let me: MeResponse;
  try {
    me = await apiFetch<MeResponse>('/users/me');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  return (
    <>
      {children}
      <BottomNav items={NAV_ITEMS_POR_ROL[me.role] ?? ALUMNO_NAV_ITEMS} />
    </>
  );
}
