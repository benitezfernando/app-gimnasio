import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../identity/domain/role';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
  UserRecord,
} from '../../identity/application/ports/user-repository.port';
import { UserNotFoundError } from '../../identity/application/errors/user-not-found.error';

export interface DeactivateAdminInput {
  adminId: string;
}

/**
 * Mismo contrato que DeactivateUserUseCase (identity/), pero sin
 * restricción de gym — SUPER_ADMIN desactiva cualquier ADMIN de
 * cualquier gym. Baja lógica (`activo: false`), nunca borrado físico —
 * ese es DeleteAdminPermanentlyUseCase, y exige pasar por acá primero.
 */
@Injectable()
export class DeactivateAdminUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort) {}

  async execute(input: DeactivateAdminInput): Promise<UserRecord> {
    const objetivo = await this.userRepository.findById(input.adminId);
    if (!objetivo || objetivo.role !== Role.ADMIN) {
      throw new UserNotFoundError(input.adminId);
    }

    return this.userRepository.deactivate(input.adminId);
  }
}
