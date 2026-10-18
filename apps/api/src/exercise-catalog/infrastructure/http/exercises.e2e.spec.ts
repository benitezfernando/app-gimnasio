import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { ExercisesController } from './exercises.controller';
import { ListExercisesUseCase } from '../../application/list-exercises.use-case';
import { GetExerciseUseCase } from '../../application/get-exercise.use-case';
import { GetExercisesByIdsUseCase } from '../../application/get-exercises-by-ids.use-case';
import { SetExerciseAliasUseCase } from '../../application/set-exercise-alias.use-case';
import { ClearExerciseAliasUseCase } from '../../application/clear-exercise-alias.use-case';
import {
  EXERCISE_ALIAS_REPOSITORY,
  ExerciseAliasRepositoryPort,
} from '../../application/ports/exercise-alias-repository.port';
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
    nombreOriginal: null,
    imageUrl: null,
    gifUrl: null,
    parteCuerpo: 'waist',
    grupoMuscular: 'abs',
    equipamiento: 'body weight',
  };

  const ejercicioResumen2 = { ...ejercicioResumen, id: 'ex-2', nombre: 'Push-Up' };

  const fakeExerciseRepository: ExerciseRepositoryPort = {
    findMany: jest.fn(async () => ({ items: [ejercicioResumen], total: 1 })),
    findById: jest.fn(async (id: string, aliasDeProfesorId?: string) =>
      id === 'ex-1'
        ? {
            ...ejercicioResumen,
            ...(aliasDeProfesorId
              ? { nombre: 'Banca plana', nombreCatalogo: ejercicioResumen.nombre }
              : {}),
            gruposMuscularesSecundarios: ['hip flexors'],
            instrucciones: 'Texto',
            pasos: ['Paso 1'],
            atribucionMedia: '© Gym visual — https://gymvisual.com/',
          }
        : null,
    ),
    findByIds: jest.fn(async (ids: string[]) =>
      [ejercicioResumen, ejercicioResumen2].filter((e) => ids.includes(e.id)),
    ),
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

  const usuarioProfesor: UserRecord = {
    id: 'user-prof',
    authUserId: 'auth-prof',
    gymId: 'gym-A',
    username: 'prof',
    nombre: 'Prof',
    role: Role.PROFESOR,
    activo: true,
  };

  const fakeUserRepository: Pick<UserRepositoryPort, 'findByAuthUserId'> = {
    findByAuthUserId: async (authUserId: string) => {
      if (authUserId === 'auth-1') return usuarioAlumno;
      if (authUserId === 'auth-prof') return usuarioProfesor;
      return null;
    },
  };

  const fakeAliasRepository: ExerciseAliasRepositoryPort = {
    upsert: jest.fn(async () => undefined),
    delete: jest.fn(async () => undefined),
  };

  function firmarToken(sub = 'auth-1'): Promise<string> {
    return signTestToken(claves.privateKey, {
      issuer: `${TEST_SUPABASE_URL}/auth/v1`,
      sub,
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
        GetExercisesByIdsUseCase,
        SetExerciseAliasUseCase,
        ClearExerciseAliasUseCase,
        { provide: EXERCISE_REPOSITORY, useValue: fakeExerciseRepository },
        { provide: EXERCISE_ALIAS_REPOSITORY, useValue: fakeAliasRepository },
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

  it('by-ids resuelve varios en un solo llamado, comma-separated', async () => {
    const token = await firmarToken();
    const res = await request(app.getHttpServer())
      .get('/exercises/by-ids?ids=ex-1,ex-2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual([ejercicioResumen, ejercicioResumen2]);
    expect(fakeExerciseRepository.findByIds).toHaveBeenCalledWith(['ex-1', 'ex-2'], undefined);
  });

  it('by-ids sin query param ids devuelve 400 (ArrayNotEmpty)', async () => {
    const token = await firmarToken();
    await request(app.getHttpServer())
      .get('/exercises/by-ids')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('by-ids con más de 50 ids devuelve 400 (ArrayMaxSize)', async () => {
    const token = await firmarToken();
    const idsDeMas = Array.from({ length: 51 }, (_, i) => `ex-${i}`).join(',');
    await request(app.getHttpServer())
      .get(`/exercises/by-ids?ids=${idsDeMas}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  describe('alias de profesor', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('PROFESOR: el listado se resuelve con su alias (aliasDeProfesorId = su id)', async () => {
      const token = await firmarToken('auth-prof');
      await request(app.getHttpServer())
        .get('/exercises?search=banca')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(fakeExerciseRepository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'banca', aliasDeProfesorId: 'user-prof' }),
      );
    });

    it('ALUMNO: el listado no pasa aliasDeProfesorId (catálogo puro)', async () => {
      const token = await firmarToken();
      await request(app.getHttpServer())
        .get('/exercises')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const filtro = (fakeExerciseRepository.findMany as jest.Mock).mock.calls[0][0];
      expect(filtro.aliasDeProfesorId).toBeUndefined();
    });

    it('PROFESOR: by-ids y detalle resuelven con su alias', async () => {
      const token = await firmarToken('auth-prof');

      await request(app.getHttpServer())
        .get('/exercises/by-ids?ids=ex-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(fakeExerciseRepository.findByIds).toHaveBeenCalledWith(['ex-1'], 'user-prof');

      const detalle = await request(app.getHttpServer())
        .get('/exercises/ex-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(fakeExerciseRepository.findById).toHaveBeenCalledWith('ex-1', 'user-prof');
      expect(detalle.body.nombre).toBe('Banca plana');
    });

    it('PUT alias como PROFESOR responde 200 con el ejercicio resuelto y guarda el alias recortado y normalizado', async () => {
      const token = await firmarToken('auth-prof');
      const res = await request(app.getHttpServer())
        .put('/exercises/ex-1/alias')
        .set('Authorization', `Bearer ${token}`)
        .send({ nombre: '  Banca plana  ' })
        .expect(200);

      expect(res.body.nombre).toBe('Banca plana');
      expect(res.body.nombreCatalogo).toBe('3/4 Sit-Up');
      expect(fakeAliasRepository.upsert).toHaveBeenCalledWith({
        profesorId: 'user-prof',
        exerciseId: 'ex-1',
        nombre: 'Banca plana',
        nombreNormalizado: 'banca plana',
      });
    });

    it('PUT alias como ALUMNO responde 403 y no escribe', async () => {
      const token = await firmarToken();
      await request(app.getHttpServer())
        .put('/exercises/ex-1/alias')
        .set('Authorization', `Bearer ${token}`)
        .send({ nombre: 'Banca plana' })
        .expect(403);

      expect(fakeAliasRepository.upsert).not.toHaveBeenCalled();
    });

    it('PUT alias con nombre vacío o ausente responde 400', async () => {
      const token = await firmarToken('auth-prof');
      await request(app.getHttpServer())
        .put('/exercises/ex-1/alias')
        .set('Authorization', `Bearer ${token}`)
        .send({ nombre: '   ' })
        .expect(400);
      await request(app.getHttpServer())
        .put('/exercises/ex-1/alias')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);

      expect(fakeAliasRepository.upsert).not.toHaveBeenCalled();
    });

    it('PUT alias de un ejercicio inexistente responde 404', async () => {
      const token = await firmarToken('auth-prof');
      const res = await request(app.getHttpServer())
        .put('/exercises/no-existe/alias')
        .set('Authorization', `Bearer ${token}`)
        .send({ nombre: 'Banca plana' })
        .expect(404);

      expect(res.body.error).toBe('ExerciseNotFoundError');
    });

    it('DELETE alias como PROFESOR responde 200 y borra su alias', async () => {
      const token = await firmarToken('auth-prof');
      await request(app.getHttpServer())
        .delete('/exercises/ex-1/alias')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(fakeAliasRepository.delete).toHaveBeenCalledWith('user-prof', 'ex-1');
    });

    it('DELETE alias como ALUMNO responde 403 y no borra', async () => {
      const token = await firmarToken();
      await request(app.getHttpServer())
        .delete('/exercises/ex-1/alias')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(fakeAliasRepository.delete).not.toHaveBeenCalled();
    });
  });
});
