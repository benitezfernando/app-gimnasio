import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../domain/role';
import { AuthenticatedUser } from '../domain/authenticated-user';
import { USER_REPOSITORY, UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { InsufficientRoleError } from './errors/insufficient-role.error';

export interface ListUsersInput {
  invocadoPor: AuthenticatedUser;
  role?: Role;
}

const ROLES_QUE_PUEDEN_LISTAR: Role[] = [Role.ADMIN];

/**
 * Lista los usuarios del gym de quien invoca (el gymId sale siempre de
 * `invocadoPor`, nunca de un parámetro del cliente). Solo ADMIN.
 */
@Injectable()
export class ListUsersUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort) {}

  async execute(input: ListUsersInput): Promise<UserRecord[]> {
    if (!ROLES_QUE_PUEDEN_LISTAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_LISTAR);
    }
    return this.userRepository.findByGymId(input.invocadoPor.gymId, input.role);
  }
}
