import { Body, Controller, Param, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../../identity/infrastructure/decorators/roles.decorator';
import { Role } from '../../../identity/domain/role';
import { AuthenticatedUser } from '../../../identity/domain/authenticated-user';
import { UpdateRoutineInstanceUseCase } from '../../application/update-routine-instance.use-case';
import { UpdateRoutineInstanceDto } from './dto/update-routine-instance.dto';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@Controller('routine-instances')
@Roles(Role.PROFESOR)
export class RoutineInstancesController {
  constructor(private readonly updateUseCase: UpdateRoutineInstanceUseCase) {}

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
}
