import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AuthController } from './http/auth.controller';
import { LoginUseCase } from '../application/login.use-case';
import { RefreshSessionUseCase } from '../application/refresh-session.use-case';
import { SuperAdminLoginUseCase } from '../application/super-admin-login.use-case';
import { AUTH_PROVIDER, AuthProviderPort } from '../application/ports/auth-provider.port';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
  UserRecord,
} from '../application/ports/user-repository.port';
import { Role } from '../domain/role';
import { LoginRateLimitGuard } from './guards/login-rate-limit.guard';
import { DomainExceptionFilter } from '../../shared-kernel/domain-exception.filter';
import { PLATFORM_PSEUDO_GYM_ID } from './auth/synthetic-credentials';

describe('POST /auth/super-admin/login (e2e)', () => {
  let app: INestApplication;
  let gymIdRecibidoPorSignInStaff: string | undefined;

  const fakeAuthProvider: Partial<AuthProviderPort> = {
    signInStaff: jest.fn(async (gymId: string, username: string, password: string) => {
      gymIdRecibidoPorSignInStaff = gymId;
      if (gymId === PLATFORM_PSEUDO_GYM_ID && username === 'root' && password === 'correcta') {
        return { accessToken: 'token-sa', refreshToken: 'refresh-sa', authUserId: 'auth-sa' };
      }
      throw new Error('Credenciales inválidas');
    }),
  };

  const superAdmin: UserRecord = {
    id: 'sa-1',
    authUserId: 'auth-sa',
    gymId: null,
    username: 'root',
    nombre: 'Root',
    role: Role.SUPER_ADMIN,
    activo: true,
  };

  const fakeUserRepository: Partial<UserRepositoryPort> = {
    findByAuthUserId: async (authUserId: string) => (authUserId === 'auth-sa' ? superAdmin : null),
  };

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://e2e-super-admin-login-test.supabase.co';
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        LoginUseCase,
        RefreshSessionUseCase,
        SuperAdminLoginUseCase,
        LoginRateLimitGuard,
        { provide: AUTH_PROVIDER, useValue: fakeAuthProvider },
        { provide: USER_REPOSITORY, useValue: fakeUserRepository },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('loguea con username/password, sin pedir ni usar gymId del body', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/super-admin/login')
      .send({ username: 'root', password: 'correcta', gymId: 'gym-cualquiera-si-lo-mandaran' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accessToken: 'token-sa', refreshToken: 'refresh-sa' });
    expect(gymIdRecibidoPorSignInStaff).toBe(PLATFORM_PSEUDO_GYM_ID);
  });

  it('rechaza credenciales incorrectas con 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/super-admin/login')
      .send({ username: 'root', password: 'mal' });

    expect(res.status).toBe(401);
  });
});
