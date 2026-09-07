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
import { RutinaVigenteOutput } from './get-alumno-rutina-vigente-as-profesor.use-case';

export interface GetMiRutinaVigenteInput {
  invocadoPor: AuthenticatedUser;
}

/** HU-08 — el ALUMNO ve siempre SU PROPIA rutina, nunca un alumnoId externo. */
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

    const catalogados = await this.exerciseRepository.findByIds(
      instancia.ejercicios.map((e) => e.exerciseId),
    );
    const porId = new Map(catalogados.map((e) => [e.id, e]));

    return {
      id: instancia.id,
      nombre: instancia.nombre,
      ejercicios: instancia.ejercicios.map((e) => {
        const catalogo = porId.get(e.exerciseId);
        return {
          exerciseId: e.exerciseId,
          nombre: catalogo?.nombre ?? '(ejercicio no encontrado)',
          imageUrl: catalogo?.imageUrl ?? null,
          gifUrl: catalogo?.gifUrl ?? null,
          orden: e.orden,
          series: e.series,
          repeticiones: e.repeticiones,
          peso: e.peso,
          descanso: e.descanso,
          notas: e.notas,
        };
      }),
    };
  }
}
