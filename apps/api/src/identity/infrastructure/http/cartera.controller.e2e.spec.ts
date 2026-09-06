import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { CarteraController } from './cartera.controller';
import { AssignProfesorToAlumnoUseCase } from '../../application/cartera/assign-profesor-to-alumno.use-case';
import { RemoveProfesorFromAlumnoUseCase } from '../../application/cartera/remove-profesor-from-alumno.use-case';
import { ListCarteraUseCase } from '../../application/cartera/list-cartera.use-case';
import { ListProfesoresDeAlumnoUseCase } from '../../application/cartera/list-profesores-de-alumno.use-case';
import {
  CARTERA_REPOSITORY,
  CarteraRepositoryPort,
} from '../../application/ports/cartera-repository.port';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
  UserRecord,
} from '../../application/ports/user-repository.port';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { GymScopeGuard } from '../guards/gym-scope.guard';
import { Role } from '../../domain/role';
import { DomainExceptionFilter } from '../../../shared-kernel/domain-exception.filter';
import { buildTestJwtKeys, signTestToken, TestJwtKeys } from '../guards/testing/jwt-test-support';

const TEST_SUPABASE_URL = 'https://e2e-cartera-test.supabase.co';

jest.mock('jose', () => {
  const actual = jest.requireActual('jose');
  return { ...actual, createRemoteJWKSet: jest.fn() };
});

const { createRemoteJWKSet: mockCreateRemoteJWKSet } = jest.requireMock('jose') as {
  createRemoteJWKSet: jest.Mock;
};

describe('/users/:alumnoId/profesores (e2e)', () => {
  let app: INestApplication;
  let claves: TestJwtKeys;

  const admin: UserRecord = {
    id: 'admin-1',
    authUserId: 'auth-admin',
    gymId: 'gym-A',
    username: 'admin1',
    nombre: 'Admin',
    role: Role.ADMIN,
    activo: true,
  };

  const profesorInvocador: UserRecord = {
    id: 'prof-1',
    authUserId: 'auth-prof',
    gymId: 'gym-A',
    username: 'prof1',
    nombre: 'Profe',
    role: Role.PROFESOR,
    activo: true,
  };

  const profesorAsignado: UserRecord = {
    id: 'prof-2',
    authUserId: 'auth-prof2',
    gymId: 'gym-A',
    username: 'prof2',
    nombre: 'Profe Dos',
    role: Role.PROFESOR,
    activo: true,
  };

  const alumno: UserRecord = {
    id: 'alum-1',
    authUserId: 'auth-alum',
    gymId: 'gym-A',
    username: 'juan.perez',
    nombre: 'Juan Perez',
    role: Role.ALUMNO,
    activo: true,
  };

  const usuariosPorAuthId: Record<string, UserRecord> = {
    'auth-admin': admin,
    'auth-prof': profesorInvocador,
  };

  const fakeUserRepository: Pick<UserRepositoryPort, 'findByAuthUserId' | 'findById'> = {
    findByAuthUserId: async (authUserId: string) => usuariosPorAuthId[authUserId] ?? null,
    findById: async (id: string) => {
      if (id === profesorAsignado.id) return profesorAsignado;
      if (id === alumno.id) return alumno;
      return null;
    },
  };

  const fakeCarteraRepository: CarteraRepositoryPort = {
    existe: jest.fn(async () => false),
    crear: jest.fn(async (data) => ({ id: 'link-1', ...data, asignadoEn: new Date() })),
    eliminar: jest.fn(async () => undefined),
    findAlumnosDeProfesor: jest.fn(async () => [alumno]),
    findProfesoresDeAlumno: jest.fn(async () => [profesorAsignado]),
  };

  function firmarTokenPara(sub: string): Promise<string> {
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
      controllers: [CarteraController],
      providers: [
        AssignProfesorToAlumnoUseCase,
        RemoveProfesorFromAlumnoUseCase,
        ListCarteraUseCase,
        ListProfesoresDeAlumnoUseCase,
        { provide: CARTERA_REPOSITORY, useValue: fakeCarteraRepository },
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

  afterAll(async () => {
    await app.close();
  });

  it('rechaza sin token (401)', async () => {
    await request(app.getHttpServer()).post('/users/alum-1/profesores').expect(401);
  });

  it('un PROFESOR no puede asignar cartera (403) — es exclusivo de ADMIN', async () => {
    const token = await firmarTokenPara('auth-prof');
    await request(app.getHttpServer())
      .post('/users/alum-1/profesores')
      .set('Authorization', `Bearer ${token}`)
      .send({ profesorId: 'prof-2' })
      .expect(403);
  });

  it('ADMIN asigna un profesor a un alumno — 201 con el vínculo creado', async () => {
    const token = await firmarTokenPara('auth-admin');
    const res = await request(app.getHttpServer())
      .post('/users/alum-1/profesores')
      .set('Authorization', `Bearer ${token}`)
      .send({ profesorId: 'prof-2' })
      .expect(201);

    expect(res.body).toMatchObject({ profesorId: 'prof-2', alumnoId: 'alum-1' });
  });

  it('body sin profesorId es rechazado por el ValidationPipe (400)', async () => {
    const token = await firmarTokenPara('auth-admin');
    await request(app.getHttpServer())
      .post('/users/alum-1/profesores')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);
  });

  it('ADMIN quita un profesor de un alumno — 204 sin body', async () => {
    (fakeCarteraRepository.existe as jest.Mock).mockResolvedValueOnce(true);
    const token = await firmarTokenPara('auth-admin');
    await request(app.getHttpServer())
      .delete('/users/alum-1/profesores/prof-2')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
  });

  it('ADMIN lista los profesores de un alumno', async () => {
    const token = await firmarTokenPara('auth-admin');
    const res = await request(app.getHttpServer())
      .get('/users/alum-1/profesores')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual([
      {
        id: 'prof-2',
        gymId: 'gym-A',
        username: 'prof2',
        nombre: 'Profe Dos',
        role: 'PROFESOR',
        activo: true,
      },
    ]);
  });

  it('PROFESOR lista su propia cartera vía /users/me/alumnos', async () => {
    const token = await firmarTokenPara('auth-prof');
    const res = await request(app.getHttpServer())
      .get('/users/me/alumnos')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual([
      {
        id: 'alum-1',
        gymId: 'gym-A',
        username: 'juan.perez',
        nombre: 'Juan Perez',
        role: 'ALUMNO',
        activo: true,
      },
    ]);
  });

  it('ADMIN no puede ver /users/me/alumnos (403) — es exclusivo de PROFESOR', async () => {
    const token = await firmarTokenPara('auth-admin');
    await request(app.getHttpServer())
      .get('/users/me/alumnos')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});
