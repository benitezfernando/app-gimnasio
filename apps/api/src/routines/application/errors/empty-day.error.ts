import { DomainError } from '../../../shared-kernel/domain-error';

export class EmptyDayError extends DomainError {
  readonly httpStatus = 400;

  constructor(numero: number) {
    super(`El Día ${numero} no tiene ejercicios. Agregale al menos uno o quitá el día.`);
    this.name = 'EmptyDayError';
  }
}
