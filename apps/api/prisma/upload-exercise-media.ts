import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXERCISE_MEDIA_BUCKET } from './exercise-media-bucket';

interface DatasetExerciseMedia {
  image: string | null;
  gif_url: string | null;
}

function contentTypeFor(rutaRelativa: string): string {
  return rutaRelativa.endsWith('.gif') ? 'image/gif' : 'image/jpeg';
}

/**
 * Sube a Supabase Storage solo los archivos de media EFECTIVAMENTE
 * referenciados por data/exercises.json (no todo lo que haya en el
 * checkout) — evita subir basura si el repo tiene archivos huérfanos.
 * Idempotente: si un archivo ya existe en el bucket, lo cuenta como
 * "salteado" en vez de fallar o volver a subirlo. Secuencial a propósito
 * (no paralelo) — es un script de una sola corrida, no un hot path;
 * confiabilidad ante flakiness de red importa más que velocidad acá.
 */
async function main(): Promise<void> {
  const datasetPath = process.env.EXERCISES_DATASET_PATH;
  if (!datasetPath) {
    throw new Error(
      'EXERCISES_DATASET_PATH no está configurado — apuntá a un checkout local de https://github.com/hasaneyldrm/exercises-dataset',
    );
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridos');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { error: errorBucket } = await supabase.storage.createBucket(EXERCISE_MEDIA_BUCKET, {
    public: true,
  });
  if (errorBucket && !errorBucket.message.includes('already exists')) {
    throw new Error(`No se pudo crear el bucket: ${errorBucket.message}`);
  }

  const rutaJson = join(datasetPath, 'data', 'exercises.json');
  const ejercicios = JSON.parse(readFileSync(rutaJson, 'utf-8')) as DatasetExerciseMedia[];

  const rutasUnicas = new Set<string>();
  for (const item of ejercicios) {
    if (item.image) rutasUnicas.add(item.image);
    if (item.gif_url) rutasUnicas.add(item.gif_url);
  }

  console.log(
    `Subiendo ${rutasUnicas.size} archivos de media al bucket '${EXERCISE_MEDIA_BUCKET}'...`,
  );

  let subidos = 0;
  let saltados = 0;
  let fallidos = 0;

  for (const rutaRelativa of rutasUnicas) {
    const rutaLocal = join(datasetPath, rutaRelativa);
    let buffer: Buffer;
    try {
      buffer = readFileSync(rutaLocal);
    } catch {
      console.error(`No se encontró el archivo local: ${rutaLocal}`);
      fallidos += 1;
      continue;
    }

    const { error } = await supabase.storage
      .from(EXERCISE_MEDIA_BUCKET)
      .upload(rutaRelativa, buffer, { contentType: contentTypeFor(rutaRelativa), upsert: false });

    if (error) {
      if (error.message.includes('already exists')) {
        saltados += 1;
      } else {
        console.error(`Falló la subida de ${rutaRelativa}: ${error.message}`);
        fallidos += 1;
      }
      continue;
    }

    subidos += 1;
  }

  console.log(`Listo: ${subidos} subidos, ${saltados} ya existían, ${fallidos} fallidos.`);
  if (fallidos > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Error corriendo la subida de media:', error);
  process.exitCode = 1;
});
