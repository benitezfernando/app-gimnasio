import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { ExerciseCatalogModule } from '../exercise-catalog/exercise-catalog.module';
import { ROUTINE_TEMPLATE_REPOSITORY } from './application/ports/routine-template-repository.port';
import { ROUTINE_INSTANCE_REPOSITORY } from './application/ports/routine-instance-repository.port';
import { PrismaRoutineTemplateRepository } from './infrastructure/persistence/prisma-routine-template.repository';
import { PrismaRoutineInstanceRepository } from './infrastructure/persistence/prisma-routine-instance.repository';
import { CreateRoutineTemplateUseCase } from './application/create-routine-template.use-case';
import { ListRoutineTemplatesUseCase } from './application/list-routine-templates.use-case';
import { GetRoutineTemplateUseCase } from './application/get-routine-template.use-case';
import { UpdateRoutineTemplateUseCase } from './application/update-routine-template.use-case';
import { ReplaceTemplateExercisesUseCase } from './application/replace-template-exercises.use-case';
import { DeleteRoutineTemplateUseCase } from './application/delete-routine-template.use-case';
import { AssignRoutineToAlumnoUseCase } from './application/assign-routine-to-alumno.use-case';
import { UpdateRoutineInstanceUseCase } from './application/update-routine-instance.use-case';
import { ReplaceInstanceExercisesUseCase } from './application/replace-instance-exercises.use-case';
import { GetAlumnoRutinaVigenteAsProfesorUseCase } from './application/get-alumno-rutina-vigente-as-profesor.use-case';
import { GetMiRutinaVigenteUseCase } from './application/get-mi-rutina-vigente.use-case';
import { RoutineTemplatesController } from './infrastructure/http/routine-templates.controller';
import { RoutineInstancesController } from './infrastructure/http/routine-instances.controller';
import { RoutinesController } from './infrastructure/http/routines.controller';

@Module({
  imports: [IdentityModule, ExerciseCatalogModule],
  controllers: [RoutineTemplatesController, RoutineInstancesController, RoutinesController],
  providers: [
    { provide: ROUTINE_TEMPLATE_REPOSITORY, useClass: PrismaRoutineTemplateRepository },
    { provide: ROUTINE_INSTANCE_REPOSITORY, useClass: PrismaRoutineInstanceRepository },
    CreateRoutineTemplateUseCase,
    ListRoutineTemplatesUseCase,
    GetRoutineTemplateUseCase,
    UpdateRoutineTemplateUseCase,
    ReplaceTemplateExercisesUseCase,
    DeleteRoutineTemplateUseCase,
    AssignRoutineToAlumnoUseCase,
    UpdateRoutineInstanceUseCase,
    ReplaceInstanceExercisesUseCase,
    GetAlumnoRutinaVigenteAsProfesorUseCase,
    GetMiRutinaVigenteUseCase,
  ],
})
export class RoutinesModule {}
