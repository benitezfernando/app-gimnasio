import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { UsersController } from './users.controller';
import { CreateUserUseCase } from '../../application/create-user.use-case';
import { ListUsersUseCase } from '../../application/list-users.use-case';
import { DeactivateUserUseCase } from '../../application/deactivate-user.use-case';
import { GetUserDeletionImpactUseCase } from '../../application/get-user-deletion-impact.use-case';
import { DeleteUserPermanentlyUseCase } from '../../application/delete-user-permanently.use-case';
import { EditUserUseCase } from '../../application/edit-user.use-case';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
  UserRecord,
} from '../../application/ports/user-repository.port';
import { AUTH_PROVIDER, AuthProviderPort } from '../../application/ports/auth-provider.port';
import {
  CARTERA_REPOSITORY,
  CarteraRepositoryPort,
} from '../../application/ports/cartera-repository.port';
import {
  ROUTINES_CLEANUP,
  RoutinesCleanupPort,
} from '../../application/ports/routines-cleanup.port';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { GymScopeGuard } from '../guards/gym-scope.guard';
import { Role } from '../../domain/role';
import { DomainExceptionFilter } from '../../../shared-kernel/domain-exception.filter';
import { buildTestJwtKeys, signTestToken, TestJwtKeys } from '../guards/testing/jwt-test-support';

jest.mock('jose', () => {
  const actual = jest.requireActual('jose');
  return { ...actual, createRemoteJWKSet: jest.fn() };
});
const { createRemoteJWKSet: mockCreateRemoteJWKSet } = jest.requireMock('jose') as {
  createRemoteJWKSet: jest.Mock;
};

describe('PATCH /users/:id (e2e)', () => {
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
    nombre: 'Juan Perez',
    role: Role.ALUMNO,
    activo: true,
  };

  const usuariosPorAuthId: Record<string, UserRecord> = {
    'auth-admin': admin,
    'auth-alum': alumno,
  };

  const fakeUserRepository: Partial<UserRepositoryPort> = {
    findByAuthUserId: async (authUserId: string) => usuariosPorAuthId[authUserId] ?? null,
    findById: async (id: string) => {
      if (id === profesor.id) return profesor;
      if (id === alumno.id) return alumno;
      if (id === admin.id) return admin;
      return null;
    },
    updateNombre: async (id: string, nombre: string) => ({ ...profesor, id, nombre }),
  };
  const fakeAuthProvider: Partial<AuthProviderPort> = { updateStaffPassword: async () => {} };
  const fakeCarteraRepository: Partial<CarteraRepositoryPort> = { existe: async () => true };
  const fakeRoutinesCleanup: Partial<RoutinesCleanupPort> = {
    contarImpacto: async () => ({
      plantillasABorrar: 0,
      instanciasABorrar: 0,
      instanciasQueSobreviven: 0,
    }),
    eliminarDatosDe: async () => {},
  };
  const fakePrismaService: Partial<PrismaService> = {};

  beforeAll(async () => {
    claves = await buildTestJwtKeys();
    mockCreateRemoteJWKSet.mockReturnValue(claves.jwks);

    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        CreateUserUseCase,
        ListUsersUseCase,
        DeactivateUserUseCase,
        GetUserDeletionImpactUseCase,
        DeleteUserPermanentlyUseCase,
        EditUserUseCase,
        { provide: USER_REPOSITORY, useValue: fakeUserRepository },
        { provide: AUTH_PROVIDER, useValue: fakeAuthProvider },
        { provide: CARTERA_REPOSITORY, useValue: fakeCarteraRepository },
        { provide: ROUTINES_CLEANUP, useValue: fakeRoutinesCleanup },
        { provide: PrismaService, useValue: fakePrismaService },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: GymScopeGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainExceptionFilter());
    process.env.SUPABASE_URL = 'https://e2e-edit-user-test.supabase.co';
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function tokenPara(sub: string) {
    return signTestToken(claves.privateKey, { issuer: `${process.env.SUPABASE_URL}/auth/v1`, sub });
  }

  it('ADMIN edita el nombre de un PROFESOR de su gym', async () => {
    const token = await tokenPara('auth-admin');
    const res = await request(app.getHttpServer())
      .patch(`/users/${profesor.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Profe Editado' });

    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Profe Editado');
  });

  it('rechaza con 400 si el body no trae nombre ni password', async () => {
    const token = await tokenPara('auth-admin');
    const res = await request(app.getHttpServer())
      .patch(`/users/${profesor.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('ADMIN no puede editar a otro ADMIN', async () => {
    const token = await tokenPara('auth-admin');
    const res = await request(app.getHttpServer())
      .patch(`/users/${admin.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Otro Nombre' });

    expect(res.status).toBe(400);
  });

  it('ALUMNO no puede llamar a este endpoint', async () => {
    const token = await tokenPara('auth-alum');
    const res = await request(app.getHttpServer())
      .patch(`/users/${profesor.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'X' });

    expect(res.status).toBe(403);
  });
});
