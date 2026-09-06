import { DomainError } from '../../../shared-kernel/domain-error';

export class UserNotFoundError extends DomainError {
  readonly httpStatus = 404;

  constructor(userId: string) {
    super(`No existe un usuario con id '${userId}' en tu gym.`);
    this.name = 'UserNotFoundError';
  }
}
