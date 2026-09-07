import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { UserNotFoundError } from './errors/user-not-found.error';

/**
 * Resuelve un usuario por id y valida que sea del gym del invocador, en un
 * solo paso — patrón repetido en Cartera (3A) y ahora en Routines/hard-delete.
 * Un usuario de otro gym responde igual que uno inexistente (HLD §4,
 * convención anti-enumeración): nunca hay que distinguir los dos casos.
 */
export async function resolveUserInGym(
  userRepository: UserRepositoryPort,
  userId: string,
  gymId: string,
): Promise<UserRecord> {
  const user = await userRepository.findById(userId);
  if (!user || user.gymId !== gymId) {
    throw new UserNotFoundError(userId);
  }
  return user;
}
