import { Inject, Injectable } from '@nestjs/common';
import {
  EXERCISE_REPOSITORY,
  ExerciseDetail,
  ExerciseRepositoryPort,
} from './ports/exercise-repository.port';
import { ExerciseNotFoundError } from './errors/exercise-not-found.error';

@Injectable()
export class GetExerciseUseCase {
  constructor(
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
  ) {}

  async execute(id: string): Promise<ExerciseDetail> {
    const exercise = await this.exerciseRepository.findById(id);
    if (!exercise) {
      throw new ExerciseNotFoundError(id);
    }
    return exercise;
  }
}
