-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Exercise_activo_idx" ON "Exercise"("activo");
