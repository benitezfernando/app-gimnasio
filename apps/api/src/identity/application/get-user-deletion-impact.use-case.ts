import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../domain/role';
import { AuthenticatedUser } from '../domain/authenticated-user';
import { USER_REPOSITORY, UserRepositoryPort } from './ports/user-repository.port';
import { CARTERA_REPOSITORY, CarteraRepositoryPort } from './ports/cartera-repository.port';
import { ROUTINES_CLEANUP, RoutinesCleanupPort } from './ports/routines-cleanup.port';
import { resolveUserInGym } from './resolve-user-in-gym';
import { InsufficientRoleError } from './errors/insufficient-role.error';
import { CannotTargetAdminError } from './errors/cannot-target-admin.error';

export interface GetUserDeletionImpactInput {
  invocadoPor: AuthenticatedUser;
  userId: string;
}

export interface DeletionImpact {
  plantillasABorrar: number;
  instanciasABorrar: number;
  instanciasQueSobreviven: number;
  vinculosDeCarteraABorrar: number;
}

const ROLES_QUE_PUEDEN_VER_IMPACTO: Role[] = [Role.ADMIN];

/** Alimenta el diálogo de impacto de HU-03c antes de confirmar el hard-delete. */
@Injectable()
export class GetUserDeletionImpactUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
    @Inject(ROUTINES_CLEANUP) private readonly routinesCleanup: RoutinesCleanupPort,
  ) {}

  async execute(input: GetUserDeletionImpactInput): Promise<DeletionImpact> {
    if (!ROLES_QUE_PUEDEN_VER_IMPACTO.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_VER_IMPACTO);
    }

    const objetivo = await resolveUserInGym(
      this.userRepository,
      input.userId,
      input.invocadoPor.gymId,
    );
    if (objetivo.role === Role.ADMIN) {
      throw new CannotTargetAdminError(objetivo.id);
    }

    const role = objetivo.role as Role.PROFESOR | Role.ALUMNO;
    const impactoRoutines = await this.routinesCleanup.contarImpacto(objetivo.id, role);
    const vinculos =
      role === Role.PROFESOR
        ? await this.carteraRepository.findAlumnosDeProfesor(objetivo.id)
        : await this.carteraRepository.findProfesoresDeAlumno(objetivo.id);

    return { ...impactoRoutines, vinculosDeCarteraABorrar: vinculos.length };
  }
}
