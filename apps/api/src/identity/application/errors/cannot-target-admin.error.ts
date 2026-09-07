import { DomainError } from '../../../shared-kernel/domain-error';

export class CannotTargetAdminError extends DomainError {
  readonly httpStatus = 400;

  constructor(userId: string) {
    super(`El usuario '${userId}' es ADMIN — no se puede desactivar ni eliminar por esta vía.`);
    this.name = 'CannotTargetAdminError';
  }
}
