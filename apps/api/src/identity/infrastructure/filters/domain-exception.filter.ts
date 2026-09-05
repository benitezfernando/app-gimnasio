import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { DuplicateUsernameError } from '../../application/errors/duplicate-username.error';
import { RoleHierarchyError } from '../../application/errors/role-hierarchy.error';
import { InvalidCredentialsError } from '../../application/errors/invalid-credentials.error';
import { InsufficientRoleError } from '../../application/errors/insufficient-role.error';
import { UserNotFoundError } from '../../application/errors/user-not-found.error';

type ErrorConstructor = new (...args: never[]) => Error;

const STATUS_POR_ERROR = new Map<ErrorConstructor, HttpStatus>([
  [DuplicateUsernameError, HttpStatus.CONFLICT],
  [RoleHierarchyError, HttpStatus.FORBIDDEN],
  [InsufficientRoleError, HttpStatus.FORBIDDEN],
  [InvalidCredentialsError, HttpStatus.UNAUTHORIZED],
  [UserNotFoundError, HttpStatus.NOT_FOUND],
]);

/**
 * Traduce errores de dominio de `identity` a HTTP status en el borde de la
 * app — los casos de uso y los controllers no conocen códigos HTTP. Nunca
 * deja pasar un stack trace crudo: si el tipo de error no está mapeado
 * acá, no lo captura (el exception filter default de Nest lo maneja).
 */
@Catch(
  DuplicateUsernameError,
  RoleHierarchyError,
  InsufficientRoleError,
  InvalidCredentialsError,
  UserNotFoundError,
)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: Error, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      STATUS_POR_ERROR.get(exception.constructor as ErrorConstructor) ??
      HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      statusCode: status,
      error: exception.name,
      message: exception.message,
    });
  }
}
