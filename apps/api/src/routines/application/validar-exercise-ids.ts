import { ExerciseRepositoryPort } from '../../exercise-catalog/application/ports/exercise-repository.port';
import { InvalidExerciseIdError } from './errors/invalid-exercise-id.error';

export async function validarExerciseIdsEnCatalogo(
  exerciseRepository: ExerciseRepositoryPort,
  ejercicios: ReadonlyArray<{ exerciseId: string }>,
): Promise<void> {
  const exerciseIds = new Set(ejercicios.map((e) => e.exerciseId));
  if (exerciseIds.size === 0) return;
  const catalogados = await exerciseRepository.findByIds([...exerciseIds]);
  if (catalogados.length !== exerciseIds.size) {
    const encontrados = new Set(catalogados.map((e) => e.id));
    const faltantes = [...exerciseIds].filter((id) => !encontrados.has(id));
    throw new InvalidExerciseIdError(faltantes);
  }
}
