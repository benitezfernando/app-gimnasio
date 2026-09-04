import { PrismaClient, ExerciseCategory, ExerciseSource } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const prisma = new PrismaClient();

const LICENCIA_MEDIA = 'Gym Visual - uso comercial requiere licencia propia';
const ATRIBUCION_MEDIA = '© Gym Visual - https://gymvisual.com/';

/**
 * IMPORTANTE: esta forma está inferida de la documentación pública del repo
 * fuente (Gym Visual / free-exercise-db-like dataset), NO fue verificada
 * contra un checkout real del dataset. Antes de apuntar
 * EXERCISES_DATASET_PATH a datos reales, correr el seed contra un checkout
 * real y confirmar que los nombres de campo, tipos y presencia/ausencia de
 * valores coinciden con esta interfaz. Si no coinciden, `validarItem`
 * fallará ruidosamente en lugar de escribir `undefined` en columnas
 * `String` requeridas del schema de Prisma.
 */
interface DatasetExercise {
  id: string;
  name: string;
  category: string;
  muscle_group: string;
  secondary_muscles: string[];
  equipment: string | null;
  image: string | null;
  gif_url: string | null;
  instructions?: { es?: string };
}

function validarItem(item: DatasetExercise, index: number): void {
  const identificador = item?.id && String(item.id).trim().length > 0 ? item.id : `<sin id, índice ${index}>`;

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
  if (!item?.muscle_group || String(item.muscle_group).trim().length === 0) {
    throw new Error(
      `seed-exercises: item con id="${identificador}" no tiene 'muscle_group' (o está vacío). Campo requerido en el schema.`,
    );
  }
}

function mapCategoria(raw: string, categoriasNoReconocidas?: Set<string>): ExerciseCategory {
  const normalizado = raw.trim().toLowerCase();
  switch (normalizado) {
    case 'strength':
      return ExerciseCategory.STRENGTH;
    case 'cardio':
      return ExerciseCategory.CARDIO;
    case 'stretching':
      return ExerciseCategory.STRETCHING;
    case 'plyometrics':
      return ExerciseCategory.PLYOMETRICS;
    default:
      categoriasNoReconocidas?.add(raw);
      return ExerciseCategory.OTHER;
  }
}

function cargarDataset(rutaJson: string): DatasetExercise[] {
  const contenido = readFileSync(rutaJson, 'utf-8');
  return JSON.parse(contenido) as DatasetExercise[];
}

async function seedExercise(
  item: DatasetExercise,
  index: number,
  categoriasNoReconocidas: Set<string>,
): Promise<ExerciseCategory> {
  validarItem(item, index);

  const categoria = mapCategoria(item.category, categoriasNoReconocidas);

  await prisma.exercise.upsert({
    where: { id: item.id },
    create: {
      id: item.id,
      gymId: null,
      nombre: item.name,
      categoria,
      grupoMuscular: item.muscle_group,
      gruposMuscularesSecundarios: item.secondary_muscles ?? [],
      equipamiento: item.equipment ?? null,
      imageUrl: item.image ?? null,
      gifUrl: item.gif_url ?? null,
      instrucciones: item.instructions?.es ?? null,
      fuente: ExerciseSource.CATALOG,
      licenciaMedia: LICENCIA_MEDIA,
      atribucionMedia: ATRIBUCION_MEDIA,
    },
    update: {
      nombre: item.name,
      categoria,
      grupoMuscular: item.muscle_group,
      gruposMuscularesSecundarios: item.secondary_muscles ?? [],
      equipamiento: item.equipment ?? null,
      imageUrl: item.image ?? null,
      gifUrl: item.gif_url ?? null,
      instrucciones: item.instructions?.es ?? null,
      licenciaMedia: LICENCIA_MEDIA,
      atribucionMedia: ATRIBUCION_MEDIA,
    },
  });

  return categoria;
}

async function main(): Promise<void> {
  const rutaDataset = process.env.EXERCISES_DATASET_PATH
    ? join(process.env.EXERCISES_DATASET_PATH, 'data', 'exercises.json')
    : join(__dirname, 'seed-exercises.fixture.json');

  const ejercicios = cargarDataset(rutaDataset);
  console.log(`Importando ${ejercicios.length} ejercicios desde ${rutaDataset}...`);

  const categoriasNoReconocidas = new Set<string>();
  let contadorOther = 0;

  for (const [index, item] of ejercicios.entries()) {
    const categoria = await seedExercise(item, index, categoriasNoReconocidas);
    if (categoria === ExerciseCategory.OTHER) {
      contadorOther += 1;
    }
  }

  if (contadorOther > 0) {
    console.warn(
      `Atención: ${contadorOther} ejercicio(s) cayeron en categoría OTHER por categoría no reconocida. ` +
        `Valores crudos no mapeados: ${Array.from(categoriasNoReconocidas).join(', ')}`,
    );
  }

  console.log(`Listo: ${ejercicios.length} ejercicios importados/actualizados (fuente: CATALOG, ${ATRIBUCION_MEDIA}).`);
}

main()
  .catch((error) => {
    console.error('Error corriendo el seed de ejercicios:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
