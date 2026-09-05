import { ExecutionContext, HttpException } from '@nestjs/common';
import { LoginRateLimitGuard } from './login-rate-limit.guard';

function buildContext(ip: string, username: string): ExecutionContext {
  const request = { ip, body: { username } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('LoginRateLimitGuard', () => {
  let guard: LoginRateLimitGuard;

  beforeEach(() => {
    guard = new LoginRateLimitGuard();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('permite hasta 5 intentos para el mismo ip+username', () => {
    for (let i = 0; i < 5; i += 1) {
      expect(guard.canActivate(buildContext('1.2.3.4', 'juan.perez'))).toBe(true);
    }
  });

  it('rechaza el 6to intento para el mismo ip+username dentro de la ventana', () => {
    for (let i = 0; i < 5; i += 1) {
      guard.canActivate(buildContext('1.2.3.4', 'juan.perez'));
    }
    expect(() => guard.canActivate(buildContext('1.2.3.4', 'juan.perez'))).toThrow(HttpException);
  });

  it('no bloquea un username distinto desde la misma ip', () => {
    for (let i = 0; i < 5; i += 1) {
      guard.canActivate(buildContext('1.2.3.4', 'juan.perez'));
    }
    expect(guard.canActivate(buildContext('1.2.3.4', 'otro.usuario'))).toBe(true);
  });

  it('no bloquea el mismo username desde una ip distinta', () => {
    for (let i = 0; i < 5; i += 1) {
      guard.canActivate(buildContext('1.2.3.4', 'juan.perez'));
    }
    expect(guard.canActivate(buildContext('5.6.7.8', 'juan.perez'))).toBe(true);
  });

  it('resetea el contador pasada la ventana de tiempo', () => {
    for (let i = 0; i < 5; i += 1) {
      guard.canActivate(buildContext('1.2.3.4', 'juan.perez'));
    }
    jest.advanceTimersByTime(15 * 60 * 1000 + 1);
    expect(guard.canActivate(buildContext('1.2.3.4', 'juan.perez'))).toBe(true);
  });

  it('rechaza el intento 21 desde la misma ip aunque cada username sea distinto', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(guard.canActivate(buildContext('9.9.9.9', `usuario${i}`))).toBe(true);
    }
    expect(() => guard.canActivate(buildContext('9.9.9.9', 'usuario20'))).toThrow(HttpException);
  });

  it('resetea el contador por ip pasada la ventana de tiempo', () => {
    for (let i = 0; i < 20; i += 1) {
      guard.canActivate(buildContext('9.9.9.9', `usuario${i}`));
    }
    jest.advanceTimersByTime(15 * 60 * 1000 + 1);
    expect(guard.canActivate(buildContext('9.9.9.9', 'usuario20'))).toBe(true);
  });
});
