-- Se truncan las 2 filas de fixture cargadas por error contra Supabase real
-- en una sesión anterior (su externalId no matchea el dataset real de
-- exercises-dataset, así que un upsert no las iba a pisar — quedarían
-- huérfanas y con columnas rotas tras este ALTER). Ver
-- docs/superpowers/specs/2026-09-06-exercise-catalog-design.md, sección
-- "Contexto y hallazgos previos al diseño".
DELETE FROM "Exercise";

-- DropIndex
DROP INDEX "Exercise_categoria_idx";

-- DropIndex
DROP INDEX "Exercise_grupoMuscular_idx";

-- AlterTable
ALTER TABLE "Exercise" DROP COLUMN "categoria",
ADD COLUMN     "parteCuerpo" TEXT NOT NULL,
ADD COLUMN     "pasos" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- DropEnum
DROP TYPE "ExerciseCategory";

-- CreateIndex
CREATE INDEX "Exercise_parteCuerpo_idx" ON "Exercise"("parteCuerpo");

-- CreateIndex
CREATE INDEX "Exercise_equipamiento_idx" ON "Exercise"("equipamiento");
