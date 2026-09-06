export const AUTH_PROVIDER = Symbol('AUTH_PROVIDER');

export interface AuthUserRef {
  authUserId: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  authUserId: string;
}

/**
 * La aplicación nunca ve un email ni una password derivada — estos 6
 * métodos ya reciben/devuelven credenciales resueltas. El mapeo a email
 * sintético y la derivación de password del alumno son detalles 100%
 * confinados al adaptador (identity/infrastructure/auth/).
 */
export interface AuthProviderPort {
  createStaffUser(gymId: string, username: string, password: string): Promise<AuthUserRef>;
  createAlumnoUser(gymId: string, username: string): Promise<AuthUserRef>;
  signInStaff(gymId: string, username: string, password: string): Promise<AuthSession>;
  signInAlumno(gymId: string, username: string): Promise<AuthSession>;
  /**
   * Refresca una sesión a partir de un refresh_token. Supabase rota el
   * refresh_token en cada uso exitoso (el viejo queda invalidado) — el
   * adaptador es responsable de deduplicar llamadas concurrentes con el
   * MISMO refresh_token para que la segunda no llegue tarde con un token
   * ya consumido por la primera.
   */
  refreshSession(refreshToken: string): Promise<AuthSession>;
  deleteAuthUser(authUserId: string): Promise<void>;
}
