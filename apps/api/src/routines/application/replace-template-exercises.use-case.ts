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
import {
  ROUTINE_INSTANCE_REPOSITORY,
  RoutineInstanceRepositoryPort,
} from './ports/routine-instance-repository.port';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';
import { TooManyExercisesError } from './errors/too-many-exercises.error';
import { InvalidExerciseIdError } from './errors/invalid-exercise-id.error';
import { mergeEjerciciosVinculados } from './merge-ejercicios-vinculados';

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
    @Inject(ROUTINE_INSTANCE_REPOSITORY)
    private readonly instanceRepository: RoutineInstanceRepositoryPort,
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

    await this.propagarAInstanciasVinculadas(input.templateId, input.ejercicios);
  }

  /**
   * HU nueva (ver diseño §B): una instancia `vinculada && activa` a esta
   * plantilla se resincroniza automáticamente. `mergeEjerciciosVinculados`
   * es quien decide qué se conserva del alumno y qué sigue a la
   * plantilla — este método solo orquesta el fetch + el replace por
   * instancia. NUNCA llama a `ReplaceInstanceExercisesUseCase` (ese es un
   * código-path distinto, con su propia lógica de desvincular que no debe
   * dispararse acá).
   */
  private async propagarAInstanciasVinculadas(
    templateId: string,
    ejerciciosPlantilla: EjercicioItem[],
  ): Promise<void> {
    const instanciasVinculadas =
      await this.instanceRepository.findVinculadasActivasPorTemplate(templateId);

    for (const instancia of instanciasVinculadas) {
      const ejerciciosFusionados = mergeEjerciciosVinculados(
        ejerciciosPlantilla,
        instancia.ejercicios,
      );
      await this.instanceRepository.replaceExercises(instancia.id, ejerciciosFusionados);
    }
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
