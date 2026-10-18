import { Body, Controller, Delete, Get, HttpCode, Param, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  ListExercisesUseCase,
  ListExercisesOutput,
} from '../../application/list-exercises.use-case';
import { GetExerciseUseCase } from '../../application/get-exercise.use-case';
import { GetExercisesByIdsUseCase } from '../../application/get-exercises-by-ids.use-case';
import { SetExerciseAliasUseCase } from '../../application/set-exercise-alias.use-case';
import { ClearExerciseAliasUseCase } from '../../application/clear-exercise-alias.use-case';
import { ExerciseDetail, ExerciseSummary } from '../../application/ports/exercise-repository.port';
import { ListExercisesDto } from './dto/list-exercises.dto';
import { GetExercisesByIdsDto } from './dto/get-exercises-by-ids.dto';
import { SetExerciseAliasDto } from './dto/set-exercise-alias.dto';
import { Roles } from '../../../identity/infrastructure/decorators/roles.decorator';
import { Role } from '../../../identity/domain/role';
import { AuthenticatedUser } from '../../../identity/domain/authenticated-user';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

/** Solo el PROFESOR tiene alias propios: ALUMNO y ADMIN ven siempre el catálogo puro. */
function aliasDe(req: RequestWithUser): string | undefined {
  return req.user.role === Role.PROFESOR ? req.user.id : undefined;
}

@Controller('exercises')
export class ExercisesController {
  constructor(
    private readonly listExercisesUseCase: ListExercisesUseCase,
    private readonly getExerciseUseCase: GetExerciseUseCase,
    private readonly getExercisesByIdsUseCase: GetExercisesByIdsUseCase,
    private readonly setExerciseAliasUseCase: SetExerciseAliasUseCase,
    private readonly clearExerciseAliasUseCase: ClearExerciseAliasUseCase,
  ) {}

  @Get()
  async list(
    @Query() dto: ListExercisesDto,
    @Req() req: RequestWithUser,
  ): Promise<ListExercisesOutput> {
    return this.listExercisesUseCase.execute({ ...dto, aliasDeProfesorId: aliasDe(req) });
  }

  // Declarado antes de `:id` — si no, Nest lo matchearía como
  // GET /exercises/:id con id="by-ids".
  @Get('by-ids')
  async byIds(
    @Query() dto: GetExercisesByIdsDto,
    @Req() req: RequestWithUser,
  ): Promise<ExerciseSummary[]> {
    return this.getExercisesByIdsUseCase.execute(dto.ids, aliasDe(req));
  }

  @Get(':id')
  async detail(@Param('id') id: string, @Req() req: RequestWithUser): Promise<ExerciseDetail> {
    return this.getExerciseUseCase.execute(id, aliasDe(req));
  }

  @Put(':id/alias')
  @Roles(Role.PROFESOR)
  async setAlias(
    @Param('id') id: string,
    @Body() dto: SetExerciseAliasDto,
    @Req() req: RequestWithUser,
  ): Promise<ExerciseDetail> {
    return this.setExerciseAliasUseCase.execute({
      invocadoPor: req.user,
      exerciseId: id,
      nombre: dto.nombre,
    });
  }

  @Delete(':id/alias')
  @Roles(Role.PROFESOR)
  @HttpCode(200)
  async clearAlias(@Param('id') id: string, @Req() req: RequestWithUser): Promise<ExerciseDetail> {
    return this.clearExerciseAliasUseCase.execute({ invocadoPor: req.user, exerciseId: id });
  }
}
