import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { GymScopeGuard } from './guards/gym-scope.guard';
import { Roles } from './decorators/roles.decorator';
import { Public } from './decorators/public.decorator';
import { Role } from '../domain/role';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
  UserRecord,
} from '../application/ports/user-repository.port';

const TEST_SECRET = 'e2e-test-secret';
const TEST_SUPABASE_URL = 'https://e2e-test.supabase.co';

@Controller('test')
class GuardChainTestController {
  @Get('admin-only')
  @Roles(Role.ADMIN)
  adminOnly() {
    return { ok: true };
  }

  @Get('scoped/:gymId')
  scoped() {
    return { ok: true };
  }

  @Get('public')
  @Public()
  publicRoute() {
    return { ok: true };
  }
}

function firmarToken(sub: string): string {
  return jwt.sign({ sub }, TEST_SECRET, {
    audience: 'authenticated',
    issuer: `${TEST_SUPABASE_URL}/auth/v1`,
    expiresIn: '1h',
  });
}

describe('Cadena de guards (e2e): JwtAuthGuard -> RolesGuard -> GymScopeGuard', () => {
  let app: INestApplication;

  const usuarios: Record<string, UserRecord> = {
    'auth-admin': {
      id: 'user-admin',
      authUserId: 'auth-admin',
      gymId: 'gym-A',
      username: 'admin1',
      nombre: 'Admin',
      role: Role.ADMIN,
      activo: true,
    },
    'auth-alumno': {
      id: 'user-alumno',
      authUserId: 'auth-alumno',
      gymId: 'gym-A',
      username: 'juan.perez',
      nombre: 'Juan',
      role: Role.ALUMNO,
      activo: true,
    },
    'auth-desactivado': {
      id: 'user-desactivado',
      authUserId: 'auth-desactivado',
      gymId: 'gym-A',
      username: 'baja1',
      nombre: 'Baja',
      role: Role.ADMIN,
      activo: false,
    },
  };

  const fakeUserRepository: Pick<UserRepositoryPort, 'findByAuthUserId'> = {
    findByAuthUserId: async (authUserId: string) => usuarios[authUserId] ?? null,
  };

  beforeAll(async () => {
    process.env.SUPABASE_JWT_SECRET = TEST_SECRET;
    process.env.SUPABASE_URL = TEST_SUPABASE_URL;

    const moduleRef = await Test.createTestingModule({
      controllers: [GuardChainTestController],
      providers: [
        { provide: USER_REPOSITORY, useValue: fakeUserRepository },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: GymScopeGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rechaza sin token (401)', async () => {
    await request(app.getHttpServer()).get('/test/admin-only').expect(401);
  });

  it('permite una ruta @Public() sin token (200)', async () => {
    await request(app.getHttpServer()).get('/test/public').expect(200);
  });

  it('rechaza con rol insuficiente (403)', async () => {
    await request(app.getHttpServer())
      .get('/test/admin-only')
      .set('Authorization', `Bearer ${firmarToken('auth-alumno')}`)
      .expect(403);
  });

  it('rechaza a un usuario desactivado (401), aunque el rol sea correcto', async () => {
    await request(app.getHttpServer())
      .get('/test/admin-only')
      .set('Authorization', `Bearer ${firmarToken('auth-desactivado')}`)
      .expect(401);
  });

  it('permite con el rol correcto (200)', async () => {
    await request(app.getHttpServer())
      .get('/test/admin-only')
      .set('Authorization', `Bearer ${firmarToken('auth-admin')}`)
      .expect(200);
  });

  it('rechaza acceso a un gym distinto en la URL (403)', async () => {
    await request(app.getHttpServer())
      .get('/test/scoped/gym-B')
      .set('Authorization', `Bearer ${firmarToken('auth-admin')}`)
      .expect(403);
  });

  it('permite acceso al propio gym en la URL (200)', async () => {
    await request(app.getHttpServer())
      .get('/test/scoped/gym-A')
      .set('Authorization', `Bearer ${firmarToken('auth-admin')}`)
      .expect(200);
  });
});
