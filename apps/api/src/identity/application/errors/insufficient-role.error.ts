export class InsufficientRoleError extends Error {
  constructor(rolActual: string) {
    super(`El rol '${rolActual}' no puede invitar usuarios. Se requiere ADMIN o PROFESOR.`);
    this.name = 'InsufficientRoleError';
  }
}
