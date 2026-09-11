import { Module } from '@nestjs/common';
import { EXERCISE_REPOSITORY } from './application/ports/exercise-repository.port';
import { ListExercisesUseCase } from './application/list-exercises.use-case';
import { GetExerciseUseCase } from './application/get-exercise.use-case';
import { GetExercisesByIdsUseCase } from './application/get-exercises-by-ids.use-case';
import { PrismaExerciseRepository } from './infrastructure/persistence/prisma-exercise.repository';
import { ExercisesController } from './infrastructure/http/exercises.controller';

@Module({
  imports: [],
  controllers: [ExercisesController],
  providers: [
    { provide: EXERCISE_REPOSITORY, useClass: PrismaExerciseRepository },
    ListExercisesUseCase,
    GetExerciseUseCase,
    GetExercisesByIdsUseCase,
  ],
  exports: [EXERCISE_REPOSITORY],
})
export class ExerciseCatalogModule {}
