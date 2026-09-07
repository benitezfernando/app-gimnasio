import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../../identity/infrastructure/decorators/roles.decorator';
import { Role } from '../../../identity/domain/role';
import { AuthenticatedUser } from '../../../identity/domain/authenticated-user';
import { AssignRoutineToAlumnoUseCase } from '../../application/assign-routine-to-alumno.use-case';
import { UpdateRoutineInstanceUseCase } from '../../application/update-routine-instance.use-case';
import { ReplaceInstanceExercisesUseCase } from '../../application/replace-instance-exercises.use-case';
import { CreateRoutineInstanceDto } from './dto/create-routine-instance.dto';
import { UpdateRoutineInstanceDto } from './dto/update-routine-instance.dto';
import { ReplaceExercisesDto } from './dto/replace-exercises.dto';
import { toEjercicioItems } from './dto/ejercicio.mapper';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@Controller('routine-instances')
@Roles(Role.PROFESOR)
export class RoutineInstancesController {
  constructor(
    private readonly assignUseCase: AssignRoutineToAlumnoUseCase,
    private readonly updateUseCase: UpdateRoutineInstanceUseCase,
    private readonly replaceExercisesUseCase: ReplaceInstanceExercisesUseCase,
  ) {}

  @Post()
  async create(@Body() dto: CreateRoutineInstanceDto, @Req() req: RequestWithUser) {
    return this.assignUseCase.execute({
      invocadoPor: req.user,
      alumnoId: dto.alumnoId,
      nombre: dto.nombre,
      origenTemplateId: dto.origenTemplateId,
      ejercicios: dto.ejercicios ? toEjercicioItems(dto.ejercicios) : undefined,
    });
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRoutineInstanceDto,
    @Req() req: RequestWithUser,
  ) {
    return this.updateUseCase.execute({
      invocadoPor: req.user,
      instanceId: id,
      nombre: dto.nombre,
    });
  }

  @Put(':id/exercises')
  @HttpCode(204)
  async replaceExercises(
    @Param('id') id: string,
    @Body() dto: ReplaceExercisesDto,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    await this.replaceExercisesUseCase.execute({
      invocadoPor: req.user,
      instanceId: id,
      ejercicios: toEjercicioItems(dto.ejercicios),
    });
  }
}
