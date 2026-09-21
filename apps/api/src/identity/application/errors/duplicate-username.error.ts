import { DomainError } from '../../../shared-kernel/domain-error';

export class DuplicateUsernameError extends DomainError {
  readonly httpStatus = 409;

  constructor(username: string, gymId: string | null) {
    super(`Ya existe un usuario con username '${username}' en el gym '${gymId}'.`);
    this.name = 'DuplicateUsernameError';
  }
}
