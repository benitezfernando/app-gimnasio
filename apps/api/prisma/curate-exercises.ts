/**
 * Uso único — cura el catálogo de ejercicios a la lista tradicional
 * aprobada en docs/superpowers/specs/2026-09-13-exercise-catalog-curation-design.md.
 * No forma parte del build ni de ningún pipeline, igual que seed-admin.ts.
 *
 * Uso:
 *   npx tsx prisma/curate-exercises.ts --dry-run   (no escribe nada, solo imprime)
 *   npx tsx prisma/curate-exercises.ts             (aplica de verdad)
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import curados from './exercise-curation.json';

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const idsAConservar = curados.map((c) => c.id);
  const totalAntes = await prisma.exercise.count();
  const activosAntes = await prisma.exercise.count({ where: { activo: true } });

  console.log(`Catálogo actual: ${totalAntes} ejercicios, ${activosAntes} activos.`);
  console.log(`Lista curada: ${idsAConservar.length} ejercicios.`);

  const existentes = await prisma.exercise.findMany({
    where: { id: { in: idsAConservar } },
    select: { id: true, nombre: true },
  });
  const idsExistentes = new Set(existentes.map((e) => e.id));
  const faltantes = idsAConservar.filter((id) => !idsExistentes.has(id));
  if (faltantes.length > 0) {
    console.error('ERROR: estos IDs de la curación no existen en la DB:', faltantes);
    process.exit(1);
  }

  console.log('\n--- Plan de cambios ---');
  for (const c of curados) {
    const actual = existentes.find((e) => e.id === c.id)!;
    console.log(`ACTIVAR: "${actual.nombre}" -> "${c.nombreEs}"`);
  }
  console.log(`\nEl resto (${totalAntes - idsAConservar.length}) quedan con activo=false.`);

  if (dryRun) {
    console.log('\n[--dry-run] No se escribió nada.');
    await prisma.$disconnect();
    return;
  }

  const operaciones = [
    ...curados.map((c) =>
      prisma.exercise.update({
        where: { id: c.id },
        data: { activo: true, nombre: c.nombreEs },
      }),
    ),
    prisma.exercise.updateMany({
      where: { id: { notIn: idsAConservar } },
      data: { activo: false },
    }),
  ];
  await prisma.$transaction(operaciones);

  const activosDespues = await prisma.exercise.count({ where: { activo: true } });
  console.log(
    `\nListo. Ejercicios activos ahora: ${activosDespues} (esperado: ${idsAConservar.length}).`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
