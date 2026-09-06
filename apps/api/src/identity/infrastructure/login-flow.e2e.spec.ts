import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AuthController } from './http/auth.controller';
import { LoginUseCase } from '../application/login.use-case';
import { RefreshSessionUseCase } from '../application/refresh-session.use-case';
import { AUTH_PROVIDER, AuthProviderPort } from '../application/ports/auth-provider.port';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
  UserRecord,
} from '../application/ports/user-repository.port';
import { Role } from '../domain/role';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { GymScopeGuard } from './guards/gym-scope.guard';
import { LoginRateLimitGuard } from './guards/login-rate-limit.guard';
import { DomainExceptionFilter } from './filters/domain-exception.filter';

describe('POST /auth/login (e2e)', () => {
  let app: INestApplication;

  const fakeAuthProvider: AuthProviderPort = {
    createStaffUser: jest.fn(),
    createAlumnoUser: jest.fn(),
    deleteAuthUser: jest.fn(),
    refreshSession: jest.fn(async (refreshToken: string) => {
      if (refreshToken === 'refresh-staff-valido') {
        return {
          accessToken: 'token-staff-2',
          refreshToken: 'refresh-staff-2',
          authUserId: 'auth-admin1',
        };
      }
      if (refreshToken === 'refresh-baja-valido') {
        return {
          accessToken: 'token-baja-2',
          refreshToken: 'refresh-baja-2',
          authUserId: 'auth-baja1',
        };
      }
      throw new Error('refresh_token inválido o ya usado');
    }),
    signInStaff: jest.fn(async (_gymId, username, password) => {
      if (username === 'admin1' && password === 'password-correcta') {
        return {
          accessToken: 'token-staff',
          refreshToken: 'refresh-staff',
          authUserId: 'auth-admin1',
        };
      }
      if (username === 'baja1' && password === 'password-correcta') {
        return {
          accessToken: 'token-baja',
          refreshToken: 'refresh-baja',
          authUserId: 'auth-baja1',
        };
      }
      throw new Error('Credenciales inválidas');
    }),
    signInAlumno: jest.fn(async (_gymId, username) => {
      if (username === 'juan.perez') {
        return {
          accessToken: 'token-alumno',
          refreshToken: 'refresh-alumno',
          authUserId: 'auth-juanperez',
        };
      }
      throw new Error('Credenciales inválidas');
    }),
  };

  const usuariosPorAuthId: Record<string, UserRecord> = {
    'auth-admin1': {
      id: 'user-admin1',
      authUserId: 'auth-admin1',
      gymId: 'gym-A',
      username: 'admin1',
      nombre: 'Admin',
      role: Role.ADMIN,
      activo: true,
    },
    'auth-juanperez': {
      id: 'user-juanperez',
      authUserId: 'auth-juanperez',
      gymId: 'gym-A',
      username: 'juan.perez',
      nombre: 'Juan',
      role: Role.ALUMNO,
      activo: true,
    },
    'auth-baja1': {
      id: 'user-baja1',
      authUserId: 'auth-baja1',
      gymId: 'gym-A',
      username: 'baja1',
      nombre: 'Baja',
      role: Role.ADMIN,
      activo: false,
    },
  };

  const fakeUserRepository: Pick<UserRepositoryPort, 'findByAuthUserId'> = {
    findByAuthUserId: async (authUserId: string) => usuariosPorAuthId[authUserId] ?? null,
  };

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://e2e-test.supabase.co';

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        LoginUseCase,
        RefreshSessionUseCase,
        LoginRateLimitGuard,
        { provide: AUTH_PROVIDER, useValue: fakeAuthProvider },
        { provide: USER_REPOSITORY, useValue: fakeUserRepository },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: GymScopeGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('login sin token funciona (ruta @Public())', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ gymId: 'gym-A', username: 'admin1', password: 'password-correcta' })
      .expect(200)
      .expect((res) => {
        if (res.body.accessToken !== 'token-staff') throw new Error('accessToken inesperado');
      });
  });

  it('login de alumno sin password funciona', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ gymId: 'gym-A', username: 'juan.perez' })
      .expect(200)
      .expect((res) => {
        if (res.body.accessToken !== 'token-alumno') throw new Error('accessToken inesperado');
      });
  });

  it('password incorrecta devuelve 401 genérico', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ gymId: 'gym-A', username: 'admin1', password: 'mal' })
      .expect(401);
    if (!String(res.body.message).includes('incorrectos')) throw new Error('mensaje inesperado');
  });

  it('username inexistente (sin password) devuelve el mismo 401 genérico', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ gymId: 'gym-A', username: 'no.existe' })
      .expect(401);
  });

  it('usuario interno desactivado devuelve 401 aunque Supabase autentique bien', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ gymId: 'gym-A', username: 'baja1', password: 'password-correcta' })
      .expect(401);
  });
});

describe('POST /auth/refresh (e2e)', () => {
  let app: INestApplication;

  const fakeAuthProvider: AuthProviderPort = {
    createStaffUser: jest.fn(),
    createAlumnoUser: jest.fn(),
    deleteAuthUser: jest.fn(),
    signInStaff: jest.fn(),
    signInAlumno: jest.fn(),
    refreshSession: jest.fn(async (refreshToken: string) => {
      if (refreshToken === 'refresh-staff-valido') {
        return {
          accessToken: 'token-staff-2',
          refreshToken: 'refresh-staff-2',
          authUserId: 'auth-admin1',
        };
      }
      if (refreshToken === 'refresh-baja-valido') {
        return {
          accessToken: 'token-baja-2',
          refreshToken: 'refresh-baja-2',
          authUserId: 'auth-baja1',
        };
      }
      throw new Error('refresh_token inválido o ya usado');
    }),
  };

  const usuariosPorAuthId: Record<string, UserRecord> = {
    'auth-admin1': {
      id: 'user-admin1',
      authUserId: 'auth-admin1',
      gymId: 'gym-A',
      username: 'admin1',
      nombre: 'Admin',
      role: Role.ADMIN,
      activo: true,
    },
    'auth-baja1': {
      id: 'user-baja1',
      authUserId: 'auth-baja1',
      gymId: 'gym-A',
      username: 'baja1',
      nombre: 'Baja',
      role: Role.ADMIN,
      activo: false,
    },
  };

  const fakeUserRepository: Pick<UserRepositoryPort, 'findByAuthUserId'> = {
    findByAuthUserId: async (authUserId: string) => usuariosPorAuthId[authUserId] ?? null,
  };

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://e2e-test.supabase.co';

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        LoginUseCase,
        RefreshSessionUseCase,
        LoginRateLimitGuard,
        { provide: AUTH_PROVIDER, useValue: fakeAuthProvider },
        { provide: USER_REPOSITORY, useValue: fakeUserRepository },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: GymScopeGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('refresh_token válido devuelve nuevos accessToken/refreshToken, sin authUserId', async () => {
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'refresh-staff-valido' })
      .expect(200)
      .expect((res) => {
        if (res.body.accessToken !== 'token-staff-2') throw new Error('accessToken inesperado');
        if (res.body.refreshToken !== 'refresh-staff-2') throw new Error('refreshToken inesperado');
        if ('authUserId' in res.body) throw new Error('authUserId no debería filtrarse');
      });
  });

  it('refresh_token inválido o expirado devuelve 401 genérico (fuerza re-login limpio)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'token-basura' })
      .expect(401);
    if (!String(res.body.message).includes('incorrectos')) throw new Error('mensaje inesperado');
  });

  it('refresh de un usuario interno desactivado devuelve 401 aunque Supabase lo refresque bien', async () => {
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'refresh-baja-valido' })
      .expect(401);
  });

  it('no requiere token JWT (ruta @Public())', async () => {
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'refresh-staff-valido' })
      .expect(200);
  });
});
