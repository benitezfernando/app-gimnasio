import { DomainError } from '../../../shared-kernel/domain-error';

export class RoleHierarchyError extends DomainError {
  readonly httpStatus = 403;

  constructor(rolInvocador: string, rolSolicitado: string) {
    super(`El rol '${rolInvocador}' no puede crear usuarios con rol '${rolSolicitado}'.`);
    this.name = 'RoleHierarchyError';
  }
}
