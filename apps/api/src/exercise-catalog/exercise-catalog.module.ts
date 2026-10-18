import { Module } from '@nestjs/common';
import { EXERCISE_REPOSITORY } from './application/ports/exercise-repository.port';
import { EXERCISE_ALIAS_REPOSITORY } from './application/ports/exercise-alias-repository.port';
import { ListExercisesUseCase } from './application/list-exercises.use-case';
import { GetExerciseUseCase } from './application/get-exercise.use-case';
import { GetExercisesByIdsUseCase } from './application/get-exercises-by-ids.use-case';
import { SetExerciseAliasUseCase } from './application/set-exercise-alias.use-case';
import { ClearExerciseAliasUseCase } from './application/clear-exercise-alias.use-case';
import { PrismaExerciseRepository } from './infrastructure/persistence/prisma-exercise.repository';
import { PrismaExerciseAliasRepository } from './infrastructure/persistence/prisma-exercise-alias.repository';
import { ExercisesController } from './infrastructure/http/exercises.controller';

@Module({
  imports: [],
  controllers: [ExercisesController],
  providers: [
    { provide: EXERCISE_REPOSITORY, useClass: PrismaExerciseRepository },
    { provide: EXERCISE_ALIAS_REPOSITORY, useClass: PrismaExerciseAliasRepository },
    ListExercisesUseCase,
    GetExerciseUseCase,
    GetExercisesByIdsUseCase,
    SetExerciseAliasUseCase,
    ClearExerciseAliasUseCase,
  ],
  exports: [EXERCISE_REPOSITORY],
})
export class ExerciseCatalogModule {}
