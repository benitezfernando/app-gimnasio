import { DomainError } from '../../../shared-kernel/domain-error';

export class InvalidExerciseIdError extends DomainError {
  readonly httpStatus = 400;

  constructor(exerciseIds: string[]) {
    super(`Los siguientes exerciseId no existen en el catálogo: ${exerciseIds.join(', ')}.`);
    this.name = 'InvalidExerciseIdError';
  }
}
