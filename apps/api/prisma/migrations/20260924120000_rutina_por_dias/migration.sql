-- Rutina dividida en días (spec 2026-09-24-rutina-por-dias-design.md).
-- Escrita a mano: incluye migración de datos. Cada plantilla/instancia
-- con ejercicios recibe un "Día 1" con todos ellos; las instancias
-- vinculadas quedan vinculadas al Día 1 de su plantilla de origen.

-- CreateTable
CREATE TABLE "RoutineTemplateDay" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,

    CONSTRAINT "RoutineTemplateDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineInstanceDay" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "vinculadoADiaId" TEXT,

    CONSTRAINT "RoutineInstanceDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoutineTemplateDay_templateId_numero_key" ON "RoutineTemplateDay"("templateId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineInstanceDay_instanceId_numero_key" ON "RoutineInstanceDay"("instanceId", "numero");

-- CreateIndex
CREATE INDEX "RoutineInstanceDay_vinculadoADiaId_idx" ON "RoutineInstanceDay"("vinculadoADiaId");

-- AddForeignKey
ALTER TABLE "RoutineTemplateDay" ADD CONSTRAINT "RoutineTemplateDay_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RoutineTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineInstanceDay" ADD CONSTRAINT "RoutineInstanceDay_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "RoutineInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineInstanceDay" ADD CONSTRAINT "RoutineInstanceDay_vinculadoADiaId_fkey" FOREIGN KEY ("vinculadoADiaId") REFERENCES "RoutineTemplateDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS deny-all, mismo criterio que 20260907210000_enable_rls_deny_all
ALTER TABLE "public"."RoutineTemplateDay" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."RoutineInstanceDay" ENABLE ROW LEVEL SECURITY;

-- Datos: Día 1 para toda plantilla con ejercicios
INSERT INTO "RoutineTemplateDay" ("id", "templateId", "numero")
SELECT gen_random_uuid()::text, t."id", 1
FROM "RoutineTemplate" t
WHERE EXISTS (SELECT 1 FROM "RoutineTemplateExercise" e WHERE e."templateId" = t."id");

-- Datos: Día 1 para toda instancia con ejercicios; vinculada => apunta al Día 1 de su plantilla (si sigue existiendo)
INSERT INTO "RoutineInstanceDay" ("id", "instanceId", "numero", "vinculadoADiaId")
SELECT
    gen_random_uuid()::text,
    i."id",
    1,
    CASE
        WHEN i."vinculada" THEN (
            SELECT d."id" FROM "RoutineTemplateDay" d
            WHERE d."templateId" = i."origenTemplateId" AND d."numero" = 1
        )
        ELSE NULL
    END
FROM "RoutineInstance" i
WHERE EXISTS (SELECT 1 FROM "RoutineInstanceExercise" e WHERE e."instanceId" = i."id");

-- Ejercicios de plantilla -> día
ALTER TABLE "RoutineTemplateExercise" ADD COLUMN "dayId" TEXT;
UPDATE "RoutineTemplateExercise" e
SET "dayId" = d."id"
FROM "RoutineTemplateDay" d
WHERE d."templateId" = e."templateId";
ALTER TABLE "RoutineTemplateExercise" ALTER COLUMN "dayId" SET NOT NULL;

-- Ejercicios de instancia -> día
ALTER TABLE "RoutineInstanceExercise" ADD COLUMN "dayId" TEXT;
UPDATE "RoutineInstanceExercise" e
SET "dayId" = d."id"
FROM "RoutineInstanceDay" d
WHERE d."instanceId" = e."instanceId";
ALTER TABLE "RoutineInstanceExercise" ALTER COLUMN "dayId" SET NOT NULL;

-- Quitar columnas viejas
DROP INDEX "RoutineTemplateExercise_templateId_orden_key";
ALTER TABLE "RoutineTemplateExercise" DROP CONSTRAINT "RoutineTemplateExercise_templateId_fkey";
ALTER TABLE "RoutineTemplateExercise" DROP COLUMN "templateId";

DROP INDEX "RoutineInstanceExercise_instanceId_orden_key";
ALTER TABLE "RoutineInstanceExercise" DROP CONSTRAINT "RoutineInstanceExercise_instanceId_fkey";
ALTER TABLE "RoutineInstanceExercise" DROP COLUMN "instanceId";

ALTER TABLE "RoutineInstance" DROP CONSTRAINT "RoutineInstance_origenTemplateId_fkey";
ALTER TABLE "RoutineInstance" DROP COLUMN "origenTemplateId",
DROP COLUMN "vinculada";

-- CreateIndex
CREATE UNIQUE INDEX "RoutineTemplateExercise_dayId_orden_key" ON "RoutineTemplateExercise"("dayId", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineInstanceExercise_dayId_orden_key" ON "RoutineInstanceExercise"("dayId", "orden");

-- AddForeignKey
ALTER TABLE "RoutineTemplateExercise" ADD CONSTRAINT "RoutineTemplateExercise_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "RoutineTemplateDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineInstanceExercise" ADD CONSTRAINT "RoutineInstanceExercise_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "RoutineInstanceDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
