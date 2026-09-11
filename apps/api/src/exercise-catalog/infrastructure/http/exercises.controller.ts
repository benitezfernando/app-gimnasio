import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ListExercisesUseCase,
  ListExercisesOutput,
} from '../../application/list-exercises.use-case';
import { GetExerciseUseCase } from '../../application/get-exercise.use-case';
import { GetExercisesByIdsUseCase } from '../../application/get-exercises-by-ids.use-case';
import { ExerciseDetail, ExerciseSummary } from '../../application/ports/exercise-repository.port';
import { ListExercisesDto } from './dto/list-exercises.dto';
import { GetExercisesByIdsDto } from './dto/get-exercises-by-ids.dto';

@Controller('exercises')
export class ExercisesController {
  constructor(
    private readonly listExercisesUseCase: ListExercisesUseCase,
    private readonly getExerciseUseCase: GetExerciseUseCase,
    private readonly getExercisesByIdsUseCase: GetExercisesByIdsUseCase,
  ) {}

  @Get()
  async list(@Query() dto: ListExercisesDto): Promise<ListExercisesOutput> {
    return this.listExercisesUseCase.execute(dto);
  }

  // Declarado antes de `:id` — si no, Nest lo matchearía como
  // GET /exercises/:id con id="by-ids".
  @Get('by-ids')
  async byIds(@Query() dto: GetExercisesByIdsDto): Promise<ExerciseSummary[]> {
    return this.getExercisesByIdsUseCase.execute(dto.ids);
  }

  @Get(':id')
  async detail(@Param('id') id: string): Promise<ExerciseDetail> {
    return this.getExerciseUseCase.execute(id);
  }
}
