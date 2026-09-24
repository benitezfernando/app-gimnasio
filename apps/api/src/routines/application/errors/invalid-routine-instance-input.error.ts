import { DomainError } from '../../../shared-kernel/domain-error';

export class InvalidRoutineInstanceInputError extends DomainError {
  readonly httpStatus = 400;

  constructor() {
    super(
      'Hay que enviar exactamente uno de los dos: una plantilla de origen (asignar desde plantilla) o ejercicios (armar desde cero).',
    );
    this.name = 'InvalidRoutineInstanceInputError';
  }
}
