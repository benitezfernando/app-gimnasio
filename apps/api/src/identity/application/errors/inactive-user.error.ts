import { DomainError } from '../../../shared-kernel/domain-error';

/**
 * Solo la tira `AssignProfesorToAlumnoUseCase` — nunca
 * `RemoveProfesorFromAlumnoUseCase`. Quitar de la cartera es limpieza
 * administrativa del ADMIN sobre sus propios datos, no "operar en nombre
 * de" el usuario inactivo; bloquearlo dejaría filas de cartera
 * imborrables cada vez que se desactiva a alguien (ver spec Bloque 3A §4.2).
 */
export class InactiveUserError extends DomainError {
  readonly httpStatus = 409;

  constructor(userId: string) {
    super(`El usuario '${userId}' está desactivado.`);
    this.name = 'InactiveUserError';
  }
}
