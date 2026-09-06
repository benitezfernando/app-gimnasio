-- CreateTable
CREATE TABLE "ProfesorAlumno" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "profesorId" TEXT NOT NULL,
    "alumnoId" TEXT NOT NULL,
    "asignadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfesorAlumno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfesorAlumno_gymId_idx" ON "ProfesorAlumno"("gymId");

-- CreateIndex
CREATE INDEX "ProfesorAlumno_alumnoId_idx" ON "ProfesorAlumno"("alumnoId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfesorAlumno_profesorId_alumnoId_key" ON "ProfesorAlumno"("profesorId", "alumnoId");

-- AddForeignKey
ALTER TABLE "ProfesorAlumno" ADD CONSTRAINT "ProfesorAlumno_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfesorAlumno" ADD CONSTRAINT "ProfesorAlumno_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
