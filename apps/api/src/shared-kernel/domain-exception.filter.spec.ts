import { ArgumentsHost } from '@nestjs/common';
import { DomainExceptionFilter } from './domain-exception.filter';
import { DomainError } from './domain-error';
import { DuplicateUsernameError } from '../identity/application/errors/duplicate-username.error';
import { RoleHierarchyError } from '../identity/application/errors/role-hierarchy.error';
import { InsufficientRoleError } from '../identity/application/errors/insufficient-role.error';
import { InvalidCredentialsError } from '../identity/application/errors/invalid-credentials.error';
import { UserNotFoundError } from '../identity/application/errors/user-not-found.error';

class ErrorDePrueba extends DomainError {
  readonly httpStatus = 418;
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDePrueba';
  }
}

function buildHost(): { host: ArgumentsHost; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, json, status };
}

describe('DomainExceptionFilter', () => {
  const filter = new DomainExceptionFilter();

  it('mapea cualquier DomainError a su httpStatus propio, sin conocer la clase concreta', () => {
    const { host, status, json } = buildHost();
    const error = new ErrorDePrueba('mensaje de prueba');

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(418);
    expect(json).toHaveBeenCalledWith({
      statusCode: 418,
      error: 'ErrorDePrueba',
      message: 'mensaje de prueba',
    });
  });

  it.each([
    [new DuplicateUsernameError('juan.perez', 'gym-1'), 409, 'DuplicateUsernameError'],
    [new RoleHierarchyError('PROFESOR', 'PROFESOR'), 403, 'RoleHierarchyError'],
    [new InsufficientRoleError('PROFESOR', ['ADMIN']), 403, 'InsufficientRoleError'],
    [new InvalidCredentialsError(), 401, 'InvalidCredentialsError'],
    [new UserNotFoundError('user-x'), 404, 'UserNotFoundError'],
  ])(
    'errores reales de identity: mapea %p al status %i (regresión post-refactor)',
    (error, statusEsperado, nombreEsperado) => {
      const { host, status, json } = buildHost();

      filter.catch(error as DomainError, host);

      expect(status).toHaveBeenCalledWith(statusEsperado);
      expect(json).toHaveBeenCalledWith({
        statusCode: statusEsperado,
        error: nombreEsperado,
        message: (error as Error).message,
      });
    },
  );
});
