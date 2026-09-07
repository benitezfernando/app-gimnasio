import { DomainError } from '../../../shared-kernel/domain-error';

/**
 * Gate del hard-delete (HLD, "Convención de hard-delete"): el borrado
 * físico exige que el usuario ya esté desactivado — nunca desde el
 * estado activo.
 */
export class UserNotInactiveError extends DomainError {
  readonly httpStatus = 409;

  constructor(userId: string) {
    super(`El usuario '${userId}' está activo — desactivalo antes de eliminarlo definitivamente.`);
    this.name = 'UserNotInactiveError';
  }
}
