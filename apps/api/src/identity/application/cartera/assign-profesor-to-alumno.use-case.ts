import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../domain/role';
import { AuthenticatedUser } from '../../domain/authenticated-user';
import {
  CARTERA_REPOSITORY,
  CarteraLink,
  CarteraRepositoryPort,
} from '../ports/cartera-repository.port';
import { USER_REPOSITORY, UserRepositoryPort } from '../ports/user-repository.port';
import { resolveUserInGym } from '../resolve-user-in-gym';
import { InsufficientRoleError } from '../errors/insufficient-role.error';
import { InvalidCarteraRoleError } from '../errors/invalid-cartera-role.error';
import { InactiveUserError } from '../errors/inactive-user.error';
import { CarteraLinkAlreadyExistsError } from '../errors/cartera-link-already-exists.error';

export interface AssignProfesorToAlumnoInput {
  invocadoPor: AuthenticatedUser;
  alumnoId: string;
  profesorId: string;
}

const ROLES_QUE_PUEDEN_GESTIONAR_CARTERA: Role[] = [Role.ADMIN];

/**
 * HU-03b — exclusivo de ADMIN. Un recurso de otro gym o inexistente
 * responde igual (UserNotFoundError, 404) para no habilitar enumeración
 * (HLD §4, "Convención de respuesta ante acceso denegado").
 */
@Injectable()
export class AssignProfesorToAlumnoUseCase {
  constructor(
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
  ) {}

  async execute(input: AssignProfesorToAlumnoInput): Promise<CarteraLink> {
    if (!ROLES_QUE_PUEDEN_GESTIONAR_CARTERA.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_GESTIONAR_CARTERA);
    }

    const profesor = await resolveUserInGym(
      this.userRepository,
      input.profesorId,
      input.invocadoPor.gymId,
    );
    if (profesor.role !== Role.PROFESOR) {
      throw new InvalidCarteraRoleError(input.profesorId, Role.PROFESOR);
    }
    if (!profesor.activo) {
      throw new InactiveUserError(input.profesorId);
    }

    const alumno = await resolveUserInGym(
      this.userRepository,
      input.alumnoId,
      input.invocadoPor.gymId,
    );
    if (alumno.role !== Role.ALUMNO) {
      throw new InvalidCarteraRoleError(input.alumnoId, Role.ALUMNO);
    }
    if (!alumno.activo) {
      throw new InactiveUserError(input.alumnoId);
    }

    const yaExiste = await this.carteraRepository.existe(input.profesorId, input.alumnoId);
    if (yaExiste) {
      throw new CarteraLinkAlreadyExistsError(input.profesorId, input.alumnoId);
    }

    return this.carteraRepository.crear({
      gymId: input.invocadoPor.gymId,
      profesorId: input.profesorId,
      alumnoId: input.alumnoId,
    });
  }
}
