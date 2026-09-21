import { DomainError } from '../../../shared-kernel/domain-error';

export class AlumnoHasNoPasswordError extends DomainError {
  readonly httpStatus = 400;

  constructor(userId: string) {
    super(`El usuario '${userId}' es ALUMNO — los alumnos no tienen contraseña.`);
    this.name = 'AlumnoHasNoPasswordError';
  }
}
