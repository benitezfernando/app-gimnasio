export type RolUsuario = 'ADMIN' | 'PROFESOR' | 'ALUMNO' | 'SUPER_ADMIN';

export const LOGIN_ALUMNO = '/alumno/login';

const LOGIN_POR_ROL: Record<RolUsuario, string> = {
  ALUMNO: LOGIN_ALUMNO,
  PROFESOR: '/login',
  ADMIN: '/login',
  SUPER_ADMIN: '/super-admin/login',
};

export function loginDeRol(role: RolUsuario): string {
  return LOGIN_POR_ROL[role];
}

function empiezaCon(pathname: string, prefijo: string): boolean {
  return pathname === prefijo || pathname.startsWith(`${prefijo}/`);
}

/**
 * Destino ante una sesión vencida detectada en el navegador, que no sabe
 * el rol: se infiere por la sección. Las pantallas compartidas
 * (`/catalogo`) caen en el login de alumno, que linkea al de staff.
 */
export function loginPorSesionVencida(pathname: string): string {
  if (empiezaCon(pathname, '/super-admin')) return '/super-admin/login';
  if (empiezaCon(pathname, '/profesor') || empiezaCon(pathname, '/admin')) {
    return '/login?sessionExpired=1';
  }
  return `${LOGIN_ALUMNO}?sessionExpired=1`;
}
