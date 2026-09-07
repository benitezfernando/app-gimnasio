import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { ExercisesController } from './exercises.controller';
import { ListExercisesUseCase } from '../../application/list-exercises.use-case';
import { GetExerciseUseCase } from '../../application/get-exercise.use-case';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepositoryPort,
} from '../../application/ports/exercise-repository.port';
import { JwtAuthGuard } from '../../../identity/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../../identity/infrastructure/guards/roles.guard';
import { GymScopeGuard } from '../../../identity/infrastructure/guards/gym-scope.guard';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
  UserRecord,
} from '../../../identity/application/ports/user-repository.port';
import { Role } from '../../../identity/domain/role';
import { DomainExceptionFilter } from '../../../shared-kernel/domain-exception.filter';
import {
  buildTestJwtKeys,
  signTestToken,
  TestJwtKeys,
} from '../../../identity/infrastructure/guards/testing/jwt-test-support';

const TEST_SUPABASE_URL = 'https://e2e-test.supabase.co';

// Ver la misma nota en jwt-auth.guard.spec.ts — mockeado para resolver
// contra un JWKS local de prueba, sin red.
jest.mock('jose', () => {
  const actual = jest.requireActual('jose');
  return { ...actual, createRemoteJWKSet: jest.fn() };
});

const { createRemoteJWKSet: mockCreateRemoteJWKSet } = jest.requireMock('jose') as {
  createRemoteJWKSet: jest.Mock;
};

describe('/exercises (e2e)', () => {
  let app: INestApplication;
  let claves: TestJwtKeys;

  const ejercicioResumen = {
    id: 'ex-1',
    nombre: '3/4 Sit-Up',
    imageUrl: null,
    gifUrl: null,
    parteCuerpo: 'waist',
    grupoMuscular: 'abs',
    equipamiento: 'body weight',
  };

  const fakeExerciseRepository: ExerciseRepositoryPort = {
    findMany: jest.fn(async () => ({ items: [ejercicioResumen], total: 1 })),
    findById: jest.fn(async (id: string) =>
      id === 'ex-1'
        ? {
            ...ejercicioResumen,
            gruposMuscularesSecundarios: ['hip flexors'],
            instrucciones: 'Texto',
            pasos: ['Paso 1'],
            atribucionMedia: '© Gym visual — https://gymvisual.com/',
          }
        : null,
    ),
    findByIds: jest.fn(async (ids: string[]) => (ids.includes('ex-1') ? [ejercicioResumen] : [])),
  };

  const usuarioAlumno: UserRecord = {
    id: 'user-1',
    authUserId: 'auth-1',
    gymId: 'gym-A',
    username: 'juan.perez',
    nombre: 'Juan',
    role: Role.ALUMNO,
    activo: true,
  };

  const fakeUserRepository: Pick<UserRepositoryPort, 'findByAuthUserId'> = {
    findByAuthUserId: async (authUserId: string) =>
      authUserId === 'auth-1' ? usuarioAlumno : null,
  };

  function firmarToken(): Promise<string> {
    return signTestToken(claves.privateKey, {
      issuer: `${TEST_SUPABASE_URL}/auth/v1`,
      sub: 'auth-1',
    });
  }

  beforeAll(async () => {
    process.env.SUPABASE_URL = TEST_SUPABASE_URL;
    claves = await buildTestJwtKeys();
    mockCreateRemoteJWKSet.mockReturnValue(claves.jwks);

    const moduleRef = await Test.createTestingModule({
      controllers: [ExercisesController],
      providers: [
        ListExercisesUseCase,
        GetExerciseUseCase,
        { provide: EXERCISE_REPOSITORY, useValue: fakeExerciseRepository },
        { provide: USER_REPOSITORY, useValue: fakeUserRepository },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: GymScopeGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Replica el ValidationPipe global de main.ts: sin esto, el DTO nunca
    // transforma page/limit (query params llegan siempre como string) ni
    // aplica sus defaults, y el test de paginación/filtrado falla.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rechaza sin token (401)', async () => {
    await request(app.getHttpServer()).get('/exercises').expect(401);
  });

  it('un ALUMNO autenticado puede listar — sin @Roles(), cualquier rol pasa', async () => {
    const token = await firmarToken();
    const res = await request(app.getHttpServer())
      .get('/exercises')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual({
      items: [ejercicioResumen],
      page: 1,
      limit: 24,
      total: 1,
      totalPages: 1,
    });
  });

  it('acepta query params de filtro/paginación y los pasa tal cual al repositorio', async () => {
    const token = await firmarToken();
    await request(app.getHttpServer())
      .get('/exercises?search=sit&parteCuerpo=waist&page=2&limit=10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(fakeExerciseRepository.findMany).toHaveBeenCalledWith({
      search: 'sit',
      parteCuerpo: 'waist',
      page: 2,
      limit: 10,
    });
  });

  it('detalle existente devuelve 200 con el detalle completo', async () => {
    const token = await firmarToken();
    const res = await request(app.getHttpServer())
      .get('/exercises/ex-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.atribucionMedia).toBe('© Gym visual — https://gymvisual.com/');
  });

  it('detalle inexistente devuelve 404 vía el filtro de dominio', async () => {
    const token = await firmarToken();
    const res = await request(app.getHttpServer())
      .get('/exercises/no-existe')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    expect(res.body.error).toBe('ExerciseNotFoundError');
  });
});
