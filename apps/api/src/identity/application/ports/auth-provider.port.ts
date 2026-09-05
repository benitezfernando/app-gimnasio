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
 * La aplicación nunca ve un email ni una password derivada — estos 4
 * métodos ya reciben/devuelven credenciales resueltas. El mapeo a email
 * sintético y la derivación de password del alumno son detalles 100%
 * confinados al adaptador (identity/infrastructure/auth/).
 */
export interface AuthProviderPort {
  createStaffUser(gymId: string, username: string, password: string): Promise<AuthUserRef>;
  createAlumnoUser(gymId: string, username: string): Promise<AuthUserRef>;
  signInStaff(gymId: string, username: string, password: string): Promise<AuthSession>;
  signInAlumno(gymId: string, username: string): Promise<AuthSession>;
  deleteAuthUser(authUserId: string): Promise<void>;
}
