import {
  ExecutionContext,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UserRepositoryPort } from '../../application/ports/user-repository.port';
import { Role } from '../../domain/role';

const TEST_SECRET = 'test-supabase-jwt-secret';
const TEST_SUPABASE_URL = 'https://test-project.supabase.co';
const TEST_ISSUER = `${TEST_SUPABASE_URL}/auth/v1`;
const VALID_TOKEN_OPTIONS = { audience: 'authenticated', issuer: TEST_ISSUER };

function buildContext(authorizationHeader?: string): {
  context: ExecutionContext;
  request: { headers: Record<string, string | undefined>; user?: unknown };
} {
  const request: { headers: Record<string, string | undefined>; user?: unknown } = {
    headers: { authorization: authorizationHeader },
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('JwtAuthGuard', () => {
  const originalSecret = process.env.SUPABASE_JWT_SECRET;
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let reflector: any;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = TEST_SECRET;
    process.env.SUPABASE_URL = TEST_SUPABASE_URL;
    userRepository = {
      findByAuthUserId: jest.fn(),
      findByGymIdAndEmail: jest.fn(),
      create: jest.fn(),
    };
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    guard = new JwtAuthGuard(userRepository, reflector);
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.SUPABASE_JWT_SECRET;
    } else {
      process.env.SUPABASE_JWT_SECRET = originalSecret;
    }
    if (originalSupabaseUrl === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = originalSupabaseUrl;
    }
  });

  it('lanza InternalServerErrorException si SUPABASE_JWT_SECRET no está configurado', async () => {
    delete process.env.SUPABASE_JWT_SECRET;
    const { context } = buildContext('Bearer cualquier-token');
    await expect(guard.canActivate(context)).rejects.toThrow(InternalServerErrorException);
  });

  it('lanza InternalServerErrorException si SUPABASE_URL no está configurado', async () => {
    delete process.env.SUPABASE_URL;
    const { context } = buildContext('Bearer cualquier-token');
    await expect(guard.canActivate(context)).rejects.toThrow(InternalServerErrorException);
  });

  it('rechaza si no hay header Authorization', async () => {
    const { context } = buildContext(undefined);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token con firma inválida', async () => {
    const tokenConOtraFirma = jwt.sign(
      { sub: 'auth-user-1', aud: 'authenticated' },
      'otra-firma-distinta',
      {
        issuer: TEST_ISSUER,
      },
    );
    const { context } = buildContext(`Bearer ${tokenConOtraFirma}`);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token expirado', async () => {
    const tokenExpirado = jwt.sign({ sub: 'auth-user-1' }, TEST_SECRET, {
      expiresIn: -10,
      ...VALID_TOKEN_OPTIONS,
    });
    const { context } = buildContext(`Bearer ${tokenExpirado}`);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token con audience incorrecta', async () => {
    const token = jwt.sign({ sub: 'auth-user-1' }, TEST_SECRET, {
      audience: 'wrong-audience',
      issuer: TEST_ISSUER,
      expiresIn: '1h',
    });
    const { context } = buildContext(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token con issuer incorrecto', async () => {
    const token = jwt.sign({ sub: 'auth-user-1' }, TEST_SECRET, {
      audience: 'authenticated',
      issuer: 'https://otro-proyecto.supabase.co/auth/v1',
      expiresIn: '1h',
    });
    const { context } = buildContext(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token sin exp', async () => {
    const token = jwt.sign({ sub: 'auth-user-1', aud: 'authenticated' }, TEST_SECRET, {
      issuer: TEST_ISSUER,
    });
    const { context } = buildContext(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token válido si no existe un User con ese authUserId', async () => {
    userRepository.findByAuthUserId.mockResolvedValue(null);
    const token = jwt.sign({ sub: 'auth-user-sin-user' }, TEST_SECRET, {
      ...VALID_TOKEN_OPTIONS,
      expiresIn: '1h',
    });
    const { context } = buildContext(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token válido si el User está desactivado', async () => {
    userRepository.findByAuthUserId.mockResolvedValue({
      id: 'user-1',
      authUserId: 'auth-user-1',
      gymId: 'gym-1',
      email: 'x@gym.com',
      nombre: 'X',
      role: Role.ALUMNO,
      activo: false,
    });
    const token = jwt.sign({ sub: 'auth-user-1' }, TEST_SECRET, {
      ...VALID_TOKEN_OPTIONS,
      expiresIn: '1h',
    });
    const { context } = buildContext(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza con UnauthorizedException si el repositorio de usuarios tira un error', async () => {
    userRepository.findByAuthUserId.mockRejectedValue(new Error('DB caída'));
    const token = jwt.sign({ sub: 'auth-user-1' }, TEST_SECRET, {
      ...VALID_TOKEN_OPTIONS,
      expiresIn: '1h',
    });
    const { context } = buildContext(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('acepta un token válido y adjunta req.user con id/gymId/role', async () => {
    userRepository.findByAuthUserId.mockResolvedValue({
      id: 'user-1',
      authUserId: 'auth-user-1',
      gymId: 'gym-1',
      email: 'x@gym.com',
      nombre: 'X',
      role: Role.PROFESOR,
      activo: true,
    });
    const token = jwt.sign({ sub: 'auth-user-1' }, TEST_SECRET, {
      ...VALID_TOKEN_OPTIONS,
      expiresIn: '1h',
    });
    const { context, request } = buildContext(`Bearer ${token}`);

    const resultado = await guard.canActivate(context);

    expect(resultado).toBe(true);
    expect(request.user).toEqual({ id: 'user-1', gymId: 'gym-1', role: Role.PROFESOR });
  });

  it('permite el acceso sin token si el endpoint es @Public()', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const { context } = buildContext(undefined);

    const resultado = await guard.canActivate(context);

    expect(resultado).toBe(true);
    expect(userRepository.findByAuthUserId).not.toHaveBeenCalled();
  });
});
