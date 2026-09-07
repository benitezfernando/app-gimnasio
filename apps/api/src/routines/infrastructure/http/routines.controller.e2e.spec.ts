import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { RoutinesController } from './routines.controller';
import { GetAlumnoRutinaVigenteAsProfesorUseCase } from '../../application/get-alumno-rutina-vigente-as-profesor.use-case';
import { GetMiRutinaVigenteUseCase } from '../../application/get-mi-rutina-vigente.use-case';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
  UserRecord,
} from '../../../identity/application/ports/user-repository.port';
import { JwtAuthGuard } from '../../../identity/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../../identity/infrastructure/guards/roles.guard';
import { GymScopeGuard } from '../../../identity/infrastructure/guards/gym-scope.guard';
import { Role } from '../../../identity/domain/role';
import { DomainExceptionFilter } from '../../../shared-kernel/domain-exception.filter';
import {
  buildTestJwtKeys,
  signTestToken,
  TestJwtKeys,
} from '../../../identity/infrastructure/guards/testing/jwt-test-support';

const TEST_SUPABASE_URL = 'https://e2e-routines.supabase.co';

jest.mock('jose', () => {
  const actual = jest.requireActual('jose');
  return { ...actual, createRemoteJWKSet: jest.fn() };
});

const { createRemoteJWKSet: mockCreateRemoteJWKSet } = jest.requireMock('jose') as {
  createRemoteJWKSet: jest.Mock;
};

/**
 * Regresión del bug de orden de rutas: `me/rutina-vigente` tiene que
 * estar declarado ANTES que `:alumnoId/rutina-vigente` en el
 * controller. Si un refactor futuro los reordena "por prolijidad",
 * Express/Nest matchea la ruta paramétrica primero y `alumnoId`
 * termina valiendo literalmente `'me'` — el endpoint del ALUMNO queda
 * inalcanzable. Estos tests fallan si eso vuelve a pasar.
 */
describe('/users/:alumnoId|me/rutina-vigente (e2e)', () => {
  let app: INestApplication;
  let claves: TestJwtKeys;

  const profesor: UserRecord = {
    id: 'prof-1',
    authUserId: 'auth-prof',
    gymId: 'gym-A',
    username: 'prof1',
    nombre: 'Profe',
    role: Role.PROFESOR,
    activo: true,
  };

  const alumno: UserRecord = {
    id: 'alum-1',
    authUserId: 'auth-alum',
    gymId: 'gym-A',
    username: 'juan.perez',
    nombre: 'Juan',
    role: Role.ALUMNO,
    activo: true,
  };

  const fakeGetMiRutinaUseCase = {
    execute: jest.fn(async () => ({ id: 'inst-mia', nombre: 'Mi rutina', ejercicios: [] })),
  };
  const fakeGetAlumnoRutinaUseCase = {
    execute: jest.fn(async () => ({
      id: 'inst-alumno',
      nombre: 'Rutina del alumno',
      ejercicios: [],
    })),
  };

  const fakeUserRepository: Pick<UserRepositoryPort, 'findByAuthUserId'> = {
    findByAuthUserId: async (authUserId: string) => {
      if (authUserId === 'auth-prof') return profesor;
      if (authUserId === 'auth-alum') return alumno;
      return null;
    },
  };

  function firmarTokenPara(sub: string): Promise<string> {
    return signTestToken(claves.privateKey, { issuer: `${TEST_SUPABASE_URL}/auth/v1`, sub });
  }

  beforeAll(async () => {
    process.env.SUPABASE_URL = TEST_SUPABASE_URL;
    claves = await buildTestJwtKeys();
    mockCreateRemoteJWKSet.mockReturnValue(claves.jwks);

    const moduleRef = await Test.createTestingModule({
      controllers: [RoutinesController],
      providers: [
        { provide: GetAlumnoRutinaVigenteAsProfesorUseCase, useValue: fakeGetAlumnoRutinaUseCase },
        { provide: GetMiRutinaVigenteUseCase, useValue: fakeGetMiRutinaUseCase },
        { provide: USER_REPOSITORY, useValue: fakeUserRepository },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: GymScopeGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterEach(() => {
    fakeGetMiRutinaUseCase.execute.mockClear();
    fakeGetAlumnoRutinaUseCase.execute.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('un ALUMNO pidiendo /users/me/rutina-vigente invoca GetMiRutinaVigenteUseCase, nunca el de profesor', async () => {
    const token = await firmarTokenPara('auth-alum');
    const res = await request(app.getHttpServer())
      .get('/users/me/rutina-vigente')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toMatchObject({ id: 'inst-mia' });
    expect(fakeGetMiRutinaUseCase.execute).toHaveBeenCalledTimes(1);
    expect(fakeGetMiRutinaUseCase.execute).toHaveBeenCalledWith({
      invocadoPor: expect.objectContaining({ id: 'alum-1', role: Role.ALUMNO }),
    });
    expect(fakeGetAlumnoRutinaUseCase.execute).not.toHaveBeenCalled();
  });

  it('un PROFESOR pidiendo /users/:alumnoId/rutina-vigente (id real) invoca GetAlumnoRutinaVigenteAsProfesorUseCase con ese alumnoId', async () => {
    const token = await firmarTokenPara('auth-prof');
    const res = await request(app.getHttpServer())
      .get('/users/alum-42/rutina-vigente')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toMatchObject({ id: 'inst-alumno' });
    expect(fakeGetAlumnoRutinaUseCase.execute).toHaveBeenCalledTimes(1);
    expect(fakeGetAlumnoRutinaUseCase.execute).toHaveBeenCalledWith({
      invocadoPor: expect.objectContaining({ id: 'prof-1', role: Role.PROFESOR }),
      alumnoId: 'alum-42',
    });
    expect(fakeGetMiRutinaUseCase.execute).not.toHaveBeenCalled();
  });
});
