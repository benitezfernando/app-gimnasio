import { Role } from '../domain/role';
import { AuthenticatedUser } from '../domain/authenticated-user';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { CarteraRepositoryPort } from './ports/cartera-repository.port';
import { resolveUserInGym } from './resolve-user-in-gym';
import { requireGymId } from './require-gym-id';
import { InsufficientRoleError } from './errors/insufficient-role.error';
import { CannotTargetAdminError } from './errors/cannot-target-admin.error';
import { UserNotFoundError } from './errors/user-not-found.error';
import { AlumnoNotInCarteraError } from '../../routines/application/errors/alumno-not-in-cartera.error';

const ROLES_QUE_PUEDEN_GESTIONAR: Role[] = [Role.ADMIN, Role.PROFESOR];

/**
 * Autoriza y resuelve el objetivo de una baja, reactivación o eliminación
 * definitiva: el ADMIN puede sobre cualquier usuario de su gym salvo otros
 * admins; el PROFESOR solo sobre alumnos de su cartera (sobre cualquier otro
 * usuario responde como si no existiera, igual que `EditUserUseCase`).
 */
export async function resolverAlumnoGestionable(
  userRepository: UserRepositoryPort,
  carteraRepository: CarteraRepositoryPort,
  invocadoPor: AuthenticatedUser,
  userId: string,
): Promise<UserRecord> {
  if (!ROLES_QUE_PUEDEN_GESTIONAR.includes(invocadoPor.role)) {
    throw new InsufficientRoleError(invocadoPor.role, ROLES_QUE_PUEDEN_GESTIONAR);
  }

  const objetivo = await resolveUserInGym(userRepository, userId, requireGymId(invocadoPor));
  if (objetivo.role === Role.ADMIN) {
    throw new CannotTargetAdminError(objetivo.id);
  }

  if (invocadoPor.role === Role.PROFESOR) {
    if (objetivo.role !== Role.ALUMNO) {
      throw new UserNotFoundError(objetivo.id);
    }
    if (!(await carteraRepository.existe(invocadoPor.id, objetivo.id))) {
      throw new AlumnoNotInCarteraError(objetivo.id);
    }
  }

  return objetivo;
}
