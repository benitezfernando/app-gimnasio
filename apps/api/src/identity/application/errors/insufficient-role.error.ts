import { DomainError } from '../../../shared-kernel/domain-error';

export class InsufficientRoleError extends DomainError {
  readonly httpStatus = 403;

  constructor(rolActual: string, rolesRequeridos: string[]) {
    super(
      `El rol '${rolActual}' no está autorizado. Se requiere uno de: ${rolesRequeridos.join(', ')}.`,
    );
    this.name = 'InsufficientRoleError';
  }
}
