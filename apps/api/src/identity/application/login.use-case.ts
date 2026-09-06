import { Inject, Injectable } from '@nestjs/common';
import { AUTH_PROVIDER, AuthProviderPort, AuthSession } from './ports/auth-provider.port';
import { USER_REPOSITORY, UserRepositoryPort } from './ports/user-repository.port';
import { InvalidCredentialsError } from './errors/invalid-credentials.error';
import { verifyActiveUser } from './verify-active-user';

export interface LoginInput {
  gymId: string;
  username: string;
  password?: string;
}

/**
 * Ramificado por presencia de `password`: si viene, es un intento de
 * ADMIN/PROFESOR; si no, de ALUMNO (password derivada, resuelta
 * internamente por el AuthProviderPort). No hace falta un lookup previo
 * de a qué rol pertenece el username — la rama equivocada simplemente
 * falla igual que una password mal tipeada (evita enumeración). El error
 * siempre es genérico, nunca revela si el username existe.
 *
 * Después de una autenticación exitosa en Supabase, se verifica que el
 * `User` interno correspondiente exista y esté `activo`. Esta verificación
 * va SIEMPRE después del intento de auth (nunca antes) para no reabrir el
 * canal de enumeración: un username inexistente y un username desactivado
 * deben fallar con el mismo error genérico, en el mismo punto del flujo.
 */
@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProviderPort,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
  ) {}

  async execute(input: LoginInput): Promise<AuthSession> {
    let session: AuthSession;
    try {
      if (input.password !== undefined) {
        session = await this.authProvider.signInStaff(input.gymId, input.username, input.password);
      } else {
        session = await this.authProvider.signInAlumno(input.gymId, input.username);
      }
    } catch {
      throw new InvalidCredentialsError();
    }

    await verifyActiveUser(this.userRepository, session.authUserId);

    return session;
  }
}
