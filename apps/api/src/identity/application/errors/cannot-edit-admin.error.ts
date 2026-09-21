import { DomainError } from '../../../shared-kernel/domain-error';

export class CannotEditAdminError extends DomainError {
  readonly httpStatus = 400;

  constructor(userId: string) {
    super(
      `El usuario '${userId}' es ADMIN o SUPER_ADMIN — no se puede editar por esta vía. Usá el panel de super-admin.`,
    );
    this.name = 'CannotEditAdminError';
  }
}
