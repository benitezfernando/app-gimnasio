import { Inject, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import {
  CARTERA_REPOSITORY,
  CarteraRepositoryPort,
} from '../../identity/application/ports/cartera-repository.port';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepositoryPort,
} from '../../exercise-catalog/application/ports/exercise-repository.port';
import { EjercicioItem } from './ports/routine-template-repository.port';
import {
  ROUTINE_INSTANCE_REPOSITORY,
  RoutineInstanceRepositoryPort,
} from './ports/routine-instance-repository.port';
import { RoutineInstanceNotFoundError } from './errors/routine-instance-not-found.error';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';
import { TooManyExercisesError } from './errors/too-many-exercises.error';
import { InvalidExerciseIdError } from './errors/invalid-exercise-id.error';

const MAX_EJERCICIOS = 50;

export interface ReplaceInstanceExercisesInput {
  invocadoPor: AuthenticatedUser;
  instanceId: string;
  ejercicios: EjercicioItem[];
}

@Injectable()
export class ReplaceInstanceExercisesUseCase {
  constructor(
    @Inject(ROUTINE_INSTANCE_REPOSITORY)
    private readonly instanceRepository: RoutineInstanceRepositoryPort,
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
  ) {}

  async execute(input: ReplaceInstanceExercisesInput): Promise<void> {
    const instance = await this.instanceRepository.findById(input.instanceId);
    if (!instance || instance.gymId !== input.invocadoPor.gymId) {
      throw new RoutineInstanceNotFoundError(input.instanceId);
    }

    const enCartera = await this.carteraRepository.existe(input.invocadoPor.id, instance.alumnoId);
    if (!enCartera) {
      throw new AlumnoNotInCarteraError(instance.alumnoId);
    }

    if (input.ejercicios.length > MAX_EJERCICIOS) {
      throw new TooManyExercisesError(input.ejercicios.length);
    }

    await this.validarExerciseIdsEnCatalogo(input.ejercicios);

    await this.instanceRepository.replaceExercises(input.instanceId, input.ejercicios);
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
