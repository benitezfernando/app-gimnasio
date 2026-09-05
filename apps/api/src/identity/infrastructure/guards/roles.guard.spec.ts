import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { Role } from '../../domain/role';

function buildContext(user: { role: Role } | undefined, rolesRequeridos: Role[] | undefined) {
  const request = { user };
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(rolesRequeridos) };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
  return { context, reflector };
}

describe('RolesGuard', () => {
  it('permite el acceso si el endpoint no tiene @Roles', () => {
    const { context, reflector } = buildContext({ role: Role.ALUMNO }, undefined);
    const guard = new RolesGuard(reflector as any);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rechaza si el rol del usuario no está entre los requeridos', () => {
    const { context, reflector } = buildContext({ role: Role.ALUMNO }, [Role.ADMIN]);
    const guard = new RolesGuard(reflector as any);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('permite el acceso si el rol del usuario está entre los requeridos', () => {
    const { context, reflector } = buildContext({ role: Role.PROFESOR }, [
      Role.ADMIN,
      Role.PROFESOR,
    ]);
    const guard = new RolesGuard(reflector as any);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rechaza si se requiere rol pero no hay usuario en el request', () => {
    const { context, reflector } = buildContext(undefined, [Role.ADMIN]);
    const guard = new RolesGuard(reflector as any);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
