import { DomainError } from '../../../shared-kernel/domain-error';

export class InvalidRoutineInstanceInputError extends DomainError {
  readonly httpStatus = 400;

  constructor() {
    super('Una rutina nueva necesita al menos un día con ejercicios y un nombre.');
    this.name = 'InvalidRoutineInstanceInputError';
  }
}
