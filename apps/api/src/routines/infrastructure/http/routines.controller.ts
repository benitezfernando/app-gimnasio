import { Controller, Get, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../../identity/infrastructure/decorators/roles.decorator';
import { Role } from '../../../identity/domain/role';
import { AuthenticatedUser } from '../../../identity/domain/authenticated-user';
import { GetAlumnoRutinaVigenteAsProfesorUseCase } from '../../application/get-alumno-rutina-vigente-as-profesor.use-case';
import { GetMiRutinaVigenteUseCase } from '../../application/get-mi-rutina-vigente.use-case';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

/**
 * Sub-recursos de usuario, no de rutina — mismo patrón que
 * `CarteraController` de 3A (prefijo `users`, archivo separado).
 */
@Controller('users')
export class RoutinesController {
  constructor(
    private readonly getAlumnoRutinaUseCase: GetAlumnoRutinaVigenteAsProfesorUseCase,
    private readonly getMiRutinaUseCase: GetMiRutinaVigenteUseCase,
  ) {}

  // Ruta estática ANTES que la paramétrica: Express/Nest matchea por
  // orden de registro, y ':alumnoId' captura literalmente "me" si va
  // primero — dejaría el endpoint del ALUMNO inalcanzable.
  @Get('me/rutina-vigente')
  @Roles(Role.ALUMNO)
  async miRutina(@Req() req: RequestWithUser) {
    return this.getMiRutinaUseCase.execute({ invocadoPor: req.user });
  }

  @Get(':alumnoId/rutina-vigente')
  @Roles(Role.PROFESOR)
  async rutinaDeAlumno(@Param('alumnoId') alumnoId: string, @Req() req: RequestWithUser) {
    return this.getAlumnoRutinaUseCase.execute({ invocadoPor: req.user, alumnoId });
  }
}
