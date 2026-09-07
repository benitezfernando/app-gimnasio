import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { RoutineTemplatesController } from './routine-templates.controller';
import { CreateRoutineTemplateUseCase } from '../../application/create-routine-template.use-case';
import { ListRoutineTemplatesUseCase } from '../../application/list-routine-templates.use-case';
import { GetRoutineTemplateUseCase } from '../../application/get-routine-template.use-case';
import { UpdateRoutineTemplateUseCase } from '../../application/update-routine-template.use-case';
import { ReplaceTemplateExercisesUseCase } from '../../application/replace-template-exercises.use-case';
import { DeleteRoutineTemplateUseCase } from '../../application/delete-routine-template.use-case';
import {
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateRepositoryPort,
  RoutineTemplateDetail,
} from '../../application/ports/routine-template-repository.port';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
  UserRecord,
} from '../../../identity/application/ports/user-repository.port';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepositoryPort,
} from '../../../exercise-catalog/application/ports/exercise-repository.port';
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

const TEST_SUPABASE_URL = 'https://e2e-routine-templates.supabase.co';

jest.mock('jose', () => {
  const actual = jest.requireActual('jose');
  return { ...actual, createRemoteJWKSet: jest.fn() };
});

const { createRemoteJWKSet: mockCreateRemoteJWKSet } = jest.requireMock('jose') as {
  createRemoteJWKSet: jest.Mock;
};

describe('/routine-templates (e2e)', () => {
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

  const templateBase: RoutineTemplateDetail = {
    id: 'tpl-1',
    gymId: 'gym-A',
    profesorId: 'prof-1',
    nombre: 'Full body',
    descripcion: null,
    activa: false,
    ejercicios: [],
  };

  const fakeTemplateRepository: RoutineTemplateRepositoryPort = {
    findByProfesor: jest.fn(async () => [templateBase]),
    findById: jest.fn(async (id: string) => (id === 'tpl-1' ? templateBase : null)),
    create: jest.fn(async (data) => ({ id: 'tpl-2', activa: true, ...data })),
    update: jest.fn(async (id, data) => ({ ...templateBase, id, ...data })),
    delete: jest.fn(async () => undefined),
    replaceExercises: jest.fn(async () => undefined),
  };

  const fakeUserRepository: Pick<UserRepositoryPort, 'findByAuthUserId'> = {
    findByAuthUserId: async (authUserId: string) => {
      if (authUserId === 'auth-prof') return profesor;
      if (authUserId === 'auth-alum') return alumno;
      return null;
    },
  };

  const fakeExerciseRepository: Pick<ExerciseRepositoryPort, 'findByIds'> = {
    findByIds: jest.fn(async (ids: string[]) =>
      ids
        .filter((id) => id === 'ex-1')
        .map((id) => ({
          id,
          nombre: 'Ejercicio',
          imageUrl: null,
          gifUrl: null,
          parteCuerpo: 'pecho',
          grupoMuscular: 'pectoral',
          equipamiento: null,
        })),
    ),
  };

  function firmarTokenPara(sub: string): Promise<string> {
    return signTestToken(claves.privateKey, { issuer: `${TEST_SUPABASE_URL}/auth/v1`, sub });
  }

  beforeAll(async () => {
    process.env.SUPABASE_URL = TEST_SUPABASE_URL;
    claves = await buildTestJwtKeys();
    mockCreateRemoteJWKSet.mockReturnValue(claves.jwks);

    const moduleRef = await Test.createTestingModule({
      controllers: [RoutineTemplatesController],
      providers: [
        CreateRoutineTemplateUseCase,
        ListRoutineTemplatesUseCase,
        GetRoutineTemplateUseCase,
        UpdateRoutineTemplateUseCase,
        ReplaceTemplateExercisesUseCase,
        DeleteRoutineTemplateUseCase,
        { provide: ROUTINE_TEMPLATE_REPOSITORY, useValue: fakeTemplateRepository },
        { provide: USER_REPOSITORY, useValue: fakeUserRepository },
        { provide: EXERCISE_REPOSITORY, useValue: fakeExerciseRepository },
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

  afterAll(async () => {
    await app.close();
  });

  it('rechaza sin token (401)', async () => {
    await request(app.getHttpServer()).get('/routine-templates').expect(401);
  });

  it('un ALUMNO no puede acceder (403) — el controller entero es @Roles(PROFESOR)', async () => {
    const token = await firmarTokenPara('auth-alum');
    await request(app.getHttpServer())
      .get('/routine-templates')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('PROFESOR crea una plantilla — 201', async () => {
    const token = await firmarTokenPara('auth-prof');
    const res = await request(app.getHttpServer())
      .post('/routine-templates')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Piernas' })
      .expect(201);

    expect(res.body).toMatchObject({ nombre: 'Piernas' });
  });

  it('rechaza el borrado (409) si la plantilla está activa', async () => {
    (fakeTemplateRepository.findById as jest.Mock).mockResolvedValueOnce({
      ...templateBase,
      activa: true,
    });
    const token = await firmarTokenPara('auth-prof');
    await request(app.getHttpServer())
      .delete('/routine-templates/tpl-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });

  it('acepta el borrado (204) si la plantilla ya está desactivada', async () => {
    const token = await firmarTokenPara('auth-prof');
    await request(app.getHttpServer())
      .delete('/routine-templates/tpl-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
  });

  it('rechaza más de 50 ejercicios en el replace-all (400, ValidationPipe)', async () => {
    const token = await firmarTokenPara('auth-prof');
    const cincuentaYUno = Array.from({ length: 51 }, (_, i) => ({
      exerciseId: 'ex-1',
      orden: i + 1,
      series: 3,
      repeticiones: 10,
      descanso: 60,
    }));
    await request(app.getHttpServer())
      .put('/routine-templates/tpl-1/exercises')
      .set('Authorization', `Bearer ${token}`)
      .send({ ejercicios: cincuentaYUno })
      .expect(400);
  });
});
