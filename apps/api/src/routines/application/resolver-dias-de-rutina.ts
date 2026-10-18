import { ExerciseRepositoryPort } from '../../exercise-catalog/application/ports/exercise-repository.port';
import { EjercicioItem } from './ports/routine-template-repository.port';

export interface RutinaVigenteEjercicioResuelto {
  exerciseId: string;
  nombre: string;
  /** Nombre del catálogo cuando `nombre` es un alias del profesor dueño; `null` si no hay alias. */
  nombreCatalogo: string | null;
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

/**
 * Resuelve nombre/media de todos los días con UN solo `findByIds`. El nombre
 * se resuelve con el alias del profesor dueño de la rutina (`aliasDeProfesorId`);
 * sin dueño (`null`/ausente), con el del catálogo.
 */
export async function resolverDiasDeRutina(
  exerciseRepository: ExerciseRepositoryPort,
  dias: ReadonlyArray<{ numero: number; ejercicios: EjercicioItem[] }>,
  aliasDeProfesorId?: string | null,
): Promise<RutinaVigenteDiaOutput[]> {
  const ids = [...new Set(dias.flatMap((d) => d.ejercicios.map((e) => e.exerciseId)))];
  const catalogados =
    ids.length > 0 ? await exerciseRepository.findByIds(ids, aliasDeProfesorId ?? undefined) : [];
  const porId = new Map(catalogados.map((e) => [e.id, e]));

  return dias.map((dia) => ({
    numero: dia.numero,
    ejercicios: dia.ejercicios.map((e) => {
      const catalogo = porId.get(e.exerciseId);
      return {
        exerciseId: e.exerciseId,
        nombre: catalogo?.nombre ?? '(ejercicio no encontrado)',
        nombreCatalogo: catalogo?.nombreCatalogo ?? null,
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
