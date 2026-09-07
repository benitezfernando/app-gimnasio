import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../identity/domain/role';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepositoryPort,
} from '../../exercise-catalog/application/ports/exercise-repository.port';
import {
  EjercicioItem,
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateRepositoryPort,
} from './ports/routine-template-repository.port';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';
import { TooManyExercisesError } from './errors/too-many-exercises.error';
import { InvalidExerciseIdError } from './errors/invalid-exercise-id.error';

const MAX_EJERCICIOS = 50;

export interface ReplaceTemplateExercisesInput {
  invocadoPor: AuthenticatedUser;
  templateId: string;
  ejercicios: EjercicioItem[];
}

const ROLES_QUE_PUEDEN_EDITAR: Role[] = [Role.PROFESOR];

@Injectable()
export class ReplaceTemplateExercisesUseCase {
  constructor(
    @Inject(ROUTINE_TEMPLATE_REPOSITORY)
    private readonly templateRepository: RoutineTemplateRepositoryPort,
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
  ) {}

  async execute(input: ReplaceTemplateExercisesInput): Promise<void> {
    if (!ROLES_QUE_PUEDEN_EDITAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_EDITAR);
    }

    const template = await this.templateRepository.findById(input.templateId);
    if (!template || template.profesorId !== input.invocadoPor.id) {
      throw new RoutineTemplateNotFoundError(input.templateId);
    }

    if (input.ejercicios.length > MAX_EJERCICIOS) {
      throw new TooManyExercisesError(input.ejercicios.length);
    }

    await this.validarExerciseIdsEnCatalogo(input.ejercicios);

    await this.templateRepository.replaceExercises(input.templateId, input.ejercicios);
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
