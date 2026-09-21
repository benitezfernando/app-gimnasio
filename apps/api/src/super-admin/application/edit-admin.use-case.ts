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
import { UserNotFoundError } from '../../identity/application/errors/user-not-found.error';

export interface EditAdminInput {
  adminId: string;
  nombre?: string;
  password?: string;
}

/**
 * Mismo contrato que EditUserUseCase (identity/), pero sin restricción
 * de gym — SUPER_ADMIN edita cualquier ADMIN de cualquier gym. No hay
 * "cannot target admin" acá: esa restricción es justo lo que este caso
 * de uso existe para saltear, de forma controlada y gateada por rol.
 */
@Injectable()
export class EditAdminUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProviderPort,
  ) {}

  async execute(input: EditAdminInput): Promise<UserRecord> {
    const objetivo = await this.userRepository.findById(input.adminId);
    if (!objetivo || objetivo.role !== Role.ADMIN) {
      throw new UserNotFoundError(input.adminId);
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
