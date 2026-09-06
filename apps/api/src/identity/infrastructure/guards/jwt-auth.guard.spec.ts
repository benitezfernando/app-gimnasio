import {
  ExecutionContext,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { generateKeyPair } from 'jose';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UserRepositoryPort } from '../../application/ports/user-repository.port';
import { Role } from '../../domain/role';
import { buildTestJwtKeys, signTestToken, TestJwtKeys } from './testing/jwt-test-support';

const TEST_SUPABASE_URL = 'https://test-project.supabase.co';
const TEST_ISSUER = `${TEST_SUPABASE_URL}/auth/v1`;

// `createRemoteJWKSet` hace un fetch real por HTTPS — mockeado para que el
// guard resuelva contra el JWKS LOCAL de prueba (`buildTestJwtKeys`) en vez
// de pegarle a la red. `jwtVerify`/`SignJWT`/etc quedan reales (requireActual).
jest.mock('jose', () => {
  const actual = jest.requireActual('jose');
  return { ...actual, createRemoteJWKSet: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createRemoteJWKSet: mockCreateRemoteJWKSet } = jest.requireMock('jose') as {
  createRemoteJWKSet: jest.Mock;
};

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
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let reflector: any;
  let guard: JwtAuthGuard;
  let keys: TestJwtKeys;

  beforeAll(async () => {
    keys = await buildTestJwtKeys();
  });

  beforeEach(() => {
    process.env.SUPABASE_URL = TEST_SUPABASE_URL;
    mockCreateRemoteJWKSet.mockReturnValue(keys.jwks);
    userRepository = {
      findByAuthUserId: jest.fn(),
      findByGymIdAndUsername: jest.fn(),
      findByGymId: jest.fn(),
      findById: jest.fn(),
      deactivate: jest.fn(),
      create: jest.fn(),
    };
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    guard = new JwtAuthGuard(userRepository, reflector);
  });

  afterAll(() => {
    if (originalSupabaseUrl === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = originalSupabaseUrl;
    }
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

  it('rechaza un token firmado con una key que no está en la JWKS (firma inválida)', async () => {
    const { privateKey: otraPrivateKey } = await generateKeyPair('ES256');
    const tokenConOtraFirma = await signTestToken(otraPrivateKey, {
      issuer: TEST_ISSUER,
      sub: 'auth-user-1',
    });
    const { context } = buildContext(`Bearer ${tokenConOtraFirma}`);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token expirado', async () => {
    const tokenExpirado = await signTestToken(keys.privateKey, {
      issuer: TEST_ISSUER,
      expiresInSeconds: -10,
    });
    const { context } = buildContext(`Bearer ${tokenExpirado}`);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token con audience incorrecta', async () => {
    const token = await signTestToken(keys.privateKey, {
      issuer: TEST_ISSUER,
      audience: 'wrong-audience',
    });
    const { context } = buildContext(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token con issuer incorrecto', async () => {
    const token = await signTestToken(keys.privateKey, {
      issuer: 'https://otro-proyecto.supabase.co/auth/v1',
    });
    const { context } = buildContext(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token sin exp', async () => {
    const token = await signTestToken(keys.privateKey, {
      issuer: TEST_ISSUER,
      incluirExp: false,
    });
    const { context } = buildContext(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token válido si no existe un User con ese authUserId', async () => {
    userRepository.findByAuthUserId.mockResolvedValue(null);
    const token = await signTestToken(keys.privateKey, {
      issuer: TEST_ISSUER,
      sub: 'auth-user-sin-user',
    });
    const { context } = buildContext(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token válido si el User está desactivado', async () => {
    userRepository.findByAuthUserId.mockResolvedValue({
      id: 'user-1',
      authUserId: 'auth-user-1',
      gymId: 'gym-1',
      username: 'x',
      nombre: 'X',
      role: Role.ALUMNO,
      activo: false,
    });
    const token = await signTestToken(keys.privateKey, { issuer: TEST_ISSUER });
    const { context } = buildContext(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza con UnauthorizedException si el repositorio de usuarios tira un error', async () => {
    userRepository.findByAuthUserId.mockRejectedValue(new Error('DB caída'));
    const token = await signTestToken(keys.privateKey, { issuer: TEST_ISSUER });
    const { context } = buildContext(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('acepta un token válido y adjunta req.user con id/gymId/role', async () => {
    userRepository.findByAuthUserId.mockResolvedValue({
      id: 'user-1',
      authUserId: 'auth-user-1',
      gymId: 'gym-1',
      username: 'x',
      nombre: 'X',
      role: Role.PROFESOR,
      activo: true,
    });
    const token = await signTestToken(keys.privateKey, { issuer: TEST_ISSUER });
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
