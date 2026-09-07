import { DomainError } from '../../../shared-kernel/domain-error';

export class RoutineInstanceNotFoundError extends DomainError {
  readonly httpStatus = 404;

  constructor(instanceId: string) {
    super(`No existe una instancia de rutina con id '${instanceId}' accesible para vos.`);
    this.name = 'RoutineInstanceNotFoundError';
  }
}
