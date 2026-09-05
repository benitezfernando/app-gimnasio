import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { USER_REPOSITORY } from './application/ports/user-repository.port';
import { AUTH_PROVIDER } from './application/ports/auth-provider.port';
import { InviteUserUseCase } from './application/invite-user.use-case';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { SupabaseAdminAuthProvider } from './infrastructure/auth/supabase-admin-auth.provider';
import { JwtAuthGuard } from './infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from './infrastructure/guards/roles.guard';
import { GymScopeGuard } from './infrastructure/guards/gym-scope.guard';

@Module({
  imports: [],
  controllers: [],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: AUTH_PROVIDER, useClass: SupabaseAdminAuthProvider },
    InviteUserUseCase,
    // Guards globales, en orden: autenticación -> rol -> scoping por gym.
    // El orden importa: RolesGuard y GymScopeGuard asumen que req.user ya
    // fue seteado por JwtAuthGuard.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: GymScopeGuard },
  ],
  exports: [USER_REPOSITORY, InviteUserUseCase],
})
export class IdentityModule {}
