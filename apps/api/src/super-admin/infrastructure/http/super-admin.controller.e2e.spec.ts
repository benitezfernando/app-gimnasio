import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { SuperAdminController } from './super-admin.controller';
import { CreateAdminUseCase } from '../../application/create-admin.use-case';
import { ListAdminsUseCase } from '../../application/list-admins.use-case';
import { EditAdminUseCase } from '../../application/edit-admin.use-case';
import { DeactivateAdminUseCase } from '../../application/deactivate-admin.use-case';
import { DeleteAdminPermanentlyUseCase } from '../../application/delete-admin-permanently.use-case';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
  UserRecord,
} from '../../../identity/application/ports/user-repository.port';
import {
  AUTH_PROVIDER,
  AuthProviderPort,
} from '../../../identity/application/ports/auth-provider.port';
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

jest.mock('jose', () => {
  const actual = jest.requireActual('jose');
  return { ...actual, createRemoteJWKSet: jest.fn() };
});
const { createRemoteJWKSet: mockCreateRemoteJWKSet } = jest.requireMock('jose') as {
  createRemoteJWKSet: jest.Mock;
};

describe('/super-admin/admins (e2e)', () => {
  let app: INestApplication;
  let claves: TestJwtKeys;

  const superAdmin: UserRecord = {
    id: 'sa-1',
    authUserId: 'auth-sa',
    gymId: null,
    username: 'root',
    nombre: 'Root',
    role: Role.SUPER_ADMIN,
    activo: true,
  };
  const adminNormal: UserRecord = {
    id: 'admin-1',
    authUserId: 'auth-admin',
    gymId: 'gym-A',
    username: 'admin1',
    nombre: 'Admin',
    role: Role.ADMIN,
    activo: true,
  };
  const adminsExistentes = [
    {
      id: 'admin-1',
      authUserId: 'auth-admin',
      gymId: 'gym-A',
      username: 'admin1',
      nombre: 'Admin',
      role: Role.ADMIN,
      activo: true,
    },
    {
      id: 'admin-2',
      authUserId: 'auth-admin2',
      gymId: 'gym-B',
      username: 'admin2',
      nombre: 'Admin Dos',
      role: Role.ADMIN,
      activo: true,
    },
  ];

  const adminInactivo: UserRecord = {
    id: 'admin-inactivo',
    authUserId: 'auth-admin-inactivo',
    gymId: 'gym-A',
    username: 'admin-inactivo',
    nombre: 'Admin Inactivo',
    role: Role.ADMIN,
    activo: false,
  };

  const usuariosPorAuthId: Record<string, UserRecord> = {
    'auth-sa': superAdmin,
    'auth-admin': adminNormal,
  };
  const usuariosPorId: Record<string, UserRecord> = {
    'admin-1': adminNormal,
    'admin-inactivo': adminInactivo,
  };

  const fakeUserRepository: Partial<UserRepositoryPort> = {
    findByAuthUserId: async (authUserId: string) => usuariosPorAuthId[authUserId] ?? null,
    findByGymIdAndUsername: async () => null,
    findById: async (id: string) => usuariosPorId[id] ?? null,
    deactivate: async (id: string) => ({ ...usuariosPorId[id], activo: false }),
    create: async (data) => ({ id: 'admin-nuevo', activo: true, ...data }),
  };
  const fakeAuthProvider: Partial<AuthProviderPort> = {
    createStaffUser: async () => ({ authUserId: 'auth-nuevo-admin' }),
    deleteAuthUser: async () => {},
  };
  const fakePrisma = {
    user: {
      findMany: jest.fn().mockResolvedValue(adminsExistentes),
      delete: jest.fn().mockResolvedValue(adminInactivo),
    },
  };

  beforeAll(async () => {
    claves = await buildTestJwtKeys();
    mockCreateRemoteJWKSet.mockReturnValue(claves.jwks);
    process.env.SUPABASE_URL = 'https://e2e-super-admin-test.supabase.co';

    const moduleRef = await Test.createTestingModule({
      controllers: [SuperAdminController],
      providers: [
        CreateAdminUseCase,
        ListAdminsUseCase,
        EditAdminUseCase,
        DeactivateAdminUseCase,
        DeleteAdminPermanentlyUseCase,
        { provide: USER_REPOSITORY, useValue: fakeUserRepository },
        { provide: AUTH_PROVIDER, useValue: fakeAuthProvider },
        { provide: PrismaService, useValue: fakePrisma },
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

  async function tokenPara(sub: string) {
    return signTestToken(claves.privateKey, { issuer: `${process.env.SUPABASE_URL}/auth/v1`, sub });
  }

  it('SUPER_ADMIN crea un ADMIN nuevo', async () => {
    const token = await tokenPara('auth-sa');
    const res = await request(app.getHttpServer())
      .post('/super-admin/admins')
      .set('Authorization', `Bearer ${token}`)
      .send({
        gymId: 'gym-nuevo',
        username: 'nuevoadmin',
        nombre: 'Nuevo Admin',
        password: 'segura123',
      });

    expect(res.status).toBe(201);
    expect(res.body.gymId).toBe('gym-nuevo');
  });

  it('un ADMIN normal no puede llamar a /super-admin/admins', async () => {
    const token = await tokenPara('auth-admin');
    const res = await request(app.getHttpServer())
      .get('/super-admin/admins')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('GET /super-admin/admins devuelve admins de distintos gyms', async () => {
    const token = await tokenPara('auth-sa');
    const res = await request(app.getHttpServer())
      .get('/super-admin/admins')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.map((a: { gymId: string }) => a.gymId)).toEqual(['gym-A', 'gym-B']);
  });

  it('SUPER_ADMIN desactiva un ADMIN', async () => {
    const token = await tokenPara('auth-sa');
    const res = await request(app.getHttpServer())
      .patch('/super-admin/admins/admin-1/deactivate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.activo).toBe(false);
  });

  it('SUPER_ADMIN elimina definitivamente un ADMIN ya desactivado', async () => {
    const token = await tokenPara('auth-sa');
    const res = await request(app.getHttpServer())
      .delete('/super-admin/admins/admin-inactivo/permanent')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('un ADMIN normal no puede desactivar ni eliminar por esta vía', async () => {
    const token = await tokenPara('auth-admin');
    const res = await request(app.getHttpServer())
      .patch('/super-admin/admins/admin-1/deactivate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
