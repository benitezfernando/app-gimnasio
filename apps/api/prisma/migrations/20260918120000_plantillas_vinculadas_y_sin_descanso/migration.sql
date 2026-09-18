-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "nombreNormalizado" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "Exercise_nombreNormalizado_idx" ON "Exercise"("nombreNormalizado");

-- AlterTable
ALTER TABLE "RoutineTemplateExercise" DROP COLUMN "descanso";

-- AlterTable
ALTER TABLE "RoutineInstanceExercise" DROP COLUMN "descanso";

-- AlterTable
ALTER TABLE "RoutineInstance" ADD COLUMN     "vinculada" BOOLEAN NOT NULL DEFAULT false;
