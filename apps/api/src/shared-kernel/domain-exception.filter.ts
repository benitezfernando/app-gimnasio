import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from './domain-error';

/**
 * Traduce cualquier `DomainError` (de cualquier módulo) a HTTP status en
 * el borde de la app — los casos de uso y los controllers no conocen
 * códigos HTTP. Nunca deja pasar un stack trace crudo: si la excepción no
 * es un `DomainError`, no la captura (el exception filter default de
 * Nest la maneja).
 */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(exception.httpStatus).json({
      statusCode: exception.httpStatus,
      error: exception.name,
      message: exception.message,
    });
  }
}
