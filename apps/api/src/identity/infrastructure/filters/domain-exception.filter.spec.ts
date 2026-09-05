import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { DomainExceptionFilter } from './domain-exception.filter';
import { DuplicateUsernameError } from '../../application/errors/duplicate-username.error';
import { RoleHierarchyError } from '../../application/errors/role-hierarchy.error';
import { InvalidCredentialsError } from '../../application/errors/invalid-credentials.error';
import { InsufficientRoleError } from '../../application/errors/insufficient-role.error';
import { UserNotFoundError } from '../../application/errors/user-not-found.error';

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

  it.each([
    [
      new DuplicateUsernameError('juan.perez', 'gym-1'),
      HttpStatus.CONFLICT,
      'DuplicateUsernameError',
    ],
    [new RoleHierarchyError('PROFESOR', 'PROFESOR'), HttpStatus.FORBIDDEN, 'RoleHierarchyError'],
    [
      new InsufficientRoleError('PROFESOR', ['ADMIN']),
      HttpStatus.FORBIDDEN,
      'InsufficientRoleError',
    ],
    [new InvalidCredentialsError(), HttpStatus.UNAUTHORIZED, 'InvalidCredentialsError'],
    [new UserNotFoundError('user-x'), HttpStatus.NOT_FOUND, 'UserNotFoundError'],
  ])('mapea %p al status %i', (error, statusEsperado, nombreEsperado) => {
    const { host, status, json } = buildHost();

    filter.catch(error as Error, host);

    expect(status).toHaveBeenCalledWith(statusEsperado);
    expect(json).toHaveBeenCalledWith({
      statusCode: statusEsperado,
      error: nombreEsperado,
      message: (error as Error).message,
    });
  });
});
