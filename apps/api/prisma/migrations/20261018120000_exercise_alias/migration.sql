-- Alias de nombre de ejercicio por profesor. Tabla nueva, sin tocar ninguna
-- tabla existente y sin backfill: el catálogo "Exercise" no se modifica.
-- Se borra en cascada con el profesor o con el ejercicio.

-- CreateTable
CREATE TABLE "ExerciseAlias" (
    "id" TEXT NOT NULL,
    "profesorId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombreNormalizado" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseAlias_profesorId_exerciseId_key" ON "ExerciseAlias"("profesorId", "exerciseId");

-- CreateIndex
CREATE INDEX "ExerciseAlias_profesorId_nombreNormalizado_idx" ON "ExerciseAlias"("profesorId", "nombreNormalizado");

-- AddForeignKey
ALTER TABLE "ExerciseAlias" ADD CONSTRAINT "ExerciseAlias_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseAlias" ADD CONSTRAINT "ExerciseAlias_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
