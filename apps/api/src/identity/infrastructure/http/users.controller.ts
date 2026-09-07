import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../../domain/role';
import { AuthenticatedUser } from '../../domain/authenticated-user';
import { CreateUserUseCase } from '../../application/create-user.use-case';
import { ListUsersUseCase } from '../../application/list-users.use-case';
import { DeactivateUserUseCase } from '../../application/deactivate-user.use-case';
import { GetUserDeletionImpactUseCase } from '../../application/get-user-deletion-impact.use-case';
import { DeleteUserPermanentlyUseCase } from '../../application/delete-user-permanently.use-case';
import { CreateProfesorDto } from './dto/create-profesor.dto';
import { CreateAlumnoDto } from './dto/create-alumno.dto';
import { toUserResponse } from './user-response.mapper';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@Controller('users')
export class UsersController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly listUsersUseCase: ListUsersUseCase,
    private readonly deactivateUserUseCase: DeactivateUserUseCase,
    private readonly getUserDeletionImpactUseCase: GetUserDeletionImpactUseCase,
    private readonly deleteUserPermanentlyUseCase: DeleteUserPermanentlyUseCase,
  ) {}

  @Post('profesor')
  @Roles(Role.ADMIN)
  async createProfesor(@Body() dto: CreateProfesorDto, @Req() req: RequestWithUser) {
    const user = await this.createUserUseCase.execute({
      role: Role.PROFESOR,
      username: dto.username,
      nombre: dto.nombre,
      password: dto.password,
      invocadoPor: req.user,
    });
    return toUserResponse(user);
  }

  @Post('alumno')
  @Roles(Role.ADMIN, Role.PROFESOR)
  async createAlumno(@Body() dto: CreateAlumnoDto, @Req() req: RequestWithUser) {
    const user = await this.createUserUseCase.execute({
      role: Role.ALUMNO,
      nombre: dto.nombre,
      apellido: dto.apellido,
      invocadoPor: req.user,
    });
    return toUserResponse(user);
  }

  @Get('me')
  me(@Req() req: RequestWithUser) {
    return { id: req.user.id, gymId: req.user.gymId, role: req.user.role };
  }

  @Get()
  @Roles(Role.ADMIN)
  async list(@Query('role') role: string | undefined, @Req() req: RequestWithUser) {
    const users = await this.listUsersUseCase.execute({
      invocadoPor: req.user,
      role: this.parsearRoleFiltro(role),
    });
    return users.map(toUserResponse);
  }

  @Patch(':id/deactivate')
  @Roles(Role.ADMIN)
  async deactivate(@Param('id') id: string, @Req() req: RequestWithUser) {
    const user = await this.deactivateUserUseCase.execute({ invocadoPor: req.user, userId: id });
    return toUserResponse(user);
  }

  @Get(':id/deletion-impact')
  @Roles(Role.ADMIN)
  async deletionImpact(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.getUserDeletionImpactUseCase.execute({ invocadoPor: req.user, userId: id });
  }

  @Delete(':id/permanent')
  @Roles(Role.ADMIN)
  @HttpCode(200)
  async deletePermanently(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.deleteUserPermanentlyUseCase.execute({ invocadoPor: req.user, userId: id });
  }

  private parsearRoleFiltro(role: string | undefined): Role | undefined {
    if (role === undefined) return undefined;
    if (!Object.values(Role).includes(role as Role)) {
      throw new BadRequestException(`role debe ser uno de: ${Object.values(Role).join(', ')}`);
    }
    return role as Role;
  }
}
