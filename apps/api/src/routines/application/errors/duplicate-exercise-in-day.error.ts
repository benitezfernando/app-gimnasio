import { DomainError } from '../../../shared-kernel/domain-error';

export class DuplicateExerciseInDayError extends DomainError {
  readonly httpStatus = 400;

  constructor(numero: number, exerciseId: string) {
    super(`El Día ${numero} tiene el ejercicio '${exerciseId}' repetido.`);
    this.name = 'DuplicateExerciseInDayError';
  }
}
