import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../../../identity/infrastructure/decorators/roles.decorator';
import { Role } from '../../../identity/domain/role';
import { CreateAdminUseCase } from '../../application/create-admin.use-case';
import { ListAdminsUseCase } from '../../application/list-admins.use-case';
import { EditAdminUseCase } from '../../application/edit-admin.use-case';
import { CreateAdminDto } from './dto/create-admin.dto';
import { EditUserDto } from '../../../identity/infrastructure/http/dto/edit-user.dto';
import { toUserResponse } from '../../../identity/infrastructure/http/user-response.mapper';

@Controller('super-admin/admins')
@Roles(Role.SUPER_ADMIN)
export class SuperAdminController {
  constructor(
    private readonly createAdminUseCase: CreateAdminUseCase,
    private readonly listAdminsUseCase: ListAdminsUseCase,
    private readonly editAdminUseCase: EditAdminUseCase,
  ) {}

  @Post()
  async create(@Body() dto: CreateAdminDto) {
    const admin = await this.createAdminUseCase.execute(dto);
    return toUserResponse(admin);
  }

  @Get()
  async list() {
    const admins = await this.listAdminsUseCase.execute();
    return admins.map(toUserResponse);
  }

  @Patch(':id')
  async edit(@Param('id') id: string, @Body() dto: EditUserDto) {
    if (dto.nombre === undefined && dto.password === undefined) {
      throw new BadRequestException('Mandá al menos uno de: nombre, password.');
    }
    const admin = await this.editAdminUseCase.execute({
      adminId: id,
      nombre: dto.nombre,
      password: dto.password,
    });
    return toUserResponse(admin);
  }
}
