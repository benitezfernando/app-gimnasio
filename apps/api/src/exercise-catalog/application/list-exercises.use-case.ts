import { Inject, Injectable } from '@nestjs/common';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepositoryPort,
  ExerciseSummary,
} from './ports/exercise-repository.port';

export interface ListExercisesInput {
  search?: string;
  parteCuerpo?: string;
  equipamiento?: string;
  page: number;
  limit: number;
}

export interface ListExercisesOutput {
  items: ExerciseSummary[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class ListExercisesUseCase {
  constructor(
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
  ) {}

  async execute(input: ListExercisesInput): Promise<ListExercisesOutput> {
    const { items, total } = await this.exerciseRepository.findMany({
      search: input.search,
      parteCuerpo: input.parteCuerpo,
      equipamiento: input.equipamiento,
      page: input.page,
      limit: input.limit,
    });

    return {
      items,
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.limit)),
    };
  }
}
