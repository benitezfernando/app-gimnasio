-- DropForeignKey
ALTER TABLE "RoutineInstance" DROP CONSTRAINT "RoutineInstance_profesorId_fkey";

-- AlterTable
ALTER TABLE "RoutineInstance" ALTER COLUMN "profesorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RoutineInstanceExercise" ADD COLUMN     "peso" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "RoutineTemplateExercise" ADD COLUMN     "peso" DECIMAL(5,2);

-- AddForeignKey
ALTER TABLE "RoutineInstance" ADD CONSTRAINT "RoutineInstance_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
