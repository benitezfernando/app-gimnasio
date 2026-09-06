import { DomainError } from '../../../shared-kernel/domain-error';

export class InvalidCredentialsError extends DomainError {
  readonly httpStatus = 401;

  constructor() {
    super('Usuario o contraseña incorrectos.');
    this.name = 'InvalidCredentialsError';
  }
}
