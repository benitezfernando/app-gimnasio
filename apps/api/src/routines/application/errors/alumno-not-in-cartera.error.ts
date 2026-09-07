import { DomainError } from '../../../shared-kernel/domain-error';

/**
 * El alumno existe y es del mismo gym (si no, sería
 * `UserNotFoundError`, 404) pero no está en la cartera del profesor
 * invocador — HLD §4, la excepción explícita a la convención 404: acá NO
 * hay filtración porque el profesor ya sabe que el alumno existe
 * (comparten gym).
 */
export class AlumnoNotInCarteraError extends DomainError {
  readonly httpStatus = 403;

  constructor(alumnoId: string) {
    super(`El alumno '${alumnoId}' no está en tu cartera.`);
    this.name = 'AlumnoNotInCarteraError';
  }
}
