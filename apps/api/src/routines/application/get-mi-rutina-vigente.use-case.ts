import { Inject, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepositoryPort,
} from '../../exercise-catalog/application/ports/exercise-repository.port';
import {
  ROUTINE_INSTANCE_REPOSITORY,
  RoutineInstanceRepositoryPort,
} from './ports/routine-instance-repository.port';
import { RutinaVigenteOutput, resolverDiasDeRutina } from './resolver-dias-de-rutina';

export interface GetMiRutinaVigenteInput {
  invocadoPor: AuthenticatedUser;
}

/** HU-08 — el ALUMNO ve siempre SU PROPIA rutina, nunca un alumnoId externo. Sin datos de vínculo. */
@Injectable()
export class GetMiRutinaVigenteUseCase {
  constructor(
    @Inject(ROUTINE_INSTANCE_REPOSITORY)
    private readonly instanceRepository: RoutineInstanceRepositoryPort,
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
  ) {}

  async execute(input: GetMiRutinaVigenteInput): Promise<RutinaVigenteOutput | null> {
    const instancia = await this.instanceRepository.findVigentePorAlumno(input.invocadoPor.id);
    if (!instancia) {
      return null;
    }
    return {
      id: instancia.id,
      nombre: instancia.nombre,
      dias: await resolverDiasDeRutina(this.exerciseRepository, instancia.dias),
    };
  }
}
