-- Corrige un drift entre schema.prisma y la DB real: `pasos String[]` en
-- Prisma es no-nullable por contrato de tipos, pero la migración
-- 20260906135215_exercise_catalog_real_shape la había dejado sin NOT NULL.
-- Verificado antes de aplicar: 0 filas con pasos IS NULL (las 1.324 filas
-- reales vienen del seed, que siempre setea un array, aunque sea vacío).
ALTER TABLE "Exercise" ALTER COLUMN "pasos" SET NOT NULL;
