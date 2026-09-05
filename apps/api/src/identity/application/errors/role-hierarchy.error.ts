export class RoleHierarchyError extends Error {
  constructor(rolInvocador: string, rolSolicitado: string) {
    super(`El rol '${rolInvocador}' no puede crear usuarios con rol '${rolSolicitado}'.`);
    this.name = 'RoleHierarchyError';
  }
}
