import { ExerciseRepositoryPort } from '../../exercise-catalog/application/ports/exercise-repository.port';
import { EjercicioItem } from './ports/routine-template-repository.port';

export interface RutinaVigenteEjercicioResuelto {
  exerciseId: string;
  nombre: string;
  imageUrl: string | null;
  gifUrl: string | null;
  orden: number;
  series: number;
  repeticiones: number;
  peso: number | null;
  notas: string | null;
}

export interface RutinaVigenteDiaOutput {
  numero: number;
  ejercicios: RutinaVigenteEjercicioResuelto[];
}

export interface RutinaVigenteOutput {
  id: string;
  nombre: string;
  dias: RutinaVigenteDiaOutput[];
}

/** Resuelve nombre/media de todos los días con UN solo `findByIds`. */
export async function resolverDiasDeRutina(
  exerciseRepository: ExerciseRepositoryPort,
  dias: ReadonlyArray<{ numero: number; ejercicios: EjercicioItem[] }>,
): Promise<RutinaVigenteDiaOutput[]> {
  const ids = [...new Set(dias.flatMap((d) => d.ejercicios.map((e) => e.exerciseId)))];
  const catalogados = ids.length > 0 ? await exerciseRepository.findByIds(ids) : [];
  const porId = new Map(catalogados.map((e) => [e.id, e]));

  return dias.map((dia) => ({
    numero: dia.numero,
    ejercicios: dia.ejercicios.map((e) => {
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
        notas: e.notas,
      };
    }),
  }));
}
