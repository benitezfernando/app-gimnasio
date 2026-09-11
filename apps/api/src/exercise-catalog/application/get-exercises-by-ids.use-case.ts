import { Inject, Injectable } from '@nestjs/common';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepositoryPort,
  ExerciseSummary,
} from './ports/exercise-repository.port';

/**
 * Resuelve varios ejercicios en un solo query — evita que el frontend
 * dispare un GET /exercises/:id por cada línea de una plantilla/rutina
 * (hasta 50) cuando solo necesita nombre/imagen para mostrarlas. Ids que
 * no existen se omiten en silencio (no es un error: el llamador ya sabe
 * qué ids pidió, y una plantilla no puede referenciar un exerciseId
 * inexistente — lo valida ReplaceTemplateExercisesUseCase al guardar).
 */
@Injectable()
export class GetExercisesByIdsUseCase {
  constructor(
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
  ) {}

  async execute(ids: string[]): Promise<ExerciseSummary[]> {
    if (ids.length === 0) {
      return [];
    }
    return this.exerciseRepository.findByIds(ids);
  }
}
