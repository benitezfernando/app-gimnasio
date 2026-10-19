import type { RolUsuario } from './login-routes';

const HOME_POR_ROL: Record<RolUsuario, string> = {
  ADMIN: '/admin',
  PROFESOR: '/profesor',
  ALUMNO: '/alumno',
  SUPER_ADMIN: '/super-admin',
};

/** Pantalla de inicio de cada rol (destino de "Inicio" y del redirect de `/`). */
export function homeDeRol(role: RolUsuario): string {
  return HOME_POR_ROL[role];
}
