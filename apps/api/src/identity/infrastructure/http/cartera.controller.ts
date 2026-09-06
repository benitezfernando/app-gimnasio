import { Controller, Delete, Get, HttpCode, Param, Post, Body, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../../domain/role';
import { AuthenticatedUser } from '../../domain/authenticated-user';
import { AssignProfesorToAlumnoUseCase } from '../../application/cartera/assign-profesor-to-alumno.use-case';
import { RemoveProfesorFromAlumnoUseCase } from '../../application/cartera/remove-profesor-from-alumno.use-case';
import { ListCarteraUseCase } from '../../application/cartera/list-cartera.use-case';
import { ListProfesoresDeAlumnoUseCase } from '../../application/cartera/list-profesores-de-alumno.use-case';
import { AssignProfesorDto } from './dto/assign-profesor.dto';
import { toUserResponse } from './user-response.mapper';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

/**
 * Controller separado de `UsersController` (mismo prefijo `users`, Nest lo
 * permite) — gestión de cartera (HU-03b), no CRUD de usuarios. Rutas
 * literales (`me/alumnos`) y con param (`:alumnoId/profesores`) no
 * colisionan: difieren en el segundo segmento del path.
 */
@Controller('users')
export class CarteraController {
  constructor(
    private readonly assignProfesorToAlumnoUseCase: AssignProfesorToAlumnoUseCase,
    private readonly removeProfesorFromAlumnoUseCase: RemoveProfesorFromAlumnoUseCase,
    private readonly listCarteraUseCase: ListCarteraUseCase,
    private readonly listProfesoresDeAlumnoUseCase: ListProfesoresDeAlumnoUseCase,
  ) {}

  @Post(':alumnoId/profesores')
  @Roles(Role.ADMIN)
  async assign(
    @Param('alumnoId') alumnoId: string,
    @Body() dto: AssignProfesorDto,
    @Req() req: RequestWithUser,
  ) {
    return this.assignProfesorToAlumnoUseCase.execute({
      invocadoPor: req.user,
      alumnoId,
      profesorId: dto.profesorId,
    });
  }

  @Delete(':alumnoId/profesores/:profesorId')
  @Roles(Role.ADMIN)
  @HttpCode(204)
  async remove(
    @Param('alumnoId') alumnoId: string,
    @Param('profesorId') profesorId: string,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    await this.removeProfesorFromAlumnoUseCase.execute({
      invocadoPor: req.user,
      alumnoId,
      profesorId,
    });
  }

  @Get(':alumnoId/profesores')
  @Roles(Role.ADMIN)
  async listProfesoresDeAlumno(@Param('alumnoId') alumnoId: string, @Req() req: RequestWithUser) {
    const profesores = await this.listProfesoresDeAlumnoUseCase.execute({
      invocadoPor: req.user,
      alumnoId,
    });
    return profesores.map(toUserResponse);
  }

  @Get('me/alumnos')
  @Roles(Role.PROFESOR)
  async misAlumnos(@Req() req: RequestWithUser) {
    const alumnos = await this.listCarteraUseCase.execute({ invocadoPor: req.user });
    return alumnos.map(toUserResponse);
  }
}
