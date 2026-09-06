import { DomainError } from '../../../shared-kernel/domain-error';
import { Role } from '../../domain/role';

export class InvalidCarteraRoleError extends DomainError {
  readonly httpStatus = 400;

  constructor(userId: string, rolEsperado: Role) {
    super(`El usuario '${userId}' no tiene el rol '${rolEsperado}' requerido para la cartera.`);
    this.name = 'InvalidCarteraRoleError';
  }
}
