import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GymScopeGuard } from './gym-scope.guard';
import { Role } from '../../domain/role';

function buildContext(request: {
  user?: { id: string; gymId: string; role: Role };
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('GymScopeGuard', () => {
  const guard = new GymScopeGuard();
  const user = { id: 'user-1', gymId: 'gym-A', role: Role.PROFESOR };

  it('permite el acceso si no hay gymId explícito en params ni body', () => {
    const context = buildContext({ user, params: {}, body: {} });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('permite el acceso si el gymId en params coincide con el del usuario', () => {
    const context = buildContext({ user, params: { gymId: 'gym-A' }, body: {} });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rechaza si el gymId en params es de otro gym', () => {
    const context = buildContext({ user, params: { gymId: 'gym-B' }, body: {} });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rechaza si el gymId en el body es de otro gym', () => {
    const context = buildContext({ user, params: {}, body: { gymId: 'gym-B' } });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rechaza si el gymId en la query string es de otro gym', () => {
    const context = buildContext({ user, params: {}, body: {}, query: { gymId: 'gym-B' } });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('no falla si todavía no hay usuario en el request (corre después de JwtAuthGuard)', () => {
    const context = buildContext({ user: undefined, params: {}, body: {} });
    expect(guard.canActivate(context)).toBe(true);
  });
});
