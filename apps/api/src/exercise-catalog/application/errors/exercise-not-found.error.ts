import { DomainError } from '../../../shared-kernel/domain-error';

export class ExerciseNotFoundError extends DomainError {
  readonly httpStatus = 404;

  constructor(id: string) {
    super(`No existe un ejercicio con id '${id}'.`);
    this.name = 'ExerciseNotFoundError';
  }
}
