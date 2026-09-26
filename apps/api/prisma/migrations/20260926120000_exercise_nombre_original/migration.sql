-- Guarda el nombre original en inglés del dataset (nunca se persistió
-- antes: la traducción a español sobrescribió Exercise.nombre sin dejar
-- rastro). Se usa para mostrarlo entre paréntesis y para que la búsqueda
-- matchee también por el nombre original. Backfill vía
-- prisma/backfill-nombre-original.ts + prisma/exercise-original-names.json
-- (corre a demanda, igual que el resto de los scripts de catálogo).
ALTER TABLE "Exercise" ADD COLUMN "nombreOriginal" TEXT;
ALTER TABLE "Exercise" ADD COLUMN "nombreOriginalNormalizado" TEXT NOT NULL DEFAULT '';

CREATE INDEX "Exercise_nombreOriginalNormalizado_idx" ON "Exercise"("nombreOriginalNormalizado");
