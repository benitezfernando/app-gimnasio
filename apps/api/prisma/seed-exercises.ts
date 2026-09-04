import { Prisma, PrismaClient, ExerciseCategory, ExerciseSource } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const prisma = new PrismaClient();

const LICENCIA_MEDIA = 'Gym Visual - uso comercial requiere licencia propia';
const ATRIBUCION_MEDIA = '© Gym Visual - https://gymvisual.com/';
const TAMANO_LOTE = 100;

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
  if (!item?.muscle_group || String(item.muscle_group).trim().length === 0) {
    throw new Error(
      `seed-exercises: item con id="${identificador}" no tiene 'muscle_group' (o está vacío). Campo requerido en el schema.`,
    );
  }
}

function mapCategoria(raw: string, categoriasNoReconocidas: Set<string>): ExerciseCategory {
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
      categoriasNoReconocidas.add(raw);
      return ExerciseCategory.OTHER;
  }
}

function cargarDataset(rutaJson: string): DatasetExercise[] {
  const contenido = readFileSync(rutaJson, 'utf-8');
  return JSON.parse(contenido) as DatasetExercise[];
}

/** Campos compartidos entre `create` y `update` — una sola fuente de verdad para el mapeo. */
function mapFields(item: DatasetExercise, categoria: ExerciseCategory) {
  return {
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
  };
}

function buildUpsert(item: DatasetExercise, index: number, categoriasNoReconocidas: Set<string>) {
  validarItem(item, index);
  const categoria = mapCategoria(item.category, categoriasNoReconocidas);
  const campos = mapFields(item, categoria);

  return {
    categoria,
    operacion: prisma.exercise.upsert({
      where: { externalId: item.id },
      create: {
        externalId: item.id,
        gymId: null,
        fuente: ExerciseSource.CATALOG,
        ...campos,
      },
      update: campos,
    }),
  };
}

function partirEnLotes<T>(items: T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) {
    lotes.push(items.slice(i, i + tamano));
  }
  return lotes;
}

async function main(): Promise<void> {
  const rutaDataset = process.env.EXERCISES_DATASET_PATH
    ? join(process.env.EXERCISES_DATASET_PATH, 'data', 'exercises.json')
    : join(__dirname, 'seed-exercises.fixture.json');

  const ejercicios = cargarDataset(rutaDataset);
  console.log(`Importando ${ejercicios.length} ejercicios desde ${rutaDataset}...`);

  const categoriasNoReconocidas = new Set<string>();
  let contadorOther = 0;

  const lotes = partirEnLotes(ejercicios, TAMANO_LOTE);
  let procesados = 0;

  for (const lote of lotes) {
    const upserts = lote.map((item, indiceEnLote) =>
      buildUpsert(item, procesados + indiceEnLote, categoriasNoReconocidas),
    );

    await prisma.$transaction(upserts.map((u) => u.operacion) as Prisma.PrismaPromise<unknown>[]);

    for (const { categoria } of upserts) {
      if (categoria === ExerciseCategory.OTHER) {
        contadorOther += 1;
      }
    }
    procesados += lote.length;
  }

  if (contadorOther > 0) {
    console.warn(
      `Atención: ${contadorOther} ejercicio(s) cayeron en categoría OTHER por categoría no reconocida. ` +
        `Valores crudos no mapeados: ${Array.from(categoriasNoReconocidas).join(', ')}`,
    );
  }

  console.log(
    `Listo: ${ejercicios.length} ejercicios importados/actualizados (fuente: CATALOG, ${ATRIBUCION_MEDIA}).`,
  );
}

main()
  .catch((error) => {
    console.error('Error corriendo el seed de ejercicios:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
