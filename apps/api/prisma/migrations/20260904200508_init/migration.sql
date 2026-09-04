-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PROFESOR', 'ALUMNO');

-- CreateEnum
CREATE TYPE "ExerciseSource" AS ENUM ('CATALOG', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ExerciseCategory" AS ENUM ('STRENGTH', 'CARDIO', 'STRETCHING', 'PLYOMETRICS', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "gymId" TEXT,
    "nombre" TEXT NOT NULL,
    "categoria" "ExerciseCategory" NOT NULL DEFAULT 'OTHER',
    "grupoMuscular" TEXT NOT NULL,
    "gruposMuscularesSecundarios" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "equipamiento" TEXT,
    "imageUrl" TEXT,
    "gifUrl" TEXT,
    "instrucciones" TEXT,
    "fuente" "ExerciseSource" NOT NULL DEFAULT 'CATALOG',
    "licenciaMedia" TEXT,
    "atribucionMedia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineTemplate" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "profesorId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutineTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineTemplateExercise" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "series" INTEGER NOT NULL,
    "repeticiones" INTEGER NOT NULL,
    "descanso" INTEGER NOT NULL,
    "notas" TEXT,

    CONSTRAINT "RoutineTemplateExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineInstance" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "profesorId" TEXT NOT NULL,
    "alumnoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "origenTemplateId" TEXT,
    "vigenteDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigenteHasta" TIMESTAMP(3),
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutineInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineInstanceExercise" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "series" INTEGER NOT NULL,
    "repeticiones" INTEGER NOT NULL,
    "descanso" INTEGER NOT NULL,
    "notas" TEXT,

    CONSTRAINT "RoutineInstanceExercise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_gymId_idx" ON "User"("gymId");

-- CreateIndex
CREATE UNIQUE INDEX "User_gymId_email_key" ON "User"("gymId", "email");

-- CreateIndex
CREATE INDEX "Exercise_gymId_idx" ON "Exercise"("gymId");

-- CreateIndex
CREATE INDEX "RoutineTemplate_gymId_idx" ON "RoutineTemplate"("gymId");

-- CreateIndex
CREATE INDEX "RoutineTemplate_profesorId_idx" ON "RoutineTemplate"("profesorId");

-- CreateIndex
CREATE INDEX "RoutineTemplateExercise_exerciseId_idx" ON "RoutineTemplateExercise"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineTemplateExercise_templateId_orden_key" ON "RoutineTemplateExercise"("templateId", "orden");

-- CreateIndex
CREATE INDEX "RoutineInstance_gymId_idx" ON "RoutineInstance"("gymId");

-- CreateIndex
CREATE INDEX "RoutineInstance_alumnoId_idx" ON "RoutineInstance"("alumnoId");

-- CreateIndex
CREATE INDEX "RoutineInstance_profesorId_idx" ON "RoutineInstance"("profesorId");

-- CreateIndex
CREATE INDEX "RoutineInstanceExercise_exerciseId_idx" ON "RoutineInstanceExercise"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineInstanceExercise_instanceId_orden_key" ON "RoutineInstanceExercise"("instanceId", "orden");

-- AddForeignKey
ALTER TABLE "RoutineTemplate" ADD CONSTRAINT "RoutineTemplate_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineTemplateExercise" ADD CONSTRAINT "RoutineTemplateExercise_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RoutineTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineTemplateExercise" ADD CONSTRAINT "RoutineTemplateExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineInstance" ADD CONSTRAINT "RoutineInstance_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineInstance" ADD CONSTRAINT "RoutineInstance_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineInstance" ADD CONSTRAINT "RoutineInstance_origenTemplateId_fkey" FOREIGN KEY ("origenTemplateId") REFERENCES "RoutineTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineInstanceExercise" ADD CONSTRAINT "RoutineInstanceExercise_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "RoutineInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineInstanceExercise" ADD CONSTRAINT "RoutineInstanceExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
