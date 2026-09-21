import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { PrismaModule } from '../shared-kernel/prisma.module';
import { CreateAdminUseCase } from './application/create-admin.use-case';
import { ListAdminsUseCase } from './application/list-admins.use-case';
import { EditAdminUseCase } from './application/edit-admin.use-case';
import { DeactivateAdminUseCase } from './application/deactivate-admin.use-case';
import { DeleteAdminPermanentlyUseCase } from './application/delete-admin-permanently.use-case';
import { SuperAdminController } from './infrastructure/http/super-admin.controller';

@Module({
  imports: [IdentityModule, PrismaModule],
  controllers: [SuperAdminController],
  providers: [
    CreateAdminUseCase,
    ListAdminsUseCase,
    EditAdminUseCase,
    DeactivateAdminUseCase,
    DeleteAdminPermanentlyUseCase,
  ],
})
export class SuperAdminModule {}
