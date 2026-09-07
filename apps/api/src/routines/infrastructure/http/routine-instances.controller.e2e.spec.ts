import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { RoutineInstancesController } from './routine-instances.controller';
import { AssignRoutineToAlumnoUseCase } from '../../application/assign-routine-to-alumno.use-case';
import { UpdateRoutineInstanceUseCase } from '../../application/update-routine-instance.use-case';
import { ReplaceInstanceExercisesUseCase } from '../../application/replace-instance-exercises.use-case';
import {
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateRepositoryPort,
} from '../../application/ports/routine-template-repository.port';
import {
  ROUTINE_INSTANCE_REPOSITORY,
  RoutineInstanceRepositoryPort,
  RoutineInstanceDetail,
} from '../../application/ports/routine-instance-repository.port';
import {
  CARTERA_REPOSITORY,
  CarteraRepositoryPort,
} from '../../../identity/application/ports/cartera-repository.port';
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

const TEST_SUPABASE_URL = 'https://e2e-routine-instances.supabase.co';

jest.mock('jose', () => {
  const actual = jest.requireActual('jose');
  return { ...actual, createRemoteJWKSet: jest.fn() };
});

const { createRemoteJWKSet: mockCreateRemoteJWKSet } = jest.requireMock('jose') as {
  createRemoteJWKSet: jest.Mock;
};

describe('/routine-instances (e2e)', () => {
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

  const instanciaBase: RoutineInstanceDetail = {
    id: 'inst-1',
    gymId: 'gym-A',
    profesorId: 'prof-1',
    alumnoId: 'alum-1',
    nombre: 'Full body',
    origenTemplateId: null,
    vigenteDesde: new Date(),
    vigenteHasta: null,
    activa: true,
    ejercicios: [],
  };

  const fakeInstanceRepository: RoutineInstanceRepositoryPort = {
    findVigentePorAlumno: jest.fn(async () => instanciaBase),
    findById: jest.fn(async (id: string) => (id === 'inst-1' ? instanciaBase : null)),
    crear: jest.fn(async (data) => ({ ...instanciaBase, ...data })),
    update: jest.fn(async (id, data) => ({ ...instanciaBase, id, ...data })),
    replaceExercises: jest.fn(async () => undefined),
  };

  const fakeTemplateRepository: Pick<RoutineTemplateRepositoryPort, 'findById'> = {
    findById: jest.fn(async () => null),
  };

  const fakeCarteraRepository: Pick<CarteraRepositoryPort, 'existe'> = {
    existe: jest.fn(async () => true),
  };

  const fakeUserRepository: Pick<UserRepositoryPort, 'findByAuthUserId' | 'findById'> = {
    findByAuthUserId: async (authUserId: string) => (authUserId === 'auth-prof' ? profesor : null),
    findById: async (id: string) => (id === 'alum-1' ? alumno : null),
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

  function firmarToken(): Promise<string> {
    return signTestToken(claves.privateKey, {
      issuer: `${TEST_SUPABASE_URL}/auth/v1`,
      sub: 'auth-prof',
    });
  }

  beforeAll(async () => {
    process.env.SUPABASE_URL = TEST_SUPABASE_URL;
    claves = await buildTestJwtKeys();
    mockCreateRemoteJWKSet.mockReturnValue(claves.jwks);

    const moduleRef = await Test.createTestingModule({
      controllers: [RoutineInstancesController],
      providers: [
        AssignRoutineToAlumnoUseCase,
        UpdateRoutineInstanceUseCase,
        ReplaceInstanceExercisesUseCase,
        { provide: ROUTINE_INSTANCE_REPOSITORY, useValue: fakeInstanceRepository },
        { provide: ROUTINE_TEMPLATE_REPOSITORY, useValue: fakeTemplateRepository },
        { provide: CARTERA_REPOSITORY, useValue: fakeCarteraRepository },
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

  it('PROFESOR arma una instancia desde cero — 201', async () => {
    const token = await firmarToken();
    const res = await request(app.getHttpServer())
      .post('/routine-instances')
      .set('Authorization', `Bearer ${token}`)
      .send({
        alumnoId: 'alum-1',
        nombre: 'Custom',
        ejercicios: [{ exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, descanso: 60 }],
      })
      .expect(201);

    expect(res.body).toMatchObject({ nombre: 'Custom' });
  });

  it('rechaza (400, ValidationPipe) si vienen origenTemplateId Y ejercicios juntos — no, el DTO permite ambos opcionales; el 400 real lo tira el caso de uso', async () => {
    const token = await firmarToken();
    const res = await request(app.getHttpServer())
      .post('/routine-instances')
      .set('Authorization', `Bearer ${token}`)
      .send({
        alumnoId: 'alum-1',
        nombre: 'Custom',
        origenTemplateId: 'tpl-1',
        ejercicios: [{ exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, descanso: 60 }],
      })
      .expect(400);

    expect(res.body.error).toBe('InvalidRoutineInstanceInputError');
  });

  it('rechaza (403, AlumnoNotInCarteraError) si el alumno no está en la cartera', async () => {
    (fakeCarteraRepository.existe as jest.Mock).mockResolvedValueOnce(false);
    const token = await firmarToken();
    const res = await request(app.getHttpServer())
      .post('/routine-instances')
      .set('Authorization', `Bearer ${token}`)
      .send({
        alumnoId: 'alum-1',
        nombre: 'Custom',
        ejercicios: [{ exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, descanso: 60 }],
      })
      .expect(403);

    expect(res.body.error).toBe('AlumnoNotInCarteraError');
  });
});
