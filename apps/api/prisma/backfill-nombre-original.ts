/**
 * Uso único — completa `nombreOriginal`/`nombreOriginalNormalizado` de
 * los ejercicios del catálogo con el nombre en inglés del dataset
 * original (nunca se persistió: la traducción a español sobrescribió
 * `nombre` sin dejar rastro). Ver
 * `prisma/exercise-original-names.json` (extraído a mano una sola vez
 * desde https://github.com/hasaneyldrm/exercises-dataset, rama main).
 *
 * Uso:
 *   npx tsx prisma/backfill-nombre-original.ts --dry-run
 *   npx tsx prisma/backfill-nombre-original.ts
 */
import 'dotenv/config';
import { ExerciseSource, PrismaClient } from '@prisma/client';
import nombresOriginales from './exercise-original-names.json';
import { normalizarNombre } from '../src/exercise-catalog/normalizar-nombre';

const prisma = new PrismaClient();
const TAMANO_LOTE = 100;

interface NombreOriginal {
  externalId: string;
  nombreOriginal: string;
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
  const items = nombresOriginales as NombreOriginal[];

  const idsDuplicados = items.map((n) => n.externalId);
  if (new Set(idsDuplicados).size !== idsDuplicados.length) {
    console.error('ERROR: hay externalId duplicados en exercise-original-names.json');
    process.exit(1);
  }

  const existentes = await prisma.exercise.findMany({
    where: { fuente: ExerciseSource.CATALOG },
    select: { externalId: true, nombre: true },
  });
  const existentesPorExternalId = new Map(existentes.map((e) => [e.externalId, e]));

  const faltantes = items.filter((n) => !existentesPorExternalId.has(n.externalId));
  if (faltantes.length > 0) {
    console.error(
      `ERROR: ${faltantes.length} externalId de exercise-original-names.json no existen en la DB:`,
      faltantes.slice(0, 10).map((f) => f.externalId),
    );
    process.exit(1);
  }
  const sinNombreOriginal = existentes.filter(
    (e) => e.externalId && !items.some((n) => n.externalId === e.externalId),
  );
  if (sinNombreOriginal.length > 0) {
    console.error(
      `ERROR: ${sinNombreOriginal.length} ejercicios del catálogo no tienen nombre original en el archivo:`,
      sinNombreOriginal.slice(0, 10).map((e) => e.externalId),
    );
    process.exit(1);
  }

  console.log(
    `Catálogo CATALOG en DB: ${existentes.length}. Nombres originales a aplicar: ${items.length}.`,
  );
  console.log('\n--- Muestra (primeros 10) ---');
  for (const n of items.slice(0, 10)) {
    const actual = existentesPorExternalId.get(n.externalId)!;
    console.log(`"${actual.nombre}" -> nombreOriginal: "${n.nombreOriginal}"`);
  }

  if (dryRun) {
    console.log('\n[--dry-run] No se escribió nada.');
    await prisma.$disconnect();
    return;
  }

  const lotes = partirEnLotes(items, TAMANO_LOTE);
  let procesados = 0;
  for (const lote of lotes) {
    const operaciones = lote.map((n) =>
      prisma.exercise.update({
        where: { externalId: n.externalId },
        data: {
          nombreOriginal: n.nombreOriginal,
          nombreOriginalNormalizado: normalizarNombre(n.nombreOriginal),
        },
      }),
    );
    await prisma.$transaction(operaciones);
    procesados += lote.length;
    console.log(`Procesados ${procesados}/${items.length}...`);
  }

  const conNombreOriginal = await prisma.exercise.count({
    where: { fuente: ExerciseSource.CATALOG, nombreOriginal: { not: null } },
  });
  console.log(
    `\nListo. Ejercicios CATALOG con nombreOriginal ahora: ${conNombreOriginal}/${existentes.length}.`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
