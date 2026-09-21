import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../domain/role';
import { AUTH_PROVIDER, AuthProviderPort, AuthSession } from './ports/auth-provider.port';
import { USER_REPOSITORY, UserRepositoryPort } from './ports/user-repository.port';
import { InvalidCredentialsError } from './errors/invalid-credentials.error';
import { PLATFORM_PSEUDO_GYM_ID } from '../infrastructure/auth/synthetic-credentials';

export interface SuperAdminLoginInput {
  username: string;
  password: string;
}

/**
 * Login exclusivo de SUPER_ADMIN — nunca pide gymId (a diferencia de
 * LoginUseCase). Arma el email sintético con PLATFORM_PSEUDO_GYM_ID.
 * Verifica además que el User resuelto sea efectivamente SUPER_ADMIN:
 * nadie más puede tener ese email reservado en circunstancias normales
 * (CreateAdminUseCase, Task 7, impide que un ADMIN normal use ese gymId),
 * pero el chequeo es defensa en profundidad barata.
 */
@Injectable()
export class SuperAdminLoginUseCase {
  constructor(
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProviderPort,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
  ) {}

  async execute(input: SuperAdminLoginInput): Promise<AuthSession> {
    let session: AuthSession;
    try {
      session = await this.authProvider.signInStaff(
        PLATFORM_PSEUDO_GYM_ID,
        input.username,
        input.password,
      );
    } catch {
      throw new InvalidCredentialsError();
    }

    const user = await this.userRepository.findByAuthUserId(session.authUserId);
    if (!user || !user.activo || user.role !== Role.SUPER_ADMIN) {
      throw new InvalidCredentialsError();
    }

    return session;
  }
}
