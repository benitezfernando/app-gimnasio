import { UserRepositoryPort } from './ports/user-repository.port';
import { InvalidCredentialsError } from './errors/invalid-credentials.error';

/**
 * Chequeo compartido entre LoginUseCase y RefreshSessionUseCase: el `User`
 * interno correspondiente al `authUserId` de la sesión de Supabase debe
 * existir y estar activo. Se aplica SIEMPRE después de que Supabase ya
 * autenticó/refrescó la sesión (nunca antes) para no reabrir el canal de
 * enumeración — un authUserId sin User interno y uno desactivado fallan
 * con el mismo error genérico, en el mismo punto del flujo.
 */
export async function verifyActiveUser(
  userRepository: UserRepositoryPort,
  authUserId: string,
): Promise<void> {
  const user = await userRepository.findByAuthUserId(authUserId);
  if (!user || !user.activo) {
    throw new InvalidCredentialsError();
  }
}
