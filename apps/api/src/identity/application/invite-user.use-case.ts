import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../domain/role';
import { AuthenticatedUser } from '../domain/authenticated-user';
import { USER_REPOSITORY, UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { AUTH_PROVIDER, AuthProviderPort } from './ports/auth-provider.port';
import { InsufficientRoleError } from './errors/insufficient-role.error';
import { DuplicateEmailError } from './errors/duplicate-email.error';

export interface InviteUserInput {
  email: string;
  nombre: string;
  rol: Role;
  invocadoPor: AuthenticatedUser;
}

const ROLES_QUE_PUEDEN_INVITAR: Role[] = [Role.ADMIN, Role.PROFESOR];

/**
 * Caso de uso: alta de un profesor/alumno (PRD HU-01/HU-02). Solo ADMIN o
 * PROFESOR pueden invocarlo (instrucción explícita para esta fase). Invita
 * al usuario vía Supabase Auth (service_role, server-side) y, si tiene
 * éxito, crea el `User` interno con el `authUserId` resultante.
 */
@Injectable()
export class InviteUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProviderPort,
  ) {}

  async execute(input: InviteUserInput): Promise<UserRecord> {
    if (!ROLES_QUE_PUEDEN_INVITAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role);
    }

    const gymId = input.invocadoPor.gymId;

    const existente = await this.userRepository.findByGymIdAndEmail(gymId, input.email);
    if (existente) {
      throw new DuplicateEmailError(input.email, gymId);
    }

    const { authUserId } = await this.authProvider.inviteUserByEmail(input.email);

    return this.userRepository.create({
      gymId,
      authUserId,
      email: input.email,
      nombre: input.nombre,
      role: input.rol,
    });
  }
}
