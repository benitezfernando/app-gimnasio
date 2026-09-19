'use client';

import { useEffect, useState } from 'react';
import { browserApiFetch } from './browser-api-client';

interface MeResponse {
  role: 'ADMIN' | 'PROFESOR' | 'ALUMNO';
}

const HOME_POR_ROL: Record<MeResponse['role'], string> = {
  ADMIN: '/admin',
  PROFESOR: '/profesor',
  ALUMNO: '/alumno',
};

/**
 * Resuelve a qué pantalla "Home" tiene que llevar en pantallas
 * compartidas por los 3 roles (`/catalogo`, `/catalogo/[id]`) — a
 * diferencia de `/profesor/...`, acá no hay un layout que ya sepa el rol
 * de antemano, así que se pide una sola vez client-side.
 */
export function useRoleHome(): string | null {
  const [homeHref, setHomeHref] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    browserApiFetch<MeResponse>('/users/me')
      .then((me) => {
        if (!cancelado) setHomeHref(HOME_POR_ROL[me.role]);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);

  return homeHref;
}
