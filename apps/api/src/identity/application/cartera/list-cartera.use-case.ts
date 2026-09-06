import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../domain/role';
import { AuthenticatedUser } from '../../domain/authenticated-user';
import { CARTERA_REPOSITORY, CarteraRepositoryPort } from '../ports/cartera-repository.port';
import { UserRecord } from '../ports/user-repository.port';
import { InsufficientRoleError } from '../errors/insufficient-role.error';

export interface ListCarteraInput {
  invocadoPor: AuthenticatedUser;
}

const ROLES_QUE_PUEDEN_VER_SU_CARTERA: Role[] = [Role.PROFESOR];

/**
 * Un PROFESOR ve siempre SU PROPIA cartera — `invocadoPor.id`, nunca un
 * `profesorId` que venga del cliente. No filtra por `activo`: la UI
 * decide qué hacer con alumnos desactivados en su lista.
 */
@Injectable()
export class ListCarteraUseCase {
  constructor(
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
  ) {}

  async execute(input: ListCarteraInput): Promise<UserRecord[]> {
    if (!ROLES_QUE_PUEDEN_VER_SU_CARTERA.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_VER_SU_CARTERA);
    }
    return this.carteraRepository.findAlumnosDeProfesor(input.invocadoPor.id);
  }
}
