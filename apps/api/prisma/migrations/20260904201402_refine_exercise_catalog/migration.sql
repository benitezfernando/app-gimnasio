-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_externalId_key" ON "Exercise"("externalId");

-- CreateIndex
CREATE INDEX "Exercise_grupoMuscular_idx" ON "Exercise"("grupoMuscular");

-- CreateIndex
CREATE INDEX "Exercise_categoria_idx" ON "Exercise"("categoria");
