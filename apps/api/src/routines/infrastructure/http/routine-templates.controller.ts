import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../../identity/infrastructure/decorators/roles.decorator';
import { Role } from '../../../identity/domain/role';
import { AuthenticatedUser } from '../../../identity/domain/authenticated-user';
import { CreateRoutineTemplateUseCase } from '../../application/create-routine-template.use-case';
import { ListRoutineTemplatesUseCase } from '../../application/list-routine-templates.use-case';
import { GetRoutineTemplateUseCase } from '../../application/get-routine-template.use-case';
import { UpdateRoutineTemplateUseCase } from '../../application/update-routine-template.use-case';
import { ReplaceTemplateExercisesUseCase } from '../../application/replace-template-exercises.use-case';
import { DeleteRoutineTemplateUseCase } from '../../application/delete-routine-template.use-case';
import { CreateRoutineTemplateDto } from './dto/create-routine-template.dto';
import { UpdateRoutineTemplateDto } from './dto/update-routine-template.dto';
import { ReplaceExercisesDto } from './dto/replace-exercises.dto';
import { toEjercicioItems } from './dto/ejercicio.mapper';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@Controller('routine-templates')
@Roles(Role.PROFESOR)
export class RoutineTemplatesController {
  constructor(
    private readonly createUseCase: CreateRoutineTemplateUseCase,
    private readonly listUseCase: ListRoutineTemplatesUseCase,
    private readonly getUseCase: GetRoutineTemplateUseCase,
    private readonly updateUseCase: UpdateRoutineTemplateUseCase,
    private readonly replaceExercisesUseCase: ReplaceTemplateExercisesUseCase,
    private readonly deleteUseCase: DeleteRoutineTemplateUseCase,
  ) {}

  @Post()
  async create(@Body() dto: CreateRoutineTemplateDto, @Req() req: RequestWithUser) {
    return this.createUseCase.execute({
      invocadoPor: req.user,
      nombre: dto.nombre,
      descripcion: dto.descripcion,
    });
  }

  @Get()
  async list(@Req() req: RequestWithUser) {
    return this.listUseCase.execute({ invocadoPor: req.user });
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.getUseCase.execute({ invocadoPor: req.user, templateId: id });
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRoutineTemplateDto,
    @Req() req: RequestWithUser,
  ) {
    return this.updateUseCase.execute({
      invocadoPor: req.user,
      templateId: id,
      nombre: dto.nombre,
      descripcion: dto.descripcion,
      activa: dto.activa,
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
      templateId: id,
      ejercicios: toEjercicioItems(dto.ejercicios),
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string, @Req() req: RequestWithUser): Promise<void> {
    await this.deleteUseCase.execute({ invocadoPor: req.user, templateId: id });
  }
}
