import { Body, Controller, HttpCode, Param, Patch, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../../identity/infrastructure/decorators/roles.decorator';
import { Role } from '../../../identity/domain/role';
import { AuthenticatedUser } from '../../../identity/domain/authenticated-user';
import { AssignRoutineToAlumnoUseCase } from '../../application/assign-routine-to-alumno.use-case';
import { UpdateRoutineInstanceUseCase } from '../../application/update-routine-instance.use-case';
import { ReplaceInstanceDaysUseCase } from '../../application/replace-instance-days.use-case';
import { CreateRoutineInstanceDto } from './dto/create-routine-instance.dto';
import { UpdateRoutineInstanceDto } from './dto/update-routine-instance.dto';
import { ReplaceInstanceDaysDto } from './dto/replace-instance-days.dto';
import { toDiasInstancia, toDiasNuevos } from './dto/dia.mapper';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@Controller('routine-instances')
@Roles(Role.PROFESOR)
export class RoutineInstancesController {
  constructor(
    private readonly assignUseCase: AssignRoutineToAlumnoUseCase,
    private readonly updateUseCase: UpdateRoutineInstanceUseCase,
    private readonly replaceDaysUseCase: ReplaceInstanceDaysUseCase,
  ) {}

  @Post()
  async create(@Body() dto: CreateRoutineInstanceDto, @Req() req: RequestWithUser) {
    return this.assignUseCase.execute({
      invocadoPor: req.user,
      alumnoId: dto.alumnoId,
      nombre: dto.nombre,
      dias: toDiasNuevos(dto.dias),
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

  @Put(':id/dias')
  @HttpCode(200)
  async replaceDias(
    @Param('id') id: string,
    @Body() dto: ReplaceInstanceDaysDto,
    @Req() req: RequestWithUser,
  ) {
    return this.replaceDaysUseCase.execute({
      invocadoPor: req.user,
      instanceId: id,
      dias: toDiasInstancia(dto.dias),
    });
  }
}
