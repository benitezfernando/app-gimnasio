import 'dotenv/config';
import { Prisma, PrismaClient, ExerciseSource } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXERCISE_MEDIA_BUCKET } from './exercise-media-bucket';
import {
  DatasetExercise,
  mapExerciseFields,
  validarDatasetExercise,
} from '../src/exercise-catalog/infrastructure/seed/dataset-mapper';

const prisma = new PrismaClient();
const TAMANO_LOTE = 100;

function cargarDataset(rutaJson: string): DatasetExercise[] {
  const contenido = readFileSync(rutaJson, 'utf-8');
  return JSON.parse(contenido) as DatasetExercise[];
}

function partirEnLotes<T>(items: T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) {
    lotes.push(items.slice(i, i + tamano));
  }
  return lotes;
}

function buildUpsert(
  item: DatasetExercise,
  index: number,
  resolverUrlMedia: (rutaRelativa: string | null) => string | null,
) {
  validarDatasetExercise(item, index);
  const campos = mapExerciseFields(item, resolverUrlMedia);

  return prisma.exercise.upsert({
    where: { externalId: item.id },
    create: {
      externalId: item.id,
      gymId: null,
      fuente: ExerciseSource.CATALOG,
      ...campos,
    },
    update: campos,
  });
}

async function main(): Promise<void> {
  const rutaDataset = process.env.EXERCISES_DATASET_PATH
    ? join(process.env.EXERCISES_DATASET_PATH, 'data', 'exercises.json')
    : join(__dirname, 'seed-exercises.fixture.json');

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridos');
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const resolverUrlMedia = (rutaRelativa: string | null): string | null => {
    if (!rutaRelativa) return null;
    return supabase.storage.from(EXERCISE_MEDIA_BUCKET).getPublicUrl(rutaRelativa).data.publicUrl;
  };

  const ejercicios = cargarDataset(rutaDataset);
  console.log(`Importando ${ejercicios.length} ejercicios desde ${rutaDataset}...`);

  const lotes = partirEnLotes(ejercicios, TAMANO_LOTE);
  let procesados = 0;

  for (const lote of lotes) {
    const upserts = lote.map((item, indiceEnLote) =>
      buildUpsert(item, procesados + indiceEnLote, resolverUrlMedia),
    );
    await prisma.$transaction(upserts as Prisma.PrismaPromise<unknown>[]);
    procesados += lote.length;
  }

  console.log(`Listo: ${ejercicios.length} ejercicios importados/actualizados (fuente: CATALOG).`);
}

main()
  .catch((error) => {
    console.error('Error corriendo el seed de ejercicios:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
