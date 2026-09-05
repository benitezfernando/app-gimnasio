export class InsufficientRoleError extends Error {
  constructor(rolActual: string, rolesRequeridos: string[]) {
    super(
      `El rol '${rolActual}' no está autorizado. Se requiere uno de: ${rolesRequeridos.join(', ')}.`,
    );
    this.name = 'InsufficientRoleError';
  }
}
