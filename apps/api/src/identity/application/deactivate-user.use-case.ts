import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../domain/role';
import { AuthenticatedUser } from '../domain/authenticated-user';
import { USER_REPOSITORY, UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { InsufficientRoleError } from './errors/insufficient-role.error';
import { UserNotFoundError } from './errors/user-not-found.error';

export interface DeactivateUserInput {
  invocadoPor: AuthenticatedUser;
  userId: string;
}

const ROLES_QUE_PUEDEN_DESACTIVAR: Role[] = [Role.ADMIN];

/**
 * Baja lógica (`activo: false`, PRD regla 5) — nunca DELETE físico. Solo
 * ADMIN, y solo sobre usuarios de su propio gym: si el id es de otro gym
 * se responde igual que "no existe".
 */
@Injectable()
export class DeactivateUserUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort) {}

  async execute(input: DeactivateUserInput): Promise<UserRecord> {
    if (!ROLES_QUE_PUEDEN_DESACTIVAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_DESACTIVAR);
    }

    const objetivo = await this.userRepository.findById(input.userId);
    if (!objetivo || objetivo.gymId !== input.invocadoPor.gymId) {
      throw new UserNotFoundError(input.userId);
    }

    return this.userRepository.deactivate(input.userId);
  }
}
