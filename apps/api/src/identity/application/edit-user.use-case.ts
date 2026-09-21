import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../domain/role';
import { AuthenticatedUser } from '../domain/authenticated-user';
import { USER_REPOSITORY, UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { AUTH_PROVIDER, AuthProviderPort } from './ports/auth-provider.port';
import { CARTERA_REPOSITORY, CarteraRepositoryPort } from './ports/cartera-repository.port';
import { resolveUserInGym } from './resolve-user-in-gym';
import { requireGymId } from './require-gym-id';
import { InsufficientRoleError } from './errors/insufficient-role.error';
import { CannotEditAdminError } from './errors/cannot-edit-admin.error';
import { AlumnoHasNoPasswordError } from './errors/alumno-has-no-password.error';
import { UserNotFoundError } from './errors/user-not-found.error';
import { AlumnoNotInCarteraError } from '../../routines/application/errors/alumno-not-in-cartera.error';

export interface EditUserInput {
  invocadoPor: AuthenticatedUser;
  userId: string;
  nombre?: string;
  password?: string;
}

/**
 * ADMIN edita PROFESOR/ALUMNO de su gym; PROFESOR edita solo ALUMNO de su
 * cartera. Nadie edita un ADMIN/SUPER_ADMIN por acá — eso es exclusivo
 * de `super-admin/` (Task 7). Nunca pide la password actual: quien edita
 * define una nueva directamente (mismo criterio que al dar de alta).
 */
@Injectable()
export class EditUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProviderPort,
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
  ) {}

  async execute(input: EditUserInput): Promise<UserRecord> {
    const gymId = requireGymId(input.invocadoPor);
    const objetivo = await resolveUserInGym(this.userRepository, input.userId, gymId);

    if (objetivo.role === Role.ADMIN || objetivo.role === Role.SUPER_ADMIN) {
      throw new CannotEditAdminError(objetivo.id);
    }

    if (input.invocadoPor.role === Role.PROFESOR) {
      if (objetivo.role !== Role.ALUMNO) {
        throw new UserNotFoundError(objetivo.id);
      }
      const enCartera = await this.carteraRepository.existe(input.invocadoPor.id, objetivo.id);
      if (!enCartera) {
        throw new AlumnoNotInCarteraError(objetivo.id);
      }
    } else if (input.invocadoPor.role !== Role.ADMIN) {
      throw new InsufficientRoleError(input.invocadoPor.role, [Role.ADMIN, Role.PROFESOR]);
    }

    if (input.password !== undefined && objetivo.role === Role.ALUMNO) {
      throw new AlumnoHasNoPasswordError(objetivo.id);
    }

    let actualizado = objetivo;
    if (input.nombre !== undefined) {
      actualizado = await this.userRepository.updateNombre(objetivo.id, input.nombre);
    }
    if (input.password !== undefined) {
      await this.authProvider.updateStaffPassword(objetivo.authUserId, input.password);
    }
    return actualizado;
  }
}
