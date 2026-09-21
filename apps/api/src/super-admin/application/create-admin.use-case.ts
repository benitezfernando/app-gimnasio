import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../identity/domain/role';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
  UserRecord,
} from '../../identity/application/ports/user-repository.port';
import {
  AUTH_PROVIDER,
  AuthProviderPort,
} from '../../identity/application/ports/auth-provider.port';
import { PLATFORM_PSEUDO_GYM_ID } from '../../identity/infrastructure/auth/synthetic-credentials';
import { ReservedGymIdError } from './errors/reserved-gym-id.error';

export interface CreateAdminInput {
  gymId: string;
  username: string;
  nombre: string;
  password: string;
}

/**
 * Único camino HTTP para crear un ADMIN (antes solo existía el script
 * `prisma/seed-admin.ts`, corrido a mano). No valida el gymId contra
 * ningún catálogo (no hay tabla Gym) — el SUPER_ADMIN lo escribe a mano;
 * este ADMIN nuevo propaga ese mismo gymId a todo lo que cree después.
 */
@Injectable()
export class CreateAdminUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProviderPort,
  ) {}

  async execute(input: CreateAdminInput): Promise<UserRecord> {
    if (input.gymId === PLATFORM_PSEUDO_GYM_ID) {
      throw new ReservedGymIdError(input.gymId);
    }

    const { authUserId } = await this.authProvider.createStaffUser(
      input.gymId,
      input.username,
      input.password,
    );

    try {
      return await this.userRepository.create({
        gymId: input.gymId,
        authUserId,
        username: input.username,
        nombre: input.nombre,
        role: Role.ADMIN,
      });
    } catch (error) {
      try {
        await this.authProvider.deleteAuthUser(authUserId);
      } catch {
        // Swallow: la compensación es best-effort, el error original manda.
      }
      throw error;
    }
  }
}
