import { DomainError } from '../../../shared-kernel/domain-error';

export class CarteraLinkAlreadyExistsError extends DomainError {
  readonly httpStatus = 409;

  constructor(profesorId: string, alumnoId: string) {
    super(`El profesor '${profesorId}' ya está asignado al alumno '${alumnoId}'.`);
    this.name = 'CarteraLinkAlreadyExistsError';
  }
}
