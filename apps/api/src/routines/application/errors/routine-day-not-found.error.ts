import { DomainError } from '../../../shared-kernel/domain-error';

export class RoutineDayNotFoundError extends DomainError {
  readonly httpStatus = 404;

  constructor(diaId: string) {
    super(`No existe un día con id '${diaId}' en esta rutina.`);
    this.name = 'RoutineDayNotFoundError';
  }
}
