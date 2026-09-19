/**
 * Uso único — traduce TODO el catálogo de ejercicios al español y activa
 * los 1324 (reemplaza la curación anterior de 58 en `curate-exercises.ts`,
 * que queda en el repo como historial pero ya no refleja el estado
 * deseado del catálogo). Las traducciones de `exercise-translations-es.json`
 * salen de un traductor por diccionario (equipo/movimiento/modificador)
 * corrido sobre los 1324 nombres en inglés — no son 100% naturales en
 * todos los casos, pero cubren el vocabulario completo del dataset sin
 * dejar palabras en inglés sueltas.
 *
 * Uso:
 *   npx tsx prisma/translate-and-activate-all-exercises.ts --dry-run
 *   npx tsx prisma/translate-and-activate-all-exercises.ts
 */
import 'dotenv/config';
import { ExerciseSource, PrismaClient } from '@prisma/client';
import traducciones from './exercise-translations-es.json';
import { normalizarNombre } from '../src/exercise-catalog/normalizar-nombre';

const prisma = new PrismaClient();
const TAMANO_LOTE = 100;

interface Traduccion {
  externalId: string;
  nombreEs: string;
}

function partirEnLotes<T>(items: T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) {
    lotes.push(items.slice(i, i + tamano));
  }
  return lotes;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const items = traducciones as Traduccion[];

  const idsDuplicados = items.map((t) => t.externalId);
  if (new Set(idsDuplicados).size !== idsDuplicados.length) {
    console.error('ERROR: hay externalId duplicados en exercise-translations-es.json');
    process.exit(1);
  }

  const totalCatalogo = await prisma.exercise.count({ where: { fuente: ExerciseSource.CATALOG } });
  const existentes = await prisma.exercise.findMany({
    where: { fuente: ExerciseSource.CATALOG },
    select: { externalId: true, nombre: true },
  });
  const existentesPorExternalId = new Map(existentes.map((e) => [e.externalId, e]));

  const faltantes = items.filter((t) => !existentesPorExternalId.has(t.externalId));
  if (faltantes.length > 0) {
    console.error(
      `ERROR: ${faltantes.length} externalId de exercise-translations-es.json no existen en la DB:`,
      faltantes.slice(0, 10).map((f) => f.externalId),
    );
    process.exit(1);
  }
  const sinTraduccion = existentes.filter(
    (e) => e.externalId && !items.some((t) => t.externalId === e.externalId),
  );
  if (sinTraduccion.length > 0) {
    console.error(
      `ERROR: ${sinTraduccion.length} ejercicios del catálogo no tienen traducción en el archivo:`,
      sinTraduccion.slice(0, 10).map((e) => e.externalId),
    );
    process.exit(1);
  }

  console.log(`Catálogo CATALOG en DB: ${totalCatalogo}. Traducciones a aplicar: ${items.length}.`);
  console.log('\n--- Muestra de cambios (primeros 10) ---');
  for (const t of items.slice(0, 10)) {
    const actual = existentesPorExternalId.get(t.externalId)!;
    console.log(`"${actual.nombre}" -> "${t.nombreEs}"`);
  }

  if (dryRun) {
    console.log('\n[--dry-run] No se escribió nada.');
    await prisma.$disconnect();
    return;
  }

  const lotes = partirEnLotes(items, TAMANO_LOTE);
  let procesados = 0;
  for (const lote of lotes) {
    const operaciones = lote.map((t) =>
      prisma.exercise.update({
        where: { externalId: t.externalId },
        data: {
          nombre: t.nombreEs,
          nombreNormalizado: normalizarNombre(t.nombreEs),
          activo: true,
        },
      }),
    );
    await prisma.$transaction(operaciones);
    procesados += lote.length;
    console.log(`Procesados ${procesados}/${items.length}...`);
  }

  const activosDespues = await prisma.exercise.count({
    where: { fuente: ExerciseSource.CATALOG, activo: true },
  });
  console.log(`\nListo. Ejercicios CATALOG activos ahora: ${activosDespues}/${totalCatalogo}.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
