import { Inject, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../domain/authenticated-user';
import { USER_REPOSITORY, UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { CARTERA_REPOSITORY, CarteraRepositoryPort } from './ports/cartera-repository.port';
import { resolverAlumnoGestionable } from './resolver-alumno-gestionable';

export interface ReactivateUserInput {
  invocadoPor: AuthenticatedUser;
  userId: string;
}

/** Deshace la baja lógica (`activo: true`). Mismas reglas de autorización que desactivar. */
@Injectable()
export class ReactivateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
  ) {}

  async execute(input: ReactivateUserInput): Promise<UserRecord> {
    const objetivo = await resolverAlumnoGestionable(
      this.userRepository,
      this.carteraRepository,
      input.invocadoPor,
      input.userId,
    );
    return this.userRepository.reactivate(objetivo.id);
  }
}
