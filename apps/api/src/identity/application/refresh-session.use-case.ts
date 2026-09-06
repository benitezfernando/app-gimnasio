import { Inject, Injectable } from '@nestjs/common';
import { AUTH_PROVIDER, AuthProviderPort, AuthSession } from './ports/auth-provider.port';
import { USER_REPOSITORY, UserRepositoryPort } from './ports/user-repository.port';
import { InvalidCredentialsError } from './errors/invalid-credentials.error';
import { verifyActiveUser } from './verify-active-user';

export interface RefreshSessionInput {
  refreshToken: string;
}

/**
 * Refresca una sesión de Supabase a partir de un refresh_token. Cualquier
 * falla del provider (token inválido, expirado, o ya rotado por un refresh
 * concurrente anterior) se traduce al mismo InvalidCredentialsError
 * genérico que usa LoginUseCase — un refresh fallido tiene que forzar un
 * re-login limpio del lado del cliente, nunca un loop ni un mensaje que
 * distinga el motivo exacto de la falla.
 *
 * La deduplicación de refresh_token concurrentes (dos requests casi
 * simultáneas con el MISMO refresh_token, donde Supabase invalida el
 * primero al usarlo) es responsabilidad del adaptador
 * (SupabaseAdminAuthProvider), no de este caso de uso — acá solo se
 * orquesta el flujo y el chequeo de activo.
 */
@Injectable()
export class RefreshSessionUseCase {
  constructor(
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProviderPort,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
  ) {}

  async execute(input: RefreshSessionInput): Promise<AuthSession> {
    let session: AuthSession;
    try {
      session = await this.authProvider.refreshSession(input.refreshToken);
    } catch {
      throw new InvalidCredentialsError();
    }

    await verifyActiveUser(this.userRepository, session.authUserId);

    return session;
  }
}
