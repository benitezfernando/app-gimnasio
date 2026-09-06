import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../domain/role';
import { AuthenticatedUser } from '../../domain/authenticated-user';
import { CARTERA_REPOSITORY, CarteraRepositoryPort } from '../ports/cartera-repository.port';
import { USER_REPOSITORY, UserRepositoryPort } from '../ports/user-repository.port';
import { InsufficientRoleError } from '../errors/insufficient-role.error';
import { UserNotFoundError } from '../errors/user-not-found.error';
import { CarteraLinkNotFoundError } from '../errors/cartera-link-not-found.error';

export interface RemoveProfesorFromAlumnoInput {
  invocadoPor: AuthenticatedUser;
  alumnoId: string;
  profesorId: string;
}

const ROLES_QUE_PUEDEN_GESTIONAR_CARTERA: Role[] = [Role.ADMIN];

/**
 * HU-03b — exclusivo de ADMIN. A diferencia de `AssignProfesorToAlumnoUseCase`,
 * NUNCA valida `activo` de ninguno de los dos usuarios: quitar de la
 * cartera es limpieza administrativa sobre datos propios del ADMIN, no
 * "operar en nombre de" el usuario inactivo. Validarlo dejaría filas de
 * cartera imborrables cada vez que se desactiva a alguien (spec Bloque 3A
 * §4.2). No borra ninguna `RoutineInstance` ya asignada — solo esta fila.
 */
@Injectable()
export class RemoveProfesorFromAlumnoUseCase {
  constructor(
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
  ) {}

  async execute(input: RemoveProfesorFromAlumnoInput): Promise<void> {
    if (!ROLES_QUE_PUEDEN_GESTIONAR_CARTERA.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_GESTIONAR_CARTERA);
    }

    const alumno = await this.userRepository.findById(input.alumnoId);
    if (!alumno || alumno.gymId !== input.invocadoPor.gymId) {
      throw new UserNotFoundError(input.alumnoId);
    }

    const profesor = await this.userRepository.findById(input.profesorId);
    if (!profesor || profesor.gymId !== input.invocadoPor.gymId) {
      throw new UserNotFoundError(input.profesorId);
    }

    const existe = await this.carteraRepository.existe(input.profesorId, input.alumnoId);
    if (!existe) {
      throw new CarteraLinkNotFoundError(input.profesorId, input.alumnoId);
    }

    await this.carteraRepository.eliminar(input.profesorId, input.alumnoId);
  }
}
