import { Module } from '@nestjs/common';
import { IdentityModule } from './identity/identity.module';
import { ExerciseCatalogModule } from './exercise-catalog/exercise-catalog.module';
import { RoutinesModule } from './routines/routines.module';

@Module({
  imports: [IdentityModule, ExerciseCatalogModule, RoutinesModule],
})
export class AppModule {}
