import { DomainError } from '../../../shared-kernel/domain-error';

const MAX_EJERCICIOS = 50;

export class TooManyExercisesError extends DomainError {
  readonly httpStatus = 400;

  constructor(cantidad: number) {
    super(`No se pueden cargar ${cantidad} ejercicios — el máximo es ${MAX_EJERCICIOS}.`);
    this.name = 'TooManyExercisesError';
  }
}
