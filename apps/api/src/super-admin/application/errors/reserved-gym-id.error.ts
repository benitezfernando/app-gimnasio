import { DomainError } from '../../../shared-kernel/domain-error';

export class ReservedGymIdError extends DomainError {
  readonly httpStatus = 400;

  constructor(gymId: string) {
    super(`El gymId '${gymId}' está reservado para el sistema — elegí otro.`);
    this.name = 'ReservedGymIdError';
  }
}
