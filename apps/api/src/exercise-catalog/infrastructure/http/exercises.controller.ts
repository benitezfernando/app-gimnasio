import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ListExercisesUseCase,
  ListExercisesOutput,
} from '../../application/list-exercises.use-case';
import { GetExerciseUseCase } from '../../application/get-exercise.use-case';
import { ExerciseDetail } from '../../application/ports/exercise-repository.port';
import { ListExercisesDto } from './dto/list-exercises.dto';

@Controller('exercises')
export class ExercisesController {
  constructor(
    private readonly listExercisesUseCase: ListExercisesUseCase,
    private readonly getExerciseUseCase: GetExerciseUseCase,
  ) {}

  @Get()
  async list(@Query() dto: ListExercisesDto): Promise<ListExercisesOutput> {
    return this.listExercisesUseCase.execute(dto);
  }

  @Get(':id')
  async detail(@Param('id') id: string): Promise<ExerciseDetail> {
    return this.getExerciseUseCase.execute(id);
  }
}
