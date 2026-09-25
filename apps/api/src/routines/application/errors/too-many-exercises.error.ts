import { DomainError } from '../../../shared-kernel/domain-error';
import { MAX_EJERCICIOS_TOTALES } from '../dias/limites';

export class TooManyExercisesError extends DomainError {
  readonly httpStatus = 400;

  constructor(cantidad: number) {
    super(
      `No se pueden cargar ${cantidad} ejercicios en total — el máximo es ${MAX_EJERCICIOS_TOTALES}.`,
    );
    this.name = 'TooManyExercisesError';
  }
}
