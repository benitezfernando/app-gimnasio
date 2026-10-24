import { Inject, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../domain/authenticated-user';
import { USER_REPOSITORY, UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { CARTERA_REPOSITORY, CarteraRepositoryPort } from './ports/cartera-repository.port';
import { resolverAlumnoGestionable } from './resolver-alumno-gestionable';

export interface DeactivateUserInput {
  invocadoPor: AuthenticatedUser;
  userId: string;
}

/**
 * Baja lógica (`activo: false`, PRD regla 5) — nunca DELETE físico. El ADMIN
 * sobre usuarios de su gym; el PROFESOR solo sobre alumnos de su cartera
 * (ver `resolverAlumnoGestionable`).
 */
@Injectable()
export class DeactivateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
  ) {}

  async execute(input: DeactivateUserInput): Promise<UserRecord> {
    const objetivo = await resolverAlumnoGestionable(
      this.userRepository,
      this.carteraRepository,
      input.invocadoPor,
      input.userId,
    );
    return this.userRepository.deactivate(objetivo.id);
  }
}
