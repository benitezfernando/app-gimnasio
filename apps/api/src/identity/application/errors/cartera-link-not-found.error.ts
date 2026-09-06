import { DomainError } from '../../../shared-kernel/domain-error';

export class CarteraLinkNotFoundError extends DomainError {
  readonly httpStatus = 404;

  constructor(profesorId: string, alumnoId: string) {
    super(`El profesor '${profesorId}' no está asignado al alumno '${alumnoId}'.`);
    this.name = 'CarteraLinkNotFoundError';
  }
}
