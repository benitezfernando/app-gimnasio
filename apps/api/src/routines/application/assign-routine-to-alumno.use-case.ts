import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../identity/domain/role';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import {
  CARTERA_REPOSITORY,
  CarteraRepositoryPort,
} from '../../identity/application/ports/cartera-repository.port';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
} from '../../identity/application/ports/user-repository.port';
import { resolveUserInGym } from '../../identity/application/resolve-user-in-gym';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepositoryPort,
} from '../../exercise-catalog/application/ports/exercise-repository.port';
import {
  EjercicioItem,
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateRepositoryPort,
} from './ports/routine-template-repository.port';
import {
  ROUTINE_INSTANCE_REPOSITORY,
  RoutineInstanceDetail,
  RoutineInstanceRepositoryPort,
} from './ports/routine-instance-repository.port';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';
import { InvalidRoutineInstanceInputError } from './errors/invalid-routine-instance-input.error';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';
import { TemplateHasNoExercisesError } from './errors/template-has-no-exercises.error';
import { TooManyExercisesError } from './errors/too-many-exercises.error';
import { InvalidExerciseIdError } from './errors/invalid-exercise-id.error';

const MAX_EJERCICIOS = 50;

export interface AssignRoutineToAlumnoInput {
  invocadoPor: AuthenticatedUser;
  alumnoId: string;
  nombre: string;
  origenTemplateId?: string;
  ejercicios?: EjercicioItem[];
}

const ROLES_QUE_PUEDEN_ASIGNAR: Role[] = [Role.PROFESOR];

/**
 * HU-05. Exactamente uno de `origenTemplateId`/`ejercicios` — asignar
 * desde plantilla (clona 1:1) o armar desde cero. Autoriza contra la
 * cartera vigente del invocador, nunca contra `RoutineInstance.profesorId`
 * de una instancia anterior (acá se está creando una nueva).
 */
@Injectable()
export class AssignRoutineToAlumnoUseCase {
  constructor(
    @Inject(ROUTINE_INSTANCE_REPOSITORY)
    private readonly instanceRepository: RoutineInstanceRepositoryPort,
    @Inject(ROUTINE_TEMPLATE_REPOSITORY)
    private readonly templateRepository: RoutineTemplateRepositoryPort,
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
  ) {}

  async execute(input: AssignRoutineToAlumnoInput): Promise<RoutineInstanceDetail> {
    if (!ROLES_QUE_PUEDEN_ASIGNAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_ASIGNAR);
    }

    const tieneOrigen = Boolean(input.origenTemplateId);
    const tieneEjerciciosPropios = Boolean(input.ejercicios && input.ejercicios.length > 0);
    if (tieneOrigen === tieneEjerciciosPropios) {
      throw new InvalidRoutineInstanceInputError();
    }

    const alumno = await resolveUserInGym(
      this.userRepository,
      input.alumnoId,
      input.invocadoPor.gymId,
    );
    if (alumno.role !== Role.ALUMNO) {
      throw new AlumnoNotInCarteraError(input.alumnoId);
    }

    const enCartera = await this.carteraRepository.existe(input.invocadoPor.id, input.alumnoId);
    if (!enCartera) {
      throw new AlumnoNotInCarteraError(input.alumnoId);
    }

    let ejercicios: EjercicioItem[];
    if (input.origenTemplateId) {
      const template = await this.templateRepository.findById(input.origenTemplateId);
      if (!template || template.profesorId !== input.invocadoPor.id) {
        throw new RoutineTemplateNotFoundError(input.origenTemplateId);
      }
      if (template.ejercicios.length === 0) {
        throw new TemplateHasNoExercisesError(template.id);
      }
      ejercicios = template.ejercicios;
    } else {
      ejercicios = input.ejercicios!;
      if (ejercicios.length > MAX_EJERCICIOS) {
        throw new TooManyExercisesError(ejercicios.length);
      }
      await this.validarExerciseIdsEnCatalogo(ejercicios);
    }

    return this.instanceRepository.crear({
      gymId: input.invocadoPor.gymId,
      profesorId: input.invocadoPor.id,
      alumnoId: input.alumnoId,
      nombre: input.nombre,
      origenTemplateId: input.origenTemplateId ?? null,
      ejercicios,
    });
  }

  private async validarExerciseIdsEnCatalogo(ejercicios: EjercicioItem[]): Promise<void> {
    const exerciseIds = new Set(ejercicios.map((e) => e.exerciseId));
    const catalogados = await this.exerciseRepository.findByIds([...exerciseIds]);
    if (catalogados.length !== exerciseIds.size) {
      const encontrados = new Set(catalogados.map((e) => e.id));
      const faltantes = [...exerciseIds].filter((id) => !encontrados.has(id));
      throw new InvalidExerciseIdError(faltantes);
    }
  }
}
