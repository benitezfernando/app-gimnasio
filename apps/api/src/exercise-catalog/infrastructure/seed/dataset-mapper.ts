/**
 * Forma real del dataset (verificada contra un checkout de
 * https://github.com/hasaneyldrm/exercises-dataset, rama main, 1.324
 * items) — la interfaz anterior de `seed-exercises.ts` estaba inferida de
 * la documentación pública y NO coincidía con el dataset real. Ver
 * docs/superpowers/specs/2026-09-06-exercise-catalog-design.md.
 */
export interface DatasetExercise {
  id: string;
  name: string;
  body_part: string;
  target: string;
  secondary_muscles: string[];
  equipment: string | null;
  image: string | null;
  gif_url: string | null;
  instructions?: Record<string, string>;
  instruction_steps?: Record<string, string[]>;
  attribution?: string;
}

const ATRIBUCION_MEDIA_FALLBACK = '© Gym visual — https://gymvisual.com/';
export const LICENCIA_MEDIA = 'Gym Visual - uso comercial requiere licencia propia';

export function validarDatasetExercise(item: DatasetExercise, index: number): void {
  const identificador =
    item?.id && String(item.id).trim().length > 0 ? item.id : `<sin id, índice ${index}>`;

  if (!item?.id || String(item.id).trim().length === 0) {
    throw new Error(
      `seed-exercises: item en índice ${index} no tiene 'id' (o está vacío). No se puede importar sin id.`,
    );
  }
  if (!item?.name || String(item.name).trim().length === 0) {
    throw new Error(
      `seed-exercises: item con id="${identificador}" no tiene 'name' (o está vacío). Campo requerido en el schema.`,
    );
  }
  if (!item?.body_part || String(item.body_part).trim().length === 0) {
    throw new Error(
      `seed-exercises: item con id="${identificador}" no tiene 'body_part' (o está vacío). Campo requerido en el schema.`,
    );
  }
}

export interface ExerciseFields {
  nombre: string;
  parteCuerpo: string;
  grupoMuscular: string;
  gruposMuscularesSecundarios: string[];
  equipamiento: string | null;
  imageUrl: string | null;
  gifUrl: string | null;
  instrucciones: string | null;
  pasos: string[];
  licenciaMedia: string;
  atribucionMedia: string;
}

/**
 * Mapea un item del dataset a los campos de `Exercise` — pura, sin I/O.
 * `resolverUrlMedia` resuelve la ruta relativa del dataset (ej.
 * "images/0001-x.jpg") a la URL pública final (Supabase Storage en
 * producción); se inyecta para poder testear el mapeo sin red.
 */
export function mapExerciseFields(
  item: DatasetExercise,
  resolverUrlMedia: (rutaRelativa: string | null) => string | null,
): ExerciseFields {
  return {
    nombre: item.name,
    parteCuerpo: item.body_part,
    grupoMuscular: item.target,
    gruposMuscularesSecundarios: item.secondary_muscles ?? [],
    equipamiento: item.equipment ?? null,
    imageUrl: item.image ? resolverUrlMedia(item.image) : null,
    gifUrl: item.gif_url ? resolverUrlMedia(item.gif_url) : null,
    instrucciones: item.instructions?.es ?? null,
    pasos: item.instruction_steps?.es ?? [],
    licenciaMedia: LICENCIA_MEDIA,
    atribucionMedia: item.attribution ?? ATRIBUCION_MEDIA_FALLBACK,
  };
}
