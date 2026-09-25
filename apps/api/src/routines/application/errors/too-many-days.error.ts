import { DomainError } from '../../../shared-kernel/domain-error';
import { MAX_DIAS } from '../dias/limites';

export class TooManyDaysError extends DomainError {
  readonly httpStatus = 400;

  constructor(cantidad: number) {
    super(`Una rutina puede tener hasta ${MAX_DIAS} días (llegaron ${cantidad}).`);
    this.name = 'TooManyDaysError';
  }
}
