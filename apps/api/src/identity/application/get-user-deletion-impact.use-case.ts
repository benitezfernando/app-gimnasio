import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../domain/role';
import { AuthenticatedUser } from '../domain/authenticated-user';
import { USER_REPOSITORY, UserRepositoryPort } from './ports/user-repository.port';
import { CARTERA_REPOSITORY, CarteraRepositoryPort } from './ports/cartera-repository.port';
import { ROUTINES_CLEANUP, RoutinesCleanupPort } from './ports/routines-cleanup.port';
import { resolverAlumnoGestionable } from './resolver-alumno-gestionable';

export interface GetUserDeletionImpactInput {
  invocadoPor: AuthenticatedUser;
  userId: string;
}

export interface DeletionImpact {
  plantillasABorrar: number;
  instanciasABorrar: number;
  instanciasQueSobreviven: number;
  /** Rutinas del alumno armadas por profesores distintos del invocador (solo si invoca un PROFESOR). */
  instanciasDeOtrosProfesores: number;
  vinculosDeCarteraABorrar: number;
  /** Profesores del alumno distintos del invocador (solo si invoca un PROFESOR sobre un alumno). */
  otrosProfesores: number;
}

/** Alimenta el diálogo de impacto de HU-03c antes de confirmar el hard-delete. */
@Injectable()
export class GetUserDeletionImpactUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
    @Inject(ROUTINES_CLEANUP) private readonly routinesCleanup: RoutinesCleanupPort,
  ) {}

  async execute(input: GetUserDeletionImpactInput): Promise<DeletionImpact> {
    const objetivo = await resolverAlumnoGestionable(
      this.userRepository,
      this.carteraRepository,
      input.invocadoPor,
      input.userId,
    );

    const invocaProfesor = input.invocadoPor.role === Role.PROFESOR;
    const role = objetivo.role as Role.PROFESOR | Role.ALUMNO;
    const impactoRoutines = await this.routinesCleanup.contarImpacto(
      objetivo.id,
      role,
      invocaProfesor ? input.invocadoPor.id : undefined,
    );
    const vinculos =
      role === Role.PROFESOR
        ? await this.carteraRepository.findAlumnosDeProfesor(objetivo.id)
        : await this.carteraRepository.findProfesoresDeAlumno(objetivo.id);
    const otrosProfesores =
      invocaProfesor && role === Role.ALUMNO
        ? vinculos.filter((v) => v.id !== input.invocadoPor.id).length
        : 0;

    return { ...impactoRoutines, vinculosDeCarteraABorrar: vinculos.length, otrosProfesores };
  }
}
