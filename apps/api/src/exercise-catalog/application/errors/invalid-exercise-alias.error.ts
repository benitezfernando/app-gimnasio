import { DomainError } from '../../../shared-kernel/domain-error';

export class InvalidExerciseAliasError extends DomainError {
  readonly httpStatus = 400;

  constructor(maxLength: number) {
    super(`El nombre del ejercicio no puede estar vacío ni superar los ${maxLength} caracteres.`);
    this.name = 'InvalidExerciseAliasError';
  }
}
