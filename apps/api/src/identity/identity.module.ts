import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { USER_REPOSITORY } from './application/ports/user-repository.port';
import { AUTH_PROVIDER } from './application/ports/auth-provider.port';
import { CARTERA_REPOSITORY } from './application/ports/cartera-repository.port';
import { CreateUserUseCase } from './application/create-user.use-case';
import { LoginUseCase } from './application/login.use-case';
import { RefreshSessionUseCase } from './application/refresh-session.use-case';
import { ListUsersUseCase } from './application/list-users.use-case';
import { DeactivateUserUseCase } from './application/deactivate-user.use-case';
import { AssignProfesorToAlumnoUseCase } from './application/cartera/assign-profesor-to-alumno.use-case';
import { RemoveProfesorFromAlumnoUseCase } from './application/cartera/remove-profesor-from-alumno.use-case';
import { ListCarteraUseCase } from './application/cartera/list-cartera.use-case';
import { ListProfesoresDeAlumnoUseCase } from './application/cartera/list-profesores-de-alumno.use-case';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { PrismaCarteraRepository } from './infrastructure/persistence/prisma-cartera.repository';
import { SupabaseAdminAuthProvider } from './infrastructure/auth/supabase-admin-auth.provider';
import { UsersController } from './infrastructure/http/users.controller';
import { AuthController } from './infrastructure/http/auth.controller';
import { CarteraController } from './infrastructure/http/cartera.controller';
import { JwtAuthGuard } from './infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from './infrastructure/guards/roles.guard';
import { GymScopeGuard } from './infrastructure/guards/gym-scope.guard';
import { LoginRateLimitGuard } from './infrastructure/guards/login-rate-limit.guard';

@Module({
  imports: [],
  controllers: [UsersController, AuthController, CarteraController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: AUTH_PROVIDER, useClass: SupabaseAdminAuthProvider },
    { provide: CARTERA_REPOSITORY, useClass: PrismaCarteraRepository },
    CreateUserUseCase,
    LoginUseCase,
    RefreshSessionUseCase,
    ListUsersUseCase,
    DeactivateUserUseCase,
    AssignProfesorToAlumnoUseCase,
    RemoveProfesorFromAlumnoUseCase,
    ListCarteraUseCase,
    ListProfesoresDeAlumnoUseCase,
    LoginRateLimitGuard,
    // Guards globales, en orden: autenticación -> rol -> scoping por gym.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: GymScopeGuard },
  ],
  exports: [USER_REPOSITORY, CARTERA_REPOSITORY],
})
export class IdentityModule {}
