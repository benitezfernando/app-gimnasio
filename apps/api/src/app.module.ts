import { Module } from '@nestjs/common';
import { PrismaModule } from './shared-kernel/prisma.module';
import { IdentityModule } from './identity/identity.module';
import { ExerciseCatalogModule } from './exercise-catalog/exercise-catalog.module';
import { RoutinesModule } from './routines/routines.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [PrismaModule, IdentityModule, ExerciseCatalogModule, RoutinesModule, HealthModule],
})
export class AppModule {}
