# Plantillas Vinculadas + Eliminación de "descanso" + Búsqueda sin Acentos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a profesor opt into linking an alumno's routine instance to its source template (future template edits propagate, alumno-specific series/repeticiones/peso never overwritten), show that link on the profesor's alumno-detail screen, remove the unused `descanso` field everywhere, and make exercise search ignore accents.

**Architecture:** Three independent-but-adjacent changes in the existing NestJS hexagonal `routines` and `exercise-catalog` modules plus the Next.js App Router frontend. All three ship in one Prisma migration because they touch the same tables. Backend changes follow the existing domain/application/infrastructure layering exactly (ports define the contract, Prisma repositories implement it, use-cases orchestrate).

**Tech Stack:** NestJS + Prisma 5 + PostgreSQL (Supabase) on the backend; Next.js App Router (server components + `'use client'` forms) on the frontend; Jest for backend unit/e2e tests (no frontend test suite exists — frontend tasks are verified via `next build`, which type-checks).

**Design doc:** `docs/superpowers/specs/2026-09-18-plantillas-vinculadas-design.md` (sections A, B, C — read it if anything below is ambiguous).

## Global Constraints

- `descanso` is deleted, not replaced — no field takes its place anywhere (schema, DTOs, use-cases, repositories, frontend types/UI).
- Deleting `descanso` from the two `*Exercise` tables is a destructive migration (existing values are lost) — this was explicitly accepted by the user; do not soften it into a nullable/kept column.
- `peso`, `series`, `repeticiones` on a `RoutineInstanceExercise` are ALWAYS alumno-specific. Template-driven sync (propagation to a `vinculada` instance) must never overwrite these three fields on an exercise the alumno already had — only `orden`/`notas` follow the template for existing exercises, and only a brand-new exercise (one the alumno didn't have) seeds its values from the template.
- `vinculada` defaults to `false` everywhere it's created — copying (today's behavior) stays the default; linking is opt-in.
- `GetMiRutinaVigenteUseCase` (`apps/api/src/routines/application/get-mi-rutina-vigente.use-case.ts`) gets ZERO new fields and ZERO new dependencies — the alumno-facing view never learns about `vinculada`. (It DOES still lose the `descanso` field in Task 3, same as every other file that maps it — that's a different rule than "don't touch".)
- The `nombreNormalizado` column is never selected/returned by any API response — it exists purely for the `WHERE` clause of exercise search. Both `SELECT_SUMMARY` and `SELECT_DETAIL` in `prisma-exercise.repository.ts` must keep excluding it.
- Accent-insensitive search only applies to `Exercise.nombre` search matching — display of `nombre` is untouched everywhere, and `parteCuerpo`/`equipamiento`/`grupoMuscular` filters are untouched (they're fixed-value selects, not free text).
- `MAX_EJERCICIOS = 50` (existing constant in both `assign-routine-to-alumno.use-case.ts` and `replace-*-exercises.use-case.ts`) is unaffected by this plan — don't touch it.
- Never run `prisma migrate dev` or `prisma migrate deploy` against a real database from within a task — the migration files are written by hand (Task 1) and applying them to Supabase is a manual step the user runs themselves after the branch is reviewed (see Task 1's final note).
- Backend tests: `cd apps/api && npm test`. Frontend verification: `cd apps/web && npm run build` (there is no frontend test suite — `next build` type-checks the whole app, that's the bar).

---

### Task 1: Prisma schema + migration

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260918120000_plantillas_vinculadas_y_sin_descanso/migration.sql`

**Interfaces:**

- Produces: `Exercise.nombreNormalizado` (String, indexed) — consumed by Task 2. `RoutineInstance.vinculada` (Boolean, default false) — consumed by Tasks 5-8. Both `*Exercise.descanso` columns removed — consumed by Task 3 (every file mapping them must stop).

- [ ] **Step 1: Edit the schema**

In `apps/api/prisma/schema.prisma`, in the `Exercise` model, add the new field right after `nombre` and a matching index in the model's index block:

```prisma
model Exercise {
  id                          String         @id @default(uuid())
  externalId                  String?        @unique
  gymId                       String?
  nombre                      String
  nombreNormalizado           String         @default("")
  parteCuerpo                 String
  grupoMuscular               String
  gruposMuscularesSecundarios String[]       @default([])
  equipamiento                String?
  imageUrl                    String?
  gifUrl                      String?
  instrucciones               String?
  pasos                       String[]       @default([])
  fuente                      ExerciseSource @default(CATALOG)
  licenciaMedia               String?
  atribucionMedia             String?
  createdAt                   DateTime       @default(now())
  updatedAt                   DateTime       @updatedAt
  activo                      Boolean        @default(true)

  ejerciciosDeTemplate RoutineTemplateExercise[]
  ejerciciosDeInstance RoutineInstanceExercise[]

  @@index([gymId])
  @@index([parteCuerpo])
  @@index([equipamiento])
  @@index([activo])
  @@index([nombreNormalizado])
}
```

`@default("")` exists ONLY to satisfy the NOT NULL constraint for the migration on existing rows — every write path (the seed script, per Task 2) always supplies a real value. Never rely on the default in application code.

In `RoutineTemplateExercise`, remove the `descanso` line entirely:

```prisma
model RoutineTemplateExercise {
  id           String   @id @default(uuid())
  templateId   String
  exerciseId   String
  orden        Int
  series       Int
  repeticiones Int
  peso         Decimal? @db.Decimal(5, 2)
  notas        String?

  template RoutineTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  exercise Exercise        @relation(fields: [exerciseId], references: [id])

  @@unique([templateId, orden])
  @@index([exerciseId])
}
```

In `RoutineInstance`, add `vinculada` right after `origenTemplateId`:

```prisma
model RoutineInstance {
  id               String    @id @default(uuid())
  gymId            String
  profesorId       String?
  alumnoId         String
  nombre           String
  origenTemplateId String?
  vinculada        Boolean   @default(false)
  vigenteDesde     DateTime  @default(now())
  vigenteHasta     DateTime?
  activa           Boolean   @default(true)
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  profesor       User?                     @relation("ProfesorInstances", fields: [profesorId], references: [id], onDelete: SetNull)
  alumno         User                      @relation("AlumnoInstances", fields: [alumnoId], references: [id])
  origenTemplate RoutineTemplate?          @relation("OrigenTemplate", fields: [origenTemplateId], references: [id], onDelete: SetNull)
  ejercicios     RoutineInstanceExercise[]

  @@index([gymId])
  @@index([alumnoId])
  @@index([profesorId])
}
```

In `RoutineInstanceExercise`, remove the `descanso` line entirely:

```prisma
model RoutineInstanceExercise {
  id           String   @id @default(uuid())
  instanceId   String
  exerciseId   String
  orden        Int
  series       Int
  repeticiones Int
  peso         Decimal? @db.Decimal(5, 2)
  notas        String?

  instance RoutineInstance @relation(fields: [instanceId], references: [id], onDelete: Cascade)
  exercise Exercise        @relation(fields: [exerciseId], references: [id])

  @@unique([instanceId, orden])
  @@index([exerciseId])
}
```

- [ ] **Step 2: Write the migration by hand**

Create the directory `apps/api/prisma/migrations/20260918120000_plantillas_vinculadas_y_sin_descanso/` with a `migration.sql` inside (follow the exact style of the existing migrations in that folder — plain `ALTER TABLE` statements, no down-migration):

```sql
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
```

Do NOT run `prisma migrate dev`. This project applies migrations against Supabase manually/out-of-band — writing the SQL by hand and letting `prisma generate` (next step) pick up the schema is the correct flow here, matching how the existing migration folders were produced.

- [ ] **Step 3: Regenerate the Prisma client types**

Run (no database connection needed, this only reads `schema.prisma`):

```bash
cd apps/api && npx prisma generate
```

Expected: succeeds, no errors. This updates `@prisma/client`'s TypeScript types so the rest of the plan's tasks compile against the new columns.

- [ ] **Step 4: Validate the schema**

```bash
cd apps/api && npx prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260918120000_plantillas_vinculadas_y_sin_descanso
git commit -m "feat(db): agrega nombreNormalizado y vinculada, elimina descanso"
```

**Note for later, not part of this task:** applying this migration to the real Supabase database (`prisma migrate deploy`) is destructive for `descanso` data and must be run manually by the user after reviewing the whole branch — do not run it as part of any task in this plan.

---

### Task 2: Accent-insensitive exercise search

**Files:**

- Create: `apps/api/src/exercise-catalog/normalizar-nombre.ts`
- Create: `apps/api/src/exercise-catalog/normalizar-nombre.spec.ts`
- Modify: `apps/api/src/exercise-catalog/infrastructure/seed/dataset-mapper.ts`
- Modify: `apps/api/src/exercise-catalog/infrastructure/seed/dataset-mapper.spec.ts`
- Modify: `apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise.repository.ts`
- Modify: `apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise.repository.spec.ts`

**Interfaces:**

- Consumes: `Exercise.nombreNormalizado` column (Task 1).
- Produces: `normalizarNombre(texto: string): string`, used by both the seed mapper and the repository — later tasks don't depend on this.

- [ ] **Step 1: Write the failing test for the normalizer**

Create `apps/api/src/exercise-catalog/normalizar-nombre.spec.ts`:

```typescript
import { normalizarNombre } from './normalizar-nombre';

describe('normalizarNombre', () => {
  it('pasa a minúsculas', () => {
    expect(normalizarNombre('Sentadilla')).toBe('sentadilla');
  });

  it('saca acentos agudos', () => {
    expect(normalizarNombre('Press Francés')).toBe('press frances');
  });

  it('saca acentos de todas las vocales', () => {
    expect(normalizarNombre('áéíóú')).toBe('aeiou');
  });

  it('no rompe con texto que ya no tiene acentos', () => {
    expect(normalizarNombre('bench press')).toBe('bench press');
  });

  it('no toca dígitos ni símbolos', () => {
    expect(normalizarNombre('3/4 Sit-Up')).toBe('3/4 sit-up');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest normalizar-nombre.spec.ts`
Expected: FAIL — `Cannot find module './normalizar-nombre'`

- [ ] **Step 3: Implement the normalizer**

Create `apps/api/src/exercise-catalog/normalizar-nombre.ts`:

```typescript
/**
 * Normaliza un nombre de ejercicio para matching de búsqueda
 * accent-insensitive: minúsculas + sin diacríticos (NFD + strip de la
 * franja de marcas combinantes). Nunca se expone en una respuesta de la
 * API — es solo para el WHERE del repositorio (ver
 * `PrismaExerciseRepository.findMany`) y para poblar
 * `Exercise.nombreNormalizado` en el seed.
 */
export function normalizarNombre(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/api && npx jest normalizar-nombre.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Wire it into the seed mapper — write the failing assertion first**

In `apps/api/src/exercise-catalog/infrastructure/seed/dataset-mapper.spec.ts`, update the first test's expected object (it currently does `expect(resultado).toEqual({...})` without `nombreNormalizado` — add the key):

```typescript
expect(resultado).toEqual({
  nombre: '3/4 sit-up',
  nombreNormalizado: '3/4 sit-up',
  parteCuerpo: 'waist',
  grupoMuscular: 'abs',
  gruposMuscularesSecundarios: ['hip flexors', 'lower back'],
  equipamiento: 'body weight',
  imageUrl: 'https://cdn.example.com/images/0001-2gPfomN.jpg',
  gifUrl: 'https://cdn.example.com/videos/0001-2gPfomN.gif',
  instrucciones: 'Instrucción en español.',
  pasos: ['Paso 1', 'Paso 2'],
  licenciaMedia: LICENCIA_MEDIA,
  atribucionMedia: '© Gym visual — https://gymvisual.com/',
});
```

Also add a new test right after it, asserting the accent-stripping actually happens for a Spanish name:

```typescript
it('nombreNormalizado saca acentos y pasa a minúsculas', () => {
  const itemConAcento: DatasetExercise = { ...itemCompleto, name: 'Press Francés' };
  const resultado = mapExerciseFields(itemConAcento, () => null);
  expect(resultado.nombreNormalizado).toBe('press frances');
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd apps/api && npx jest dataset-mapper.spec.ts`
Expected: FAIL — `resultado.nombreNormalizado` is `undefined`, mismatched `toEqual`.

- [ ] **Step 7: Implement the mapper change**

In `apps/api/src/exercise-catalog/infrastructure/seed/dataset-mapper.ts`, add the import and the field:

```typescript
import { normalizarNombre } from '../../normalizar-nombre';
```

Add `nombreNormalizado: string;` to the `ExerciseFields` interface (right after `nombre: string;`), and in `mapExerciseFields`'s return object add (right after `nombre: item.name,`):

```typescript
    nombreNormalizado: normalizarNombre(item.name),
```

- [ ] **Step 8: Run it to verify it passes**

Run: `cd apps/api && npx jest dataset-mapper.spec.ts`
Expected: PASS (all tests, including the two touched above)

- [ ] **Step 9: Wire it into the repository search — write the failing test first**

In `apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise.repository.spec.ts`, add a new test at the end of the `describe` block:

```typescript
it('findMany con search filtra por nombreNormalizado normalizado, no por nombre', async () => {
  await repo.findMany({ search: 'Frances', page: 1, limit: 24 });

  const args = prisma.exercise.findMany.mock.calls[0][0];
  expect(args.where).toEqual(
    expect.objectContaining({ nombreNormalizado: { contains: 'frances' } }),
  );
  expect(args.where).not.toHaveProperty('nombre');
});
```

- [ ] **Step 10: Run it to verify it fails**

Run: `cd apps/api && npx jest prisma-exercise.repository.spec.ts`
Expected: FAIL — current `where` has `nombre`, not `nombreNormalizado`.

- [ ] **Step 11: Implement the repository change**

In `apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise.repository.ts`, add the import:

```typescript
import { normalizarNombre } from '../../normalizar-nombre';
```

Replace the `search` line inside `findMany`'s `where` object:

```typescript
const where: Prisma.ExerciseWhereInput = {
  activo: true,
  ...(filter.search ? { nombreNormalizado: { contains: normalizarNombre(filter.search) } } : {}),
  ...(filter.parteCuerpo ? { parteCuerpo: filter.parteCuerpo } : {}),
  ...(filter.equipamiento ? { equipamiento: filter.equipamiento } : {}),
};
```

(Note `mode: 'insensitive'` is dropped — both sides of the `contains` are already lowercased by `normalizarNombre`, so it's redundant.)

- [ ] **Step 12: Run it to verify it passes**

Run: `cd apps/api && npx jest prisma-exercise.repository.spec.ts dataset-mapper.spec.ts normalizar-nombre.spec.ts`
Expected: PASS, all green.

- [ ] **Step 13: Backfill existing rows**

This is a note for the human running the plan, not an automated step inside this task: after Task 1's migration is applied to a real database, re-running `cd apps/api && npm run seed:exercises` will backfill `nombreNormalizado` for every existing row, because `buildUpsert` in `seed-exercises.ts` already spreads the full `ExerciseFields` object (now including `nombreNormalizado`) into both the `create` and `update` branches of the `upsert` — no separate backfill script is needed. Do not run this against production from within this task; it's called out here so it isn't forgotten later.

- [ ] **Step 14: Commit**

```bash
git add apps/api/src/exercise-catalog/normalizar-nombre.ts apps/api/src/exercise-catalog/normalizar-nombre.spec.ts apps/api/src/exercise-catalog/infrastructure/seed/dataset-mapper.ts apps/api/src/exercise-catalog/infrastructure/seed/dataset-mapper.spec.ts apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise.repository.ts apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise.repository.spec.ts
git commit -m "feat(exercise-catalog): busqueda de ejercicios ignora acentos"
```

---

### Task 3: Remove `descanso` from the backend

**Files:**

- Modify: `apps/api/src/routines/infrastructure/http/dto/ejercicio.dto.ts`
- Modify: `apps/api/src/routines/infrastructure/http/dto/ejercicio.mapper.ts`
- Modify: `apps/api/src/routines/application/ports/routine-template-repository.port.ts`
- Modify: `apps/api/src/routines/infrastructure/persistence/prisma-routine-template.repository.ts`
- Modify: `apps/api/src/routines/infrastructure/persistence/prisma-routine-instance.repository.ts`
- Modify: `apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.ts`
- Modify: `apps/api/src/routines/application/get-mi-rutina-vigente.use-case.ts`
- Modify (test fixtures only — remove `descanso` from every literal): `apps/api/src/routines/application/replace-instance-exercises.use-case.spec.ts`, `apps/api/src/routines/application/replace-template-exercises.use-case.spec.ts`, `apps/api/src/routines/application/assign-routine-to-alumno.use-case.spec.ts`, `apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.spec.ts`, `apps/api/src/routines/application/get-mi-rutina-vigente.use-case.spec.ts`, `apps/api/src/routines/infrastructure/http/routine-templates.controller.e2e.spec.ts`, `apps/api/src/routines/infrastructure/http/routine-instances.controller.e2e.spec.ts`

**Interfaces:**

- Consumes: Task 1's migration (columns already gone from the DB shape the Prisma client expects).
- Produces: `EjercicioItem` (port) and `EjercicioDto` (HTTP) without `descanso` — every later task in this plan uses the 5-field shape (`exerciseId`, `orden`, `series`, `repeticiones`, `peso`, `notas`).

- [ ] **Step 1: Remove `descanso` from the DTO**

In `apps/api/src/routines/infrastructure/http/dto/ejercicio.dto.ts`, delete the `descanso` property entirely:

```typescript
import { IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class EjercicioDto {
  @IsString()
  @MinLength(1)
  exerciseId!: string;

  @IsInt()
  @Min(1)
  orden!: number;

  @IsInt()
  @Min(1)
  series!: number;

  @IsInt()
  @Min(1)
  repeticiones!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999.99)
  peso?: number;

  @IsOptional()
  @IsString()
  notas?: string;
}
```

- [ ] **Step 2: Remove `descanso` from the mapper**

In `apps/api/src/routines/infrastructure/http/dto/ejercicio.mapper.ts`, delete the `descanso: dto.descanso,` line:

```typescript
export function toEjercicioItems(dtos: EjercicioDto[]): EjercicioItem[] {
  return dtos.map((dto) => ({
    exerciseId: dto.exerciseId,
    orden: dto.orden,
    series: dto.series,
    repeticiones: dto.repeticiones,
    peso: dto.peso ?? null,
    notas: dto.notas ?? null,
  }));
}
```

- [ ] **Step 3: Remove `descanso` from the shared port type**

In `apps/api/src/routines/application/ports/routine-template-repository.port.ts`, delete `descanso: number;` from `EjercicioItem`:

```typescript
export interface EjercicioItem {
  exerciseId: string;
  orden: number;
  series: number;
  repeticiones: number;
  peso: number | null;
  notas: string | null;
}
```

- [ ] **Step 4: Remove `descanso` from the template Prisma repository**

In `apps/api/src/routines/infrastructure/persistence/prisma-routine-template.repository.ts`, in `replaceExercises`, delete the `descanso: e.descanso,` line from the `createMany` data mapping; in `toEjercicioItem`, delete `descanso: number;` from the parameter type and `descanso: row.descanso,` from the return:

```typescript
  async replaceExercises(templateId: string, ejercicios: EjercicioItem[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.routineTemplateExercise.deleteMany({ where: { templateId } }),
      this.prisma.routineTemplateExercise.createMany({
        data: ejercicios.map((e) => ({
          templateId,
          exerciseId: e.exerciseId,
          orden: e.orden,
          series: e.series,
          repeticiones: e.repeticiones,
          peso: e.peso === null ? null : new Prisma.Decimal(e.peso),
          notas: e.notas,
        })),
      }),
    ]);
  }

  private toEjercicioItem(row: {
    exerciseId: string;
    orden: number;
    series: number;
    repeticiones: number;
    peso: Prisma.Decimal | null;
    notas: string | null;
  }): EjercicioItem {
    return {
      exerciseId: row.exerciseId,
      orden: row.orden,
      series: row.series,
      repeticiones: row.repeticiones,
      peso: row.peso === null ? null : row.peso.toNumber(),
      notas: row.notas,
    };
  }
```

- [ ] **Step 5: Remove `descanso` from the instance Prisma repository**

In `apps/api/src/routines/infrastructure/persistence/prisma-routine-instance.repository.ts`, delete every `descanso` reference: in `crear`'s `ejercicios.create` mapping, in `replaceExercises`'s `createMany` mapping, in `toDetail`'s parameter type, and in `toDetail`'s return mapping. The four spots (all in this one file):

```typescript
const instance = await tx.routineInstance.create({
  data: {
    gymId: data.gymId,
    profesorId: data.profesorId,
    alumnoId: data.alumnoId,
    nombre: data.nombre,
    origenTemplateId: data.origenTemplateId,
    ejercicios: {
      create: data.ejercicios.map((e) => ({
        exerciseId: e.exerciseId,
        orden: e.orden,
        series: e.series,
        repeticiones: e.repeticiones,
        peso: e.peso === null ? null : new Prisma.Decimal(e.peso),
        notas: e.notas,
      })),
    },
  },
  include: { ejercicios: { orderBy: { orden: 'asc' } } },
});
```

```typescript
  async replaceExercises(instanceId: string, ejercicios: EjercicioItem[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.routineInstanceExercise.deleteMany({ where: { instanceId } }),
      this.prisma.routineInstanceExercise.createMany({
        data: ejercicios.map((e) => ({
          instanceId,
          exerciseId: e.exerciseId,
          orden: e.orden,
          series: e.series,
          repeticiones: e.repeticiones,
          peso: e.peso === null ? null : new Prisma.Decimal(e.peso),
          notas: e.notas,
        })),
      }),
    ]);
  }

  private toDetail(instance: {
    id: string;
    gymId: string;
    profesorId: string | null;
    alumnoId: string;
    nombre: string;
    origenTemplateId: string | null;
    vigenteDesde: Date;
    vigenteHasta: Date | null;
    activa: boolean;
    ejercicios: Array<{
      exerciseId: string;
      orden: number;
      series: number;
      repeticiones: number;
      peso: Prisma.Decimal | null;
      notas: string | null;
    }>;
  }): RoutineInstanceDetail {
    return {
      id: instance.id,
      gymId: instance.gymId,
      profesorId: instance.profesorId,
      alumnoId: instance.alumnoId,
      nombre: instance.nombre,
      origenTemplateId: instance.origenTemplateId,
      vigenteDesde: instance.vigenteDesde,
      vigenteHasta: instance.vigenteHasta,
      activa: instance.activa,
      ejercicios: instance.ejercicios.map((e) => ({
        exerciseId: e.exerciseId,
        orden: e.orden,
        series: e.series,
        repeticiones: e.repeticiones,
        peso: e.peso === null ? null : e.peso.toNumber(),
        notas: e.notas,
      })),
    };
  }
```

(`vinculada` is NOT added here — that's Task 5. This step only removes `descanso`.)

- [ ] **Step 6: Remove `descanso` from both "rutina vigente" use-cases**

In `apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.ts`, delete `descanso: number;` from `RutinaVigenteEjercicioResuelto`, delete `descanso: number;` from the `ejercicios` parameter type of `resolverRutina`, and delete `descanso: e.descanso,` from the mapped return:

```typescript
export interface RutinaVigenteEjercicioResuelto {
  exerciseId: string;
  nombre: string;
  imageUrl: string | null;
  gifUrl: string | null;
  orden: number;
  series: number;
  repeticiones: number;
  peso: number | null;
  notas: string | null;
}
```

```typescript
  private async resolverRutina(
    id: string,
    nombre: string,
    ejercicios: Array<{
      exerciseId: string;
      orden: number;
      series: number;
      repeticiones: number;
      peso: number | null;
      notas: string | null;
    }>,
  ): Promise<RutinaVigenteOutput> {
    const catalogados = await this.exerciseRepository.findByIds(
      ejercicios.map((e) => e.exerciseId),
    );
    const porId = new Map(catalogados.map((e) => [e.id, e]));

    return {
      id,
      nombre,
      ejercicios: ejercicios.map((e) => {
        const catalogo = porId.get(e.exerciseId);
        return {
          exerciseId: e.exerciseId,
          nombre: catalogo?.nombre ?? '(ejercicio no encontrado)',
          imageUrl: catalogo?.imageUrl ?? null,
          gifUrl: catalogo?.gifUrl ?? null,
          orden: e.orden,
          series: e.series,
          repeticiones: e.repeticiones,
          peso: e.peso,
          notas: e.notas,
        };
      }),
    };
  }
```

In `apps/api/src/routines/application/get-mi-rutina-vigente.use-case.ts`, the same shape appears inline in `execute` — delete `descanso: e.descanso,`:

```typescript
return {
  id: instancia.id,
  nombre: instancia.nombre,
  ejercicios: instancia.ejercicios.map((e) => {
    const catalogo = porId.get(e.exerciseId);
    return {
      exerciseId: e.exerciseId,
      nombre: catalogo?.nombre ?? '(ejercicio no encontrado)',
      imageUrl: catalogo?.imageUrl ?? null,
      gifUrl: catalogo?.gifUrl ?? null,
      orden: e.orden,
      series: e.series,
      repeticiones: e.repeticiones,
      peso: e.peso,
      notas: e.notas,
    };
  }),
};
```

- [ ] **Step 7: Update every test fixture that has a literal `descanso: 60` (or similar)**

Every one of these 7 spec files has one or more object literals shaped like `{ exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, peso: ..., descanso: 60, notas: null }` (either named `unEjercicio`, inline in `RoutineInstanceDetail`/`RoutineTemplateDetail` fixtures, or in e2e request/response bodies). Open each file and delete the `descanso: <value>,` line from every such literal — do not change any other field, do not change the test's assertions beyond that. The 7 files:

- `apps/api/src/routines/application/replace-instance-exercises.use-case.spec.ts`
- `apps/api/src/routines/application/replace-template-exercises.use-case.spec.ts`
- `apps/api/src/routines/application/assign-routine-to-alumno.use-case.spec.ts`
- `apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.spec.ts`
- `apps/api/src/routines/application/get-mi-rutina-vigente.use-case.spec.ts`
- `apps/api/src/routines/infrastructure/http/routine-templates.controller.e2e.spec.ts`
- `apps/api/src/routines/infrastructure/http/routine-instances.controller.e2e.spec.ts`

If an e2e spec sends a raw HTTP request body (`.send({ ejercicios: [{ ..., descanso: 60, ... }] })`), remove `descanso` from the request body too — `EjercicioDto` no longer accepts it (extra properties are silently stripped by the global `ValidationPipe`'s whitelist if configured, but removing it from the test keeps the test's intent honest either way).

- [ ] **Step 8: Run the full backend test suite**

Run: `cd apps/api && npm test`
Expected: PASS, 0 failures. If anything fails with a TypeScript error mentioning `descanso`, you missed an occurrence — grep for it: `grep -rn "descanso" apps/api/src` should return nothing after this task.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/routines apps/api/src/routines/infrastructure/http/dto
git commit -m "feat(routines): elimina el campo descanso del backend"
```

---

### Task 4: Remove `descanso` from the frontend

**Files:**

- Modify: `apps/web/lib/routine-types.ts`
- Modify: `apps/web/components/routine-exercises-editor.tsx`
- Modify: `apps/web/app/(alumno)/alumno/page.tsx`
- Modify: `apps/web/app/(profesor)/profesor/plantillas/[id]/page.tsx`
- Modify: `apps/web/app/(profesor)/profesor/alumnos/[id]/page.tsx`

**Interfaces:**

- Consumes: Task 3's backend response shape (no `descanso` field anywhere in any API response body).

- [ ] **Step 1: Update the shared type + payload builder**

Replace the full contents of `apps/web/lib/routine-types.ts`:

```typescript
/**
 * Forma de un ejercicio mientras se edita una plantilla/instancia en el
 * cliente — combina los campos que manda el backend (`exerciseId`,
 * `orden`, `series`, `repeticiones`, `peso`, `notas`) con los de solo
 * display resueltos del catálogo (`nombre`, `imageUrl`) para no tener que
 * volver a pedirlos al guardar.
 */
export interface EjercicioEnEdicion {
  exerciseId: string;
  nombre: string;
  imageUrl: string | null;
  orden: number;
  series: number;
  repeticiones: number;
  peso: number | null;
  notas: string | null;
}

export function aPayloadDeEjercicios(ejercicios: EjercicioEnEdicion[]): Array<{
  exerciseId: string;
  orden: number;
  series: number;
  repeticiones: number;
  peso?: number;
  notas?: string;
}> {
  return ejercicios.map((e, indice) => ({
    exerciseId: e.exerciseId,
    orden: indice + 1,
    series: e.series,
    repeticiones: e.repeticiones,
    ...(e.peso !== null ? { peso: e.peso } : {}),
    ...(e.notas ? { notas: e.notas } : {}),
  }));
}
```

- [ ] **Step 2: Update the exercises editor**

In `apps/web/components/routine-exercises-editor.tsx`:

Remove `'descanso'` from the `campo` union type in `FilaEjercicio`'s props (`onCambiar`) and in `cambiarCampo`'s signature (two occurrences — same union type in two places).

Delete the whole "Descanso (s)" `<label>` block from `FilaEjercicio` (the 4th column), and change the grid from `grid-cols-4` to `grid-cols-3`:

```typescript
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col text-xs text-text-muted">
            Series
            <input
              type="number"
              min={1}
              value={ejercicio.series}
              onChange={(e) => onCambiar('series', e.target.value)}
              className="min-h-11 w-16 rounded-lg border border-border bg-surface px-2 text-text lg:min-h-9"
            />
          </label>
          <label className="flex flex-col text-xs text-text-muted">
            Reps
            <input
              type="number"
              min={1}
              value={ejercicio.repeticiones}
              onChange={(e) => onCambiar('repeticiones', e.target.value)}
              className="min-h-11 w-16 rounded-lg border border-border bg-surface px-2 text-text lg:min-h-9"
            />
          </label>
          <label className="flex flex-col text-xs text-text-muted">
            Peso (kg)
            <input
              type="number"
              min={0}
              step={0.5}
              value={ejercicio.peso ?? ''}
              placeholder="—"
              onChange={(e) => onCambiar('peso', e.target.value)}
              className="min-h-11 w-16 rounded-lg border border-border bg-surface px-2 text-text lg:min-h-9"
            />
          </label>
        </div>
```

Update `onCambiar`'s prop type on `FilaEjercicio`:

```typescript
  onCambiar: (campo: 'series' | 'repeticiones' | 'peso' | 'notas', valor: string) => void;
```

In `agregar()`, delete the `descanso: 60,` line from the pushed object:

```typescript
function agregar(ejercicio: ExerciseCardData) {
  if (ejercicios.some((e) => e.exerciseId === ejercicio.id)) return;
  setEjercicios((actuales) => [
    ...actuales,
    {
      exerciseId: ejercicio.id,
      nombre: ejercicio.nombre,
      imageUrl: ejercicio.imageUrl,
      orden: actuales.length + 1,
      series: 3,
      repeticiones: 10,
      peso: null,
      notas: null,
    },
  ]);
}
```

Update `cambiarCampo`'s signature:

```typescript
  function cambiarCampo(
    exerciseId: string,
    campo: 'series' | 'repeticiones' | 'peso' | 'notas',
    valor: string,
  ) {
```

(The function body doesn't need changes — it already handles the general case via `[campo]: Number(valor)` for anything that isn't `notas`/`peso`.)

- [ ] **Step 3: Update the alumno-facing rutina view**

In `apps/web/app/(alumno)/alumno/page.tsx`, delete `descanso: number;` from the `RutinaVigenteResponse` interface's `ejercicios` array item, and delete the `<Pill>{ejercicio.descanso}s descanso</Pill>` line from the JSX:

```typescript
interface RutinaVigenteResponse {
  id: string;
  nombre: string;
  ejercicios: Array<{
    exerciseId: string;
    nombre: string;
    imageUrl: string | null;
    orden: number;
    series: number;
    repeticiones: number;
    peso: number | null;
  }>;
}
```

```typescript
                    <div className="flex flex-wrap gap-1.5">
                      <Pill>{ejercicio.series} series</Pill>
                      <Pill>{ejercicio.repeticiones} reps</Pill>
                      {ejercicio.peso !== null && <Pill>{ejercicio.peso}kg</Pill>}
                    </div>
```

- [ ] **Step 4: Update the plantilla-detail page**

In `apps/web/app/(profesor)/profesor/plantillas/[id]/page.tsx`, delete `descanso: number;` from `TemplateDetailResponse`'s `ejercicios` item type, and delete `descanso: e.descanso,` from the `ejercicios` mapping:

```typescript
interface TemplateDetailResponse {
  id: string;
  gymId: string;
  profesorId: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  ejercicios: Array<{
    exerciseId: string;
    orden: number;
    series: number;
    repeticiones: number;
    peso: number | null;
    notas: string | null;
  }>;
}
```

```typescript
const ejercicios = plantilla.ejercicios.map((e) => {
  const detalle = detallePorId.get(e.exerciseId);
  return {
    exerciseId: e.exerciseId,
    nombre: detalle?.nombre ?? '(ejercicio no encontrado)',
    imageUrl: detalle?.imageUrl ?? null,
    orden: e.orden,
    series: e.series,
    repeticiones: e.repeticiones,
    peso: e.peso,
    notas: e.notas,
  };
});
```

- [ ] **Step 5: Update the alumno-detail page (profesor view)**

In `apps/web/app/(profesor)/profesor/alumnos/[id]/page.tsx`, delete `descanso: number;` from `RutinaVigenteResponse`'s `ejercicios` item type, and delete `descanso: e.descanso,` from the `ejercicios.map` inside the `InstanceEditor` prop:

```typescript
interface RutinaVigenteResponse {
  id: string;
  nombre: string;
  ejercicios: Array<{
    exerciseId: string;
    nombre: string;
    imageUrl: string | null;
    orden: number;
    series: number;
    repeticiones: number;
    peso: number | null;
    notas: string | null;
  }>;
}
```

```typescript
                  ejercicios: rutinaVigente.ejercicios.map((e) => ({
                    exerciseId: e.exerciseId,
                    nombre: e.nombre,
                    imageUrl: e.imageUrl,
                    orden: e.orden,
                    series: e.series,
                    repeticiones: e.repeticiones,
                    peso: e.peso,
                    notas: e.notas,
                  })),
```

(This file gets touched again in Task 10 for the "Vinculada a" pill — that's a separate, later change to the same file.)

- [ ] **Step 6: Verify with a full build**

Run: `cd apps/web && npm run build`
Expected: builds successfully with no TypeScript errors. If it fails mentioning `descanso`, grep for it: `grep -rn "descanso" apps/web` should return nothing after this task.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/routine-types.ts apps/web/components/routine-exercises-editor.tsx apps/web/app/\(alumno\)/alumno/page.tsx apps/web/app/\(profesor\)/profesor/plantillas/\[id\]/page.tsx apps/web/app/\(profesor\)/profesor/alumnos/\[id\]/page.tsx
git commit -m "feat(web): elimina el campo descanso del frontend"
```

---

### Task 5: `vinculada` end-to-end for assigning a routine

**Files:**

- Modify: `apps/api/src/routines/application/ports/routine-instance-repository.port.ts`
- Modify: `apps/api/src/routines/infrastructure/persistence/prisma-routine-instance.repository.ts`
- Modify: `apps/api/src/routines/application/assign-routine-to-alumno.use-case.ts`
- Modify: `apps/api/src/routines/application/assign-routine-to-alumno.use-case.spec.ts`
- Modify: `apps/api/src/routines/infrastructure/http/dto/create-routine-instance.dto.ts`
- Modify: `apps/api/src/routines/infrastructure/http/routine-instances.controller.ts`

**Interfaces:**

- Consumes: `RoutineInstance.vinculada` column (Task 1).
- Produces: `RoutineInstanceDetail.vinculada: boolean`, `RoutineInstanceRepositoryPort.crear()`'s `vinculada` input field — consumed by Tasks 6-8.

- [ ] **Step 1: Add `vinculada` to the port's detail type and `crear()` input**

In `apps/api/src/routines/application/ports/routine-instance-repository.port.ts`:

```typescript
export interface RoutineInstanceDetail {
  id: string;
  gymId: string;
  profesorId: string | null;
  alumnoId: string;
  nombre: string;
  origenTemplateId: string | null;
  vinculada: boolean;
  vigenteDesde: Date;
  vigenteHasta: Date | null;
  activa: boolean;
  ejercicios: EjercicioItem[];
}
```

```typescript
  crear(data: {
    gymId: string;
    profesorId: string;
    alumnoId: string;
    nombre: string;
    origenTemplateId: string | null;
    vinculada: boolean;
    ejercicios: EjercicioItem[];
  }): Promise<RoutineInstanceDetail>;
```

- [ ] **Step 2: Update the Prisma implementation**

In `apps/api/src/routines/infrastructure/persistence/prisma-routine-instance.repository.ts`, update `crear`'s signature and the `data` passed to `tx.routineInstance.create`:

```typescript
  async crear(data: {
    gymId: string;
    profesorId: string;
    alumnoId: string;
    nombre: string;
    origenTemplateId: string | null;
    vinculada: boolean;
    ejercicios: EjercicioItem[];
  }): Promise<RoutineInstanceDetail> {
    const creada = await this.prisma.$transaction(async (tx) => {
      await tx.routineInstance.updateMany({
        where: { alumnoId: data.alumnoId, activa: true },
        data: { activa: false, vigenteHasta: new Date() },
      });

      const instance = await tx.routineInstance.create({
        data: {
          gymId: data.gymId,
          profesorId: data.profesorId,
          alumnoId: data.alumnoId,
          nombre: data.nombre,
          origenTemplateId: data.origenTemplateId,
          vinculada: data.vinculada,
          ejercicios: {
            create: data.ejercicios.map((e) => ({
              exerciseId: e.exerciseId,
              orden: e.orden,
              series: e.series,
              repeticiones: e.repeticiones,
              peso: e.peso === null ? null : new Prisma.Decimal(e.peso),
              notas: e.notas,
            })),
          },
        },
        include: { ejercicios: { orderBy: { orden: 'asc' } } },
      });

      return instance;
    });

    return this.toDetail(creada);
  }
```

Update `toDetail`'s parameter type and return to carry `vinculada` through:

```typescript
  private toDetail(instance: {
    id: string;
    gymId: string;
    profesorId: string | null;
    alumnoId: string;
    nombre: string;
    origenTemplateId: string | null;
    vinculada: boolean;
    vigenteDesde: Date;
    vigenteHasta: Date | null;
    activa: boolean;
    ejercicios: Array<{
      exerciseId: string;
      orden: number;
      series: number;
      repeticiones: number;
      peso: Prisma.Decimal | null;
      notas: string | null;
    }>;
  }): RoutineInstanceDetail {
    return {
      id: instance.id,
      gymId: instance.gymId,
      profesorId: instance.profesorId,
      alumnoId: instance.alumnoId,
      nombre: instance.nombre,
      origenTemplateId: instance.origenTemplateId,
      vinculada: instance.vinculada,
      vigenteDesde: instance.vigenteDesde,
      vigenteHasta: instance.vigenteHasta,
      activa: instance.activa,
      ejercicios: instance.ejercicios.map((e) => ({
        exerciseId: e.exerciseId,
        orden: e.orden,
        series: e.series,
        repeticiones: e.repeticiones,
        peso: e.peso === null ? null : e.peso.toNumber(),
        notas: e.notas,
      })),
    };
  }
```

- [ ] **Step 3: Write the failing test for the use-case**

In `apps/api/src/routines/application/assign-routine-to-alumno.use-case.spec.ts`, update the `instanciaCreada` fixture to add `vinculada: false`, then add a new test after `'clona los ejercicios de la plantilla y crea la instancia'`:

```typescript
it('pasa vincular=true a crear() como vinculada cuando el profesor lo pide', async () => {
  userRepository.findById.mockResolvedValue(alumno);
  carteraRepository.existe.mockResolvedValue(true);
  templateRepository.findById.mockResolvedValue(template);
  instanceRepository.crear.mockResolvedValue({ ...instanciaCreada, vinculada: true });

  await useCase.execute({
    invocadoPor: profesor,
    alumnoId: 'alum-1',
    nombre: 'Full body',
    origenTemplateId: 'tpl-1',
    vincular: true,
  });

  expect(instanceRepository.crear).toHaveBeenCalledWith(
    expect.objectContaining({ vinculada: true }),
  );
});

it('vinculada es false por defecto si no se pide vincular', async () => {
  userRepository.findById.mockResolvedValue(alumno);
  carteraRepository.existe.mockResolvedValue(true);
  templateRepository.findById.mockResolvedValue(template);
  instanceRepository.crear.mockResolvedValue(instanciaCreada);

  await useCase.execute({
    invocadoPor: profesor,
    alumnoId: 'alum-1',
    nombre: 'Full body',
    origenTemplateId: 'tpl-1',
  });

  expect(instanceRepository.crear).toHaveBeenCalledWith(
    expect.objectContaining({ vinculada: false }),
  );
});
```

Also update the two existing `toHaveBeenCalledWith` assertions in `'clona los ejercicios...'` and `'arma desde cero...'` to add `vinculada: false` to the expected object (they'll fail otherwise once Step 4 adds the field unconditionally):

```typescript
expect(instanceRepository.crear).toHaveBeenCalledWith({
  gymId: 'gym-1',
  profesorId: 'prof-1',
  alumnoId: 'alum-1',
  nombre: 'Full body',
  origenTemplateId: 'tpl-1',
  vinculada: false,
  ejercicios: [unEjercicio],
});
```

```typescript
expect(instanceRepository.crear).toHaveBeenCalledWith({
  gymId: 'gym-1',
  profesorId: 'prof-1',
  alumnoId: 'alum-1',
  nombre: 'Custom',
  origenTemplateId: null,
  vinculada: false,
  ejercicios: [unEjercicio],
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd apps/api && npx jest assign-routine-to-alumno.use-case.spec.ts`
Expected: FAIL — `crear` isn't called with `vinculada` yet.

- [ ] **Step 5: Implement the use-case change**

In `apps/api/src/routines/application/assign-routine-to-alumno.use-case.ts`, add `vincular?: boolean;` to `AssignRoutineToAlumnoInput`:

```typescript
export interface AssignRoutineToAlumnoInput {
  invocadoPor: AuthenticatedUser;
  alumnoId: string;
  nombre: string;
  origenTemplateId?: string;
  ejercicios?: EjercicioItem[];
  vincular?: boolean;
}
```

Pass it through in the `crear(...)` call at the end of `execute`:

```typescript
return this.instanceRepository.crear({
  gymId: input.invocadoPor.gymId,
  profesorId: input.invocadoPor.id,
  alumnoId: input.alumnoId,
  nombre: input.nombre,
  origenTemplateId: input.origenTemplateId ?? null,
  vinculada: input.vincular ?? false,
  ejercicios,
});
```

- [ ] **Step 6: Run it to verify it passes**

Run: `cd apps/api && npx jest assign-routine-to-alumno.use-case.spec.ts`
Expected: PASS

- [ ] **Step 7: Wire the HTTP layer**

In `apps/api/src/routines/infrastructure/http/dto/create-routine-instance.dto.ts`, add:

```typescript
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EjercicioDto } from './ejercicio.dto';

export class CreateRoutineInstanceDto {
  @IsString()
  @MinLength(1)
  alumnoId!: string;

  @IsString()
  @MinLength(2)
  nombre!: string;

  @IsOptional()
  @IsString()
  origenTemplateId?: string;

  @IsOptional()
  @IsBoolean()
  vincular?: boolean;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => EjercicioDto)
  @ArrayMaxSize(50)
  ejercicios?: EjercicioDto[];
}
```

In `apps/api/src/routines/infrastructure/http/routine-instances.controller.ts`, pass it through in `create`:

```typescript
  @Post()
  async create(@Body() dto: CreateRoutineInstanceDto, @Req() req: RequestWithUser) {
    return this.assignUseCase.execute({
      invocadoPor: req.user,
      alumnoId: dto.alumnoId,
      nombre: dto.nombre,
      origenTemplateId: dto.origenTemplateId,
      vincular: dto.vincular,
      ejercicios: dto.ejercicios ? toEjercicioItems(dto.ejercicios) : undefined,
    });
  }
```

- [ ] **Step 8: Fix every other `RoutineInstanceDetail` fixture so the suite still compiles**

`vinculada` is now a required field on `RoutineInstanceDetail`. Three other spec files build object literals typed as (or containing) `RoutineInstanceDetail` and will fail to compile until they add it. In each, insert `vinculada: false,` right after the existing `origenTemplateId: null,` line:

`apps/api/src/routines/application/update-routine-instance.use-case.spec.ts` — the `instancia` fixture:

```typescript
const instancia: RoutineInstanceDetail = {
  id: 'inst-1',
  gymId: 'gym-1',
  profesorId: 'prof-1',
  alumnoId: 'alum-1',
  nombre: 'Full body',
  origenTemplateId: null,
  vinculada: false,
  vigenteDesde: new Date(),
  vigenteHasta: null,
  activa: true,
  ejercicios: [],
};
```

`apps/api/src/routines/application/get-mi-rutina-vigente.use-case.spec.ts` — the `instancia` fixture (same `origenTemplateId: null,` line, keep the rest of that object — its `ejercicios` array — unchanged):

```typescript
  const instancia: RoutineInstanceDetail = {
    id: 'inst-1',
    gymId: 'gym-1',
    profesorId: 'prof-1',
    alumnoId: 'alum-1',
    nombre: 'Full body',
    origenTemplateId: null,
    vinculada: false,
```

`apps/api/src/routines/infrastructure/http/routine-instances.controller.e2e.spec.ts` — the `instanciaBase` fixture:

```typescript
const instanciaBase: RoutineInstanceDetail = {
  id: 'inst-1',
  gymId: 'gym-A',
  profesorId: 'prof-1',
  alumnoId: 'alum-1',
  nombre: 'Full body',
  origenTemplateId: null,
  vinculada: false,
  vigenteDesde: new Date(),
  vigenteHasta: null,
  activa: true,
  ejercicios: [],
};
```

- [ ] **Step 9: Run the full backend test suite**

Run: `cd apps/api && npm test`
Expected: PASS, 0 failures.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/routines/application/ports/routine-instance-repository.port.ts apps/api/src/routines/infrastructure/persistence/prisma-routine-instance.repository.ts apps/api/src/routines/application/assign-routine-to-alumno.use-case.ts apps/api/src/routines/application/assign-routine-to-alumno.use-case.spec.ts apps/api/src/routines/infrastructure/http/dto/create-routine-instance.dto.ts apps/api/src/routines/infrastructure/http/routine-instances.controller.ts apps/api/src/routines/application/update-routine-instance.use-case.spec.ts apps/api/src/routines/application/get-mi-rutina-vigente.use-case.spec.ts apps/api/src/routines/infrastructure/http/routine-instances.controller.e2e.spec.ts
git commit -m "feat(routines): agrega vinculada de punta a punta al asignar una rutina"
```

---

### Task 6: Propagate template edits to linked instances

**Files:**

- Create: `apps/api/src/routines/application/merge-ejercicios-vinculados.ts`
- Create: `apps/api/src/routines/application/merge-ejercicios-vinculados.spec.ts`
- Modify: `apps/api/src/routines/application/ports/routine-instance-repository.port.ts`
- Modify: `apps/api/src/routines/infrastructure/persistence/prisma-routine-instance.repository.ts`
- Modify: `apps/api/src/routines/application/replace-template-exercises.use-case.ts`
- Modify: `apps/api/src/routines/application/replace-template-exercises.use-case.spec.ts`

**Interfaces:**

- Consumes: `RoutineInstanceDetail.vinculada` (Task 5), `EjercicioItem` (Task 3's 5-field shape).
- Produces: `mergeEjerciciosVinculados(ejerciciosPlantilla, ejerciciosInstanciaActual): EjercicioItem[]` (pure function), `RoutineInstanceRepositoryPort.findVinculadasActivasPorTemplate(templateId): Promise<RoutineInstanceDetail[]>`.

- [ ] **Step 1: Write the failing tests for the merge function**

Create `apps/api/src/routines/application/merge-ejercicios-vinculados.spec.ts`:

```typescript
import { mergeEjerciciosVinculados } from './merge-ejercicios-vinculados';
import { EjercicioItem } from './ports/routine-template-repository.port';

describe('mergeEjerciciosVinculados', () => {
  it('un ejercicio que el alumno ya tenía conserva series/repeticiones/peso propios', () => {
    const deTemplate: EjercicioItem[] = [
      {
        exerciseId: 'ex-1',
        orden: 1,
        series: 4,
        repeticiones: 12,
        peso: 50,
        notas: 'de la plantilla',
      },
    ];
    const delAlumno: EjercicioItem[] = [
      { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, peso: 20, notas: null },
    ];

    const resultado = mergeEjerciciosVinculados(deTemplate, delAlumno);

    expect(resultado).toEqual([
      {
        exerciseId: 'ex-1',
        orden: 1,
        series: 3,
        repeticiones: 10,
        peso: 20,
        notas: 'de la plantilla',
      },
    ]);
  });

  it('un ejercicio nuevo que la plantilla agregó arranca con los valores de la plantilla', () => {
    const deTemplate: EjercicioItem[] = [
      { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, peso: 20, notas: null },
      { exerciseId: 'ex-2', orden: 2, series: 4, repeticiones: 8, peso: 30, notas: 'nuevo' },
    ];
    const delAlumno: EjercicioItem[] = [
      { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, peso: 20, notas: null },
    ];

    const resultado = mergeEjerciciosVinculados(deTemplate, delAlumno);

    expect(resultado[1]).toEqual({
      exerciseId: 'ex-2',
      orden: 2,
      series: 4,
      repeticiones: 8,
      peso: 30,
      notas: 'nuevo',
    });
  });

  it('un ejercicio que la plantilla sacó desaparece del resultado', () => {
    const deTemplate: EjercicioItem[] = [
      { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, peso: 20, notas: null },
    ];
    const delAlumno: EjercicioItem[] = [
      { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, peso: 20, notas: null },
      { exerciseId: 'ex-viejo', orden: 2, series: 3, repeticiones: 10, peso: null, notas: null },
    ];

    const resultado = mergeEjerciciosVinculados(deTemplate, delAlumno);

    expect(resultado.map((e) => e.exerciseId)).toEqual(['ex-1']);
  });

  it('el orden final sigue el orden de la plantilla', () => {
    const deTemplate: EjercicioItem[] = [
      { exerciseId: 'ex-2', orden: 1, series: 4, repeticiones: 8, peso: null, notas: null },
      { exerciseId: 'ex-1', orden: 2, series: 4, repeticiones: 8, peso: null, notas: null },
    ];
    const delAlumno: EjercicioItem[] = [
      { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, peso: 20, notas: null },
      { exerciseId: 'ex-2', orden: 2, series: 3, repeticiones: 10, peso: 20, notas: null },
    ];

    const resultado = mergeEjerciciosVinculados(deTemplate, delAlumno);

    expect(resultado.map((e) => ({ exerciseId: e.exerciseId, orden: e.orden }))).toEqual([
      { exerciseId: 'ex-2', orden: 1 },
      { exerciseId: 'ex-1', orden: 2 },
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest merge-ejercicios-vinculados.spec.ts`
Expected: FAIL — `Cannot find module './merge-ejercicios-vinculados'`

- [ ] **Step 3: Implement the merge function**

Create `apps/api/src/routines/application/merge-ejercicios-vinculados.ts`:

```typescript
import { EjercicioItem } from './ports/routine-template-repository.port';

/**
 * Fusiona una plantilla editada con la copia actual de una instancia
 * vinculada a ella (ver diseño §B). `series`/`repeticiones`/`peso` SIEMPRE
 * vienen de la instancia si el alumno ya tenía ese ejercicio — son
 * siempre específicos del alumno, la plantilla nunca los pisa. `orden` y
 * `notas` siguen a la plantilla. Un exerciseId nuevo en la plantilla
 * arranca con los valores de la plantilla (no hay "propios" que
 * preservar). Un exerciseId que la plantilla sacó no aparece en el
 * resultado — la membresía de ejercicios de una instancia vinculada
 * siempre sigue a la plantilla.
 */
export function mergeEjerciciosVinculados(
  ejerciciosPlantilla: EjercicioItem[],
  ejerciciosInstanciaActual: EjercicioItem[],
): EjercicioItem[] {
  const actualesPorExerciseId = new Map(ejerciciosInstanciaActual.map((e) => [e.exerciseId, e]));

  return ejerciciosPlantilla.map((deTemplate) => {
    const actual = actualesPorExerciseId.get(deTemplate.exerciseId);
    if (!actual) {
      return { ...deTemplate };
    }
    return {
      exerciseId: deTemplate.exerciseId,
      orden: deTemplate.orden,
      notas: deTemplate.notas,
      series: actual.series,
      repeticiones: actual.repeticiones,
      peso: actual.peso,
    };
  });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/api && npx jest merge-ejercicios-vinculados.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Add the repository method to the port**

In `apps/api/src/routines/application/ports/routine-instance-repository.port.ts`, add the method (right after `findById`):

```typescript
  findById(id: string): Promise<RoutineInstanceDetail | null>;
  /**
   * Instancias vigentes vinculadas a esta plantilla — usado por
   * `ReplaceTemplateExercisesUseCase` para propagar una edición de
   * plantilla a cada alumno vinculado a ella. Solo trae `activa: true`:
   * no tiene sentido sincronizar instancias históricas que ya no se
   * muestran a nadie.
   */
  findVinculadasActivasPorTemplate(templateId: string): Promise<RoutineInstanceDetail[]>;
```

- [ ] **Step 6: Implement it in the Prisma repository**

In `apps/api/src/routines/infrastructure/persistence/prisma-routine-instance.repository.ts`, add the method (right after `findById`):

```typescript
  async findVinculadasActivasPorTemplate(templateId: string): Promise<RoutineInstanceDetail[]> {
    const instances = await this.prisma.routineInstance.findMany({
      where: { origenTemplateId: templateId, vinculada: true, activa: true },
      include: { ejercicios: { orderBy: { orden: 'asc' } } },
    });
    return instances.map((instance) => this.toDetail(instance));
  }
```

- [ ] **Step 7: Write the failing test for the propagation wiring**

In `apps/api/src/routines/application/replace-template-exercises.use-case.spec.ts`, add the `RoutineInstanceRepositoryPort` mock and inject it into `useCase` in `beforeEach`:

```typescript
import { Role } from '../../identity/domain/role';
import { ReplaceTemplateExercisesUseCase } from './replace-template-exercises.use-case';
import {
  RoutineTemplateRepositoryPort,
  RoutineTemplateDetail,
} from './ports/routine-template-repository.port';
import {
  RoutineInstanceRepositoryPort,
  RoutineInstanceDetail,
} from './ports/routine-instance-repository.port';
import { ExerciseRepositoryPort } from '../../exercise-catalog/application/ports/exercise-repository.port';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';
import { TooManyExercisesError } from './errors/too-many-exercises.error';
import { InvalidExerciseIdError } from './errors/invalid-exercise-id.error';

describe('ReplaceTemplateExercisesUseCase', () => {
  let templateRepository: jest.Mocked<RoutineTemplateRepositoryPort>;
  let instanceRepository: jest.Mocked<RoutineInstanceRepositoryPort>;
  let exerciseRepository: jest.Mocked<ExerciseRepositoryPort>;
  let useCase: ReplaceTemplateExercisesUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };

  const detalle: RoutineTemplateDetail = {
    id: 'tpl-1',
    gymId: 'gym-1',
    profesorId: 'prof-1',
    nombre: 'Full body',
    descripcion: null,
    activa: true,
    ejercicios: [],
  };

  const unEjercicio = {
    exerciseId: 'ex-1',
    orden: 1,
    series: 3,
    repeticiones: 10,
    peso: null,
    notas: null,
  };

  const instanciaVinculada: RoutineInstanceDetail = {
    id: 'inst-1',
    gymId: 'gym-1',
    profesorId: 'prof-1',
    alumnoId: 'alum-1',
    nombre: 'Full body de Juan',
    origenTemplateId: 'tpl-1',
    vinculada: true,
    vigenteDesde: new Date(),
    vigenteHasta: null,
    activa: true,
    ejercicios: [
      { exerciseId: 'ex-1', orden: 1, series: 5, repeticiones: 5, peso: 100, notas: null },
    ],
  };

  beforeEach(() => {
    templateRepository = {
      findByProfesor: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      replaceExercises: jest.fn(),
    };
    instanceRepository = {
      findVigentePorAlumno: jest.fn(),
      findById: jest.fn(),
      findVinculadasActivasPorTemplate: jest.fn().mockResolvedValue([]),
      crear: jest.fn(),
      update: jest.fn(),
      replaceExercises: jest.fn(),
    };
    exerciseRepository = {
      findMany: jest.fn(),
      findById: jest.fn(),
      findByIds: jest.fn().mockResolvedValue([{ id: 'ex-1' }]),
    } as unknown as jest.Mocked<ExerciseRepositoryPort>;
    useCase = new ReplaceTemplateExercisesUseCase(
      templateRepository,
      instanceRepository,
      exerciseRepository,
    );
  });

  it('lanza RoutineTemplateNotFoundError si no es del profesor invocador', async () => {
    templateRepository.findById.mockResolvedValue({ ...detalle, profesorId: 'prof-OTRO' });
    await expect(
      useCase.execute({ invocadoPor: profesor, templateId: 'tpl-1', ejercicios: [unEjercicio] }),
    ).rejects.toThrow(RoutineTemplateNotFoundError);
  });

  it('lanza TooManyExercisesError si vienen más de 50', async () => {
    templateRepository.findById.mockResolvedValue(detalle);
    const cincuentaYUno = Array.from({ length: 51 }, (_, i) => ({ ...unEjercicio, orden: i + 1 }));

    await expect(
      useCase.execute({ invocadoPor: profesor, templateId: 'tpl-1', ejercicios: cincuentaYUno }),
    ).rejects.toThrow(TooManyExercisesError);
    expect(templateRepository.replaceExercises).not.toHaveBeenCalled();
  });

  it('reemplaza los ejercicios si todo es válido', async () => {
    templateRepository.findById.mockResolvedValue(detalle);

    await useCase.execute({
      invocadoPor: profesor,
      templateId: 'tpl-1',
      ejercicios: [unEjercicio],
    });

    expect(templateRepository.replaceExercises).toHaveBeenCalledWith('tpl-1', [unEjercicio]);
  });

  it('lanza InvalidExerciseIdError si algún exerciseId no existe en el catálogo', async () => {
    templateRepository.findById.mockResolvedValue(detalle);
    exerciseRepository.findByIds.mockResolvedValue([]);

    await expect(
      useCase.execute({ invocadoPor: profesor, templateId: 'tpl-1', ejercicios: [unEjercicio] }),
    ).rejects.toThrow(InvalidExerciseIdError);
    expect(templateRepository.replaceExercises).not.toHaveBeenCalled();
  });

  it('no toca instancias si ninguna está vinculada a esta plantilla', async () => {
    templateRepository.findById.mockResolvedValue(detalle);
    instanceRepository.findVinculadasActivasPorTemplate.mockResolvedValue([]);

    await useCase.execute({
      invocadoPor: profesor,
      templateId: 'tpl-1',
      ejercicios: [unEjercicio],
    });

    expect(instanceRepository.replaceExercises).not.toHaveBeenCalled();
  });

  it('propaga la fusión a cada instancia vinculada y activa', async () => {
    templateRepository.findById.mockResolvedValue(detalle);
    instanceRepository.findVinculadasActivasPorTemplate.mockResolvedValue([instanciaVinculada]);

    await useCase.execute({
      invocadoPor: profesor,
      templateId: 'tpl-1',
      ejercicios: [unEjercicio],
    });

    expect(instanceRepository.findVinculadasActivasPorTemplate).toHaveBeenCalledWith('tpl-1');
    expect(instanceRepository.replaceExercises).toHaveBeenCalledWith('inst-1', [
      { exerciseId: 'ex-1', orden: 1, series: 5, repeticiones: 5, peso: 100, notas: null },
    ]);
  });
});
```

- [ ] **Step 8: Run it to verify it fails**

Run: `cd apps/api && npx jest replace-template-exercises.use-case.spec.ts`
Expected: FAIL — constructor now takes 3 args in the test but the class still takes 2; `findVinculadasActivasPorTemplate` never called.

- [ ] **Step 9: Implement the propagation wiring**

Replace the full contents of `apps/api/src/routines/application/replace-template-exercises.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../identity/domain/role';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepositoryPort,
} from '../../exercise-catalog/application/ports/exercise-repository.port';
import {
  EjercicioItem,
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateRepositoryPort,
} from './ports/routine-template-repository.port';
import {
  ROUTINE_INSTANCE_REPOSITORY,
  RoutineInstanceRepositoryPort,
} from './ports/routine-instance-repository.port';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';
import { TooManyExercisesError } from './errors/too-many-exercises.error';
import { InvalidExerciseIdError } from './errors/invalid-exercise-id.error';
import { mergeEjerciciosVinculados } from './merge-ejercicios-vinculados';

const MAX_EJERCICIOS = 50;

export interface ReplaceTemplateExercisesInput {
  invocadoPor: AuthenticatedUser;
  templateId: string;
  ejercicios: EjercicioItem[];
}

const ROLES_QUE_PUEDEN_EDITAR: Role[] = [Role.PROFESOR];

@Injectable()
export class ReplaceTemplateExercisesUseCase {
  constructor(
    @Inject(ROUTINE_TEMPLATE_REPOSITORY)
    private readonly templateRepository: RoutineTemplateRepositoryPort,
    @Inject(ROUTINE_INSTANCE_REPOSITORY)
    private readonly instanceRepository: RoutineInstanceRepositoryPort,
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
  ) {}

  async execute(input: ReplaceTemplateExercisesInput): Promise<void> {
    if (!ROLES_QUE_PUEDEN_EDITAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_EDITAR);
    }

    const template = await this.templateRepository.findById(input.templateId);
    if (!template || template.profesorId !== input.invocadoPor.id) {
      throw new RoutineTemplateNotFoundError(input.templateId);
    }

    if (input.ejercicios.length > MAX_EJERCICIOS) {
      throw new TooManyExercisesError(input.ejercicios.length);
    }

    await this.validarExerciseIdsEnCatalogo(input.ejercicios);

    await this.templateRepository.replaceExercises(input.templateId, input.ejercicios);

    await this.propagarAInstanciasVinculadas(input.templateId, input.ejercicios);
  }

  /**
   * HU nueva (ver diseño §B): una instancia `vinculada && activa` a esta
   * plantilla se resincroniza automáticamente. `mergeEjerciciosVinculados`
   * es quien decide qué se conserva del alumno y qué sigue a la
   * plantilla — este método solo orquesta el fetch + el replace por
   * instancia. NUNCA llama a `ReplaceInstanceExercisesUseCase` (ese es un
   * código-path distinto, con su propia lógica de desvincular que no debe
   * dispararse acá).
   */
  private async propagarAInstanciasVinculadas(
    templateId: string,
    ejerciciosPlantilla: EjercicioItem[],
  ): Promise<void> {
    const instanciasVinculadas =
      await this.instanceRepository.findVinculadasActivasPorTemplate(templateId);

    for (const instancia of instanciasVinculadas) {
      const ejerciciosFusionados = mergeEjerciciosVinculados(
        ejerciciosPlantilla,
        instancia.ejercicios,
      );
      await this.instanceRepository.replaceExercises(instancia.id, ejerciciosFusionados);
    }
  }

  private async validarExerciseIdsEnCatalogo(ejercicios: EjercicioItem[]): Promise<void> {
    const exerciseIds = new Set(ejercicios.map((e) => e.exerciseId));
    const catalogados = await this.exerciseRepository.findByIds([...exerciseIds]);
    if (catalogados.length !== exerciseIds.size) {
      const encontrados = new Set(catalogados.map((e) => e.id));
      const faltantes = [...exerciseIds].filter((id) => !encontrados.has(id));
      throw new InvalidExerciseIdError(faltantes);
    }
  }
}
```

- [ ] **Step 10: Run it to verify it passes**

Run: `cd apps/api && npx jest replace-template-exercises.use-case.spec.ts`
Expected: PASS (all 6 tests)

- [ ] **Step 11: Keep every other `RoutineInstanceRepositoryPort` mock compiling**

The port interface has a new required method, `findVinculadasActivasPorTemplate`. Every other file that builds a full mock/fake object typed as (or matching) `RoutineInstanceRepositoryPort` needs it added, or the suite won't compile. In each of these, insert `findVinculadasActivasPorTemplate: jest.fn(),` right after the `findById: jest.fn(),` line inside the `instanceRepository = { ... }` object:

- `apps/api/src/routines/application/assign-routine-to-alumno.use-case.spec.ts`
- `apps/api/src/routines/application/update-routine-instance.use-case.spec.ts`
- `apps/api/src/routines/application/get-mi-rutina-vigente.use-case.spec.ts`
- `apps/api/src/routines/application/replace-instance-exercises.use-case.spec.ts`
- `apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.spec.ts`

(Task 7 will later add `marcarDesvinculada` to some of these same objects, and Task 8 will fully rewrite `get-alumno-rutina-vigente-as-profesor.use-case.spec.ts` — this step's only job is making sure the suite compiles right now, after this task.)

In `apps/api/src/routines/infrastructure/http/routine-instances.controller.e2e.spec.ts`, the `fakeInstanceRepository` object uses async implementations instead of bare `jest.fn()` — insert this line right after its `findById: jest.fn(...)` line:

```typescript
    findVinculadasActivasPorTemplate: jest.fn(async () => []),
```

In `apps/api/src/routines/infrastructure/http/routine-templates.controller.e2e.spec.ts`, there is currently no fake instance repository at all — `ReplaceTemplateExercisesUseCase` now depends on `ROUTINE_INSTANCE_REPOSITORY`, so the testing module needs one. Add the import, the fake, and the provider entry:

```typescript
import {
  ROUTINE_INSTANCE_REPOSITORY,
  RoutineInstanceRepositoryPort,
} from '../../application/ports/routine-instance-repository.port';
```

Right after the `fakeTemplateRepository` object (around line 89):

```typescript
const fakeInstanceRepository: Pick<
  RoutineInstanceRepositoryPort,
  'findVinculadasActivasPorTemplate' | 'replaceExercises'
> = {
  findVinculadasActivasPorTemplate: jest.fn(async () => []),
  replaceExercises: jest.fn(async () => undefined),
};
```

And in the `providers` array, right after `{ provide: ROUTINE_TEMPLATE_REPOSITORY, useValue: fakeTemplateRepository },`:

```typescript
        { provide: ROUTINE_INSTANCE_REPOSITORY, useValue: fakeInstanceRepository },
```

- [ ] **Step 12: Run the full backend test suite**

Run: `cd apps/api && npm test`
Expected: PASS, 0 failures.

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/routines/application/merge-ejercicios-vinculados.ts apps/api/src/routines/application/merge-ejercicios-vinculados.spec.ts apps/api/src/routines/application/ports/routine-instance-repository.port.ts apps/api/src/routines/infrastructure/persistence/prisma-routine-instance.repository.ts apps/api/src/routines/application/replace-template-exercises.use-case.ts apps/api/src/routines/application/replace-template-exercises.use-case.spec.ts apps/api/src/routines/application/assign-routine-to-alumno.use-case.spec.ts apps/api/src/routines/application/update-routine-instance.use-case.spec.ts apps/api/src/routines/application/get-mi-rutina-vigente.use-case.spec.ts apps/api/src/routines/application/replace-instance-exercises.use-case.spec.ts apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.spec.ts apps/api/src/routines/infrastructure/http/routine-instances.controller.e2e.spec.ts apps/api/src/routines/infrastructure/http/routine-templates.controller.e2e.spec.ts
git commit -m "feat(routines): propaga ediciones de plantilla a instancias vinculadas"
```

---

### Task 7: Auto-desvincular when an alumno's exercises diverge

**Files:**

- Modify: `apps/api/src/routines/application/ports/routine-instance-repository.port.ts`
- Modify: `apps/api/src/routines/infrastructure/persistence/prisma-routine-instance.repository.ts`
- Modify: `apps/api/src/routines/application/replace-instance-exercises.use-case.ts`
- Modify: `apps/api/src/routines/application/replace-instance-exercises.use-case.spec.ts`

**Interfaces:**

- Consumes: `RoutineInstanceDetail.vinculada` (Task 5).
- Produces: `RoutineInstanceRepositoryPort.marcarDesvinculada(instanceId): Promise<void>`.

- [ ] **Step 1: Add the repository method to the port**

In `apps/api/src/routines/application/ports/routine-instance-repository.port.ts`, add (right after `replaceExercises`):

```typescript
  /** Replace-all transaccional — igual criterio que `RoutineTemplateRepositoryPort`. */
  replaceExercises(instanceId: string, ejercicios: EjercicioItem[]): Promise<void>;
  /**
   * Marca la instancia como no vinculada — se llama cuando el profesor
   * cambia el CONJUNTO de ejercicios de un alumno puntual (agregó/sacó
   * alguno), divergiendo de la plantilla de origen. Ver
   * `ReplaceInstanceExercisesUseCase`.
   */
  marcarDesvinculada(instanceId: string): Promise<void>;
```

- [ ] **Step 2: Implement it in the Prisma repository**

In `apps/api/src/routines/infrastructure/persistence/prisma-routine-instance.repository.ts`, add (right after `replaceExercises`):

```typescript
  async marcarDesvinculada(instanceId: string): Promise<void> {
    await this.prisma.routineInstance.update({
      where: { id: instanceId },
      data: { vinculada: false },
    });
  }
```

- [ ] **Step 3: Write the failing tests**

In `apps/api/src/routines/application/replace-instance-exercises.use-case.spec.ts`, add `marcarDesvinculada: jest.fn()` and `findVinculadasActivasPorTemplate: jest.fn()` to the `instanceRepository` mock in `beforeEach` (the port interface now requires both — `findVinculadasActivasPorTemplate` isn't used by this use-case but the mock object must satisfy the full port type):

```typescript
instanceRepository = {
  findVigentePorAlumno: jest.fn(),
  findById: jest.fn(),
  findVinculadasActivasPorTemplate: jest.fn(),
  crear: jest.fn(),
  update: jest.fn(),
  replaceExercises: jest.fn(),
  marcarDesvinculada: jest.fn(),
};
```

Then add these tests at the end of the `describe` block:

```typescript
it('desvincula si la instancia estaba vinculada y el set de exerciseId cambió', async () => {
  instanceRepository.findById.mockResolvedValue({
    ...instancia,
    vinculada: true,
    ejercicios: [unEjercicio],
  });
  carteraRepository.existe.mockResolvedValue(true);
  const ejercicioDistinto = { ...unEjercicio, exerciseId: 'ex-2' };

  await useCase.execute({
    invocadoPor: profesor,
    instanceId: 'inst-1',
    ejercicios: [ejercicioDistinto],
  });

  expect(instanceRepository.marcarDesvinculada).toHaveBeenCalledWith('inst-1');
});

it('NO desvincula si la instancia estaba vinculada pero el set de exerciseId es el mismo (solo cambiaron valores)', async () => {
  instanceRepository.findById.mockResolvedValue({
    ...instancia,
    vinculada: true,
    ejercicios: [unEjercicio],
  });
  carteraRepository.existe.mockResolvedValue(true);
  const mismoEjercicioOtrosValores = { ...unEjercicio, series: 5, peso: 999 };

  await useCase.execute({
    invocadoPor: profesor,
    instanceId: 'inst-1',
    ejercicios: [mismoEjercicioOtrosValores],
  });

  expect(instanceRepository.marcarDesvinculada).not.toHaveBeenCalled();
});

it('NO desvincula si la instancia no estaba vinculada, aunque el set cambie', async () => {
  instanceRepository.findById.mockResolvedValue({
    ...instancia,
    vinculada: false,
    ejercicios: [unEjercicio],
  });
  carteraRepository.existe.mockResolvedValue(true);
  const ejercicioDistinto = { ...unEjercicio, exerciseId: 'ex-2' };

  await useCase.execute({
    invocadoPor: profesor,
    instanceId: 'inst-1',
    ejercicios: [ejercicioDistinto],
  });

  expect(instanceRepository.marcarDesvinculada).not.toHaveBeenCalled();
});

it('desvincula si cambia SOLO la cantidad de ejercicios (mismo primer id, uno de más)', async () => {
  instanceRepository.findById.mockResolvedValue({
    ...instancia,
    vinculada: true,
    ejercicios: [unEjercicio],
  });
  carteraRepository.existe.mockResolvedValue(true);
  exerciseRepository.findByIds.mockResolvedValue([{ id: 'ex-1' }, { id: 'ex-2' }]);
  const dosEjercicios = [unEjercicio, { ...unEjercicio, exerciseId: 'ex-2', orden: 2 }];

  await useCase.execute({
    invocadoPor: profesor,
    instanceId: 'inst-1',
    ejercicios: dosEjercicios,
  });

  expect(instanceRepository.marcarDesvinculada).toHaveBeenCalledWith('inst-1');
});
```

(Note: `instancia`'s base fixture at the top of this file needs `vinculada: false` added — it currently doesn't compile against the updated `RoutineInstanceDetail` type otherwise. Add it: `vinculada: false,` right after `activa: true,` in the `instancia` object literal.)

- [ ] **Step 4: Run it to verify it fails**

Run: `cd apps/api && npx jest replace-instance-exercises.use-case.spec.ts`
Expected: FAIL — `marcarDesvinculada` is never called yet.

- [ ] **Step 5: Implement the desvincular logic**

Replace the full contents of `apps/api/src/routines/application/replace-instance-exercises.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import {
  CARTERA_REPOSITORY,
  CarteraRepositoryPort,
} from '../../identity/application/ports/cartera-repository.port';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepositoryPort,
} from '../../exercise-catalog/application/ports/exercise-repository.port';
import { EjercicioItem } from './ports/routine-template-repository.port';
import {
  ROUTINE_INSTANCE_REPOSITORY,
  RoutineInstanceRepositoryPort,
} from './ports/routine-instance-repository.port';
import { RoutineInstanceNotFoundError } from './errors/routine-instance-not-found.error';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';
import { TooManyExercisesError } from './errors/too-many-exercises.error';
import { InvalidExerciseIdError } from './errors/invalid-exercise-id.error';

const MAX_EJERCICIOS = 50;

export interface ReplaceInstanceExercisesInput {
  invocadoPor: AuthenticatedUser;
  instanceId: string;
  ejercicios: EjercicioItem[];
}

@Injectable()
export class ReplaceInstanceExercisesUseCase {
  constructor(
    @Inject(ROUTINE_INSTANCE_REPOSITORY)
    private readonly instanceRepository: RoutineInstanceRepositoryPort,
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
  ) {}

  async execute(input: ReplaceInstanceExercisesInput): Promise<void> {
    const instance = await this.instanceRepository.findById(input.instanceId);
    if (!instance || instance.gymId !== input.invocadoPor.gymId) {
      throw new RoutineInstanceNotFoundError(input.instanceId);
    }

    const enCartera = await this.carteraRepository.existe(input.invocadoPor.id, instance.alumnoId);
    if (!enCartera) {
      throw new AlumnoNotInCarteraError(instance.alumnoId);
    }

    if (input.ejercicios.length > MAX_EJERCICIOS) {
      throw new TooManyExercisesError(input.ejercicios.length);
    }

    await this.validarExerciseIdsEnCatalogo(input.ejercicios);

    const divergioDeLaPlantilla = !this.mismoConjuntoDeExerciseIds(
      instance.ejercicios.map((e) => e.exerciseId),
      input.ejercicios.map((e) => e.exerciseId),
    );

    await this.instanceRepository.replaceExercises(input.instanceId, input.ejercicios);

    if (instance.vinculada && divergioDeLaPlantilla) {
      await this.instanceRepository.marcarDesvinculada(input.instanceId);
    }
  }

  /**
   * Comparación de CONJUNTOS, no de arrays — dos instancias con la misma
   * cantidad de ejercicios pero uno distinto deben contar como
   * "divergió" (ver diseño §B, Riesgo/verificación). Solo mirar
   * `length` sería un bug: {ex-1, ex-2} y {ex-1, ex-3} tienen el mismo
   * largo pero son conjuntos distintos.
   */
  private mismoConjuntoDeExerciseIds(anteriores: string[], nuevos: string[]): boolean {
    if (anteriores.length !== nuevos.length) return false;
    const nuevosSet = new Set(nuevos);
    return anteriores.every((id) => nuevosSet.has(id));
  }

  private async validarExerciseIdsEnCatalogo(ejercicios: EjercicioItem[]): Promise<void> {
    const exerciseIds = new Set(ejercicios.map((e) => e.exerciseId));
    const catalogados = await this.exerciseRepository.findByIds([...exerciseIds]);
    if (catalogados.length !== exerciseIds.size) {
      const encontrados = new Set(catalogados.map((e) => e.id));
      const faltantes = [...exerciseIds].filter((id) => !encontrados.has(id));
      throw new InvalidExerciseIdError(faltantes);
    }
  }
}
```

- [ ] **Step 6: Run it to verify it passes**

Run: `cd apps/api && npx jest replace-instance-exercises.use-case.spec.ts`
Expected: PASS (all tests, old + new)

- [ ] **Step 7: Keep every other `RoutineInstanceRepositoryPort` mock compiling**

Same situation as Task 6's equivalent step, now for the new `marcarDesvinculada` method. In each of these files, insert `marcarDesvinculada: jest.fn(),` right after the `replaceExercises: jest.fn(),` line inside the `instanceRepository = { ... }` object (all five are `jest.Mocked<RoutineInstanceRepositoryPort>`, all already have `replaceExercises: jest.fn(),` from before this plan):

- `apps/api/src/routines/application/assign-routine-to-alumno.use-case.spec.ts`
- `apps/api/src/routines/application/update-routine-instance.use-case.spec.ts`
- `apps/api/src/routines/application/get-mi-rutina-vigente.use-case.spec.ts`
- `apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.spec.ts`
- `apps/api/src/routines/application/replace-template-exercises.use-case.spec.ts`

In `apps/api/src/routines/infrastructure/http/routine-instances.controller.e2e.spec.ts`, the `fakeInstanceRepository` object needs, right after its `replaceExercises: jest.fn(async () => undefined),` line:

```typescript
    marcarDesvinculada: jest.fn(async () => undefined),
```

(`routine-templates.controller.e2e.spec.ts`'s fake from Task 6 is a `Pick<..., 'findVinculadasActivasPorTemplate' | 'replaceExercises'>` — it doesn't implement the full port, so it does NOT need this method. `get-alumno-rutina-vigente-as-profesor.use-case.spec.ts` gets fully rewritten in Task 8 anyway — this step only keeps it compiling in the meantime.)

- [ ] **Step 8: Run the full backend test suite**

Run: `cd apps/api && npm test`
Expected: PASS, 0 failures.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/routines/application/ports/routine-instance-repository.port.ts apps/api/src/routines/infrastructure/persistence/prisma-routine-instance.repository.ts apps/api/src/routines/application/replace-instance-exercises.use-case.ts apps/api/src/routines/application/replace-instance-exercises.use-case.spec.ts apps/api/src/routines/application/assign-routine-to-alumno.use-case.spec.ts apps/api/src/routines/application/update-routine-instance.use-case.spec.ts apps/api/src/routines/application/get-mi-rutina-vigente.use-case.spec.ts apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.spec.ts apps/api/src/routines/application/replace-template-exercises.use-case.spec.ts apps/api/src/routines/infrastructure/http/routine-instances.controller.e2e.spec.ts
git commit -m "feat(routines): desvincula automaticamente si diverge el set de ejercicios"
```

---

### Task 8: Expose the link to the profesor

**Files:**

- Modify: `apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.ts`
- Modify: `apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.spec.ts`

**Interfaces:**

- Consumes: `RoutineInstanceDetail.vinculada`/`origenTemplateId` (Task 5), `RoutineTemplateRepositoryPort.findById` (existing).
- Produces: `RutinaVigenteConVinculacionOutput` — consumed by Task 10's frontend page.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.spec.ts`, add the `RoutineTemplateRepositoryPort` mock, inject it into `useCase`, and add `vinculada: false` to the `instancia` fixture:

```typescript
import { Role } from '../../identity/domain/role';
import { GetAlumnoRutinaVigenteAsProfesorUseCase } from './get-alumno-rutina-vigente-as-profesor.use-case';
import {
  RoutineInstanceRepositoryPort,
  RoutineInstanceDetail,
} from './ports/routine-instance-repository.port';
import {
  RoutineTemplateRepositoryPort,
  RoutineTemplateDetail,
} from './ports/routine-template-repository.port';
import { CarteraRepositoryPort } from '../../identity/application/ports/cartera-repository.port';
import {
  UserRepositoryPort,
  UserRecord,
} from '../../identity/application/ports/user-repository.port';
import {
  ExerciseRepositoryPort,
  ExerciseSummary,
} from '../../exercise-catalog/application/ports/exercise-repository.port';
import { UserNotFoundError } from '../../identity/application/errors/user-not-found.error';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';

describe('GetAlumnoRutinaVigenteAsProfesorUseCase', () => {
  let instanceRepository: jest.Mocked<RoutineInstanceRepositoryPort>;
  let templateRepository: jest.Mocked<RoutineTemplateRepositoryPort>;
  let carteraRepository: jest.Mocked<CarteraRepositoryPort>;
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let exerciseRepository: jest.Mocked<ExerciseRepositoryPort>;
  let useCase: GetAlumnoRutinaVigenteAsProfesorUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };

  const alumno: UserRecord = {
    id: 'alum-1',
    authUserId: 'auth-alum',
    gymId: 'gym-1',
    username: 'juan.perez',
    nombre: 'Juan Perez',
    role: Role.ALUMNO,
    activo: true,
  };

  const instancia: RoutineInstanceDetail = {
    id: 'inst-1',
    gymId: 'gym-1',
    profesorId: 'prof-1',
    alumnoId: 'alum-1',
    nombre: 'Full body',
    origenTemplateId: null,
    vinculada: false,
    vigenteDesde: new Date(),
    vigenteHasta: null,
    activa: true,
    ejercicios: [
      {
        exerciseId: 'ex-1',
        orden: 1,
        series: 3,
        repeticiones: 10,
        peso: 20,
        notas: null,
      },
    ],
  };

  const template: RoutineTemplateDetail = {
    id: 'tpl-1',
    gymId: 'gym-1',
    profesorId: 'prof-1',
    nombre: 'Full body plantilla',
    descripcion: null,
    activa: true,
    ejercicios: [],
  };

  const ejercicioResuelto: ExerciseSummary = {
    id: 'ex-1',
    nombre: 'Sentadilla',
    imageUrl: 'https://x/img.png',
    gifUrl: null,
    parteCuerpo: 'upper legs',
    grupoMuscular: 'quads',
    equipamiento: 'barbell',
  };

  beforeEach(() => {
    instanceRepository = {
      findVigentePorAlumno: jest.fn(),
      findById: jest.fn(),
      findVinculadasActivasPorTemplate: jest.fn(),
      crear: jest.fn(),
      update: jest.fn(),
      replaceExercises: jest.fn(),
      marcarDesvinculada: jest.fn(),
    };
    templateRepository = {
      findByProfesor: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      replaceExercises: jest.fn(),
    };
    carteraRepository = {
      existe: jest.fn(),
      crear: jest.fn(),
      eliminar: jest.fn(),
      findAlumnosDeProfesor: jest.fn(),
      findProfesoresDeAlumno: jest.fn(),
    };
    userRepository = {
      findByAuthUserId: jest.fn(),
      findByGymIdAndUsername: jest.fn(),
      findByGymId: jest.fn(),
      findById: jest.fn(),
      deactivate: jest.fn(),
      create: jest.fn(),
    };
    exerciseRepository = { findMany: jest.fn(), findById: jest.fn(), findByIds: jest.fn() };
    useCase = new GetAlumnoRutinaVigenteAsProfesorUseCase(
      instanceRepository,
      templateRepository,
      carteraRepository,
      userRepository,
      exerciseRepository,
    );
  });

  it('rechaza con UserNotFoundError si el alumno no existe o es de otro gym', async () => {
    userRepository.findById.mockResolvedValue(null);
    await expect(useCase.execute({ invocadoPor: profesor, alumnoId: 'no-existe' })).rejects.toThrow(
      UserNotFoundError,
    );
  });

  it('rechaza con AlumnoNotInCarteraError si no está en la cartera del invocador', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(false);
    await expect(useCase.execute({ invocadoPor: profesor, alumnoId: 'alum-1' })).rejects.toThrow(
      AlumnoNotInCarteraError,
    );
  });

  it('devuelve null si el alumno no tiene rutina vigente', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(true);
    instanceRepository.findVigentePorAlumno.mockResolvedValue(null);

    const resultado = await useCase.execute({ invocadoPor: profesor, alumnoId: 'alum-1' });

    expect(resultado).toBeNull();
  });

  it('resuelve los ejercicios contra el catálogo en un solo findByIds', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(true);
    instanceRepository.findVigentePorAlumno.mockResolvedValue(instancia);
    exerciseRepository.findByIds.mockResolvedValue([ejercicioResuelto]);

    const resultado = await useCase.execute({ invocadoPor: profesor, alumnoId: 'alum-1' });

    expect(exerciseRepository.findByIds).toHaveBeenCalledWith(['ex-1']);
    expect(resultado!.ejercicios[0]).toMatchObject({
      exerciseId: 'ex-1',
      nombre: 'Sentadilla',
      imageUrl: 'https://x/img.png',
      series: 3,
      peso: 20,
    });
  });

  it('vinculada=false y origenTemplateNombre=null cuando la instancia no está vinculada', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(true);
    instanceRepository.findVigentePorAlumno.mockResolvedValue(instancia);
    exerciseRepository.findByIds.mockResolvedValue([ejercicioResuelto]);

    const resultado = await useCase.execute({ invocadoPor: profesor, alumnoId: 'alum-1' });

    expect(resultado!.vinculada).toBe(false);
    expect(resultado!.origenTemplateNombre).toBeNull();
    expect(templateRepository.findById).not.toHaveBeenCalled();
  });

  it('resuelve origenTemplateNombre cuando la instancia está vinculada', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(true);
    instanceRepository.findVigentePorAlumno.mockResolvedValue({
      ...instancia,
      vinculada: true,
      origenTemplateId: 'tpl-1',
    });
    exerciseRepository.findByIds.mockResolvedValue([ejercicioResuelto]);
    templateRepository.findById.mockResolvedValue(template);

    const resultado = await useCase.execute({ invocadoPor: profesor, alumnoId: 'alum-1' });

    expect(templateRepository.findById).toHaveBeenCalledWith('tpl-1');
    expect(resultado!.vinculada).toBe(true);
    expect(resultado!.origenTemplateId).toBe('tpl-1');
    expect(resultado!.origenTemplateNombre).toBe('Full body plantilla');
  });

  it('origenTemplateNombre es null si la plantilla vinculada ya no existe (borrada)', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(true);
    instanceRepository.findVigentePorAlumno.mockResolvedValue({
      ...instancia,
      vinculada: true,
      origenTemplateId: 'tpl-borrada',
    });
    exerciseRepository.findByIds.mockResolvedValue([ejercicioResuelto]);
    templateRepository.findById.mockResolvedValue(null);

    const resultado = await useCase.execute({ invocadoPor: profesor, alumnoId: 'alum-1' });

    expect(resultado!.origenTemplateNombre).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest get-alumno-rutina-vigente-as-profesor.use-case.spec.ts`
Expected: FAIL — constructor arity mismatch, `resultado!.vinculada` undefined.

- [ ] **Step 3: Implement the use-case change**

Replace the full contents of `apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { Role } from '../../identity/domain/role';
import {
  CARTERA_REPOSITORY,
  CarteraRepositoryPort,
} from '../../identity/application/ports/cartera-repository.port';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
} from '../../identity/application/ports/user-repository.port';
import { resolveUserInGym } from '../../identity/application/resolve-user-in-gym';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepositoryPort,
} from '../../exercise-catalog/application/ports/exercise-repository.port';
import {
  ROUTINE_INSTANCE_REPOSITORY,
  RoutineInstanceRepositoryPort,
} from './ports/routine-instance-repository.port';
import {
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateRepositoryPort,
} from './ports/routine-template-repository.port';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';

export interface GetAlumnoRutinaVigenteAsProfesorInput {
  invocadoPor: AuthenticatedUser;
  alumnoId: string;
}

export interface RutinaVigenteEjercicioResuelto {
  exerciseId: string;
  nombre: string;
  imageUrl: string | null;
  gifUrl: string | null;
  orden: number;
  series: number;
  repeticiones: number;
  peso: number | null;
  notas: string | null;
}

export interface RutinaVigenteOutput {
  id: string;
  nombre: string;
  ejercicios: RutinaVigenteEjercicioResuelto[];
}

/**
 * Salida exclusiva de la vista PROFESOR — `GetMiRutinaVigenteUseCase`
 * (vista del ALUMNO) sigue devolviendo `RutinaVigenteOutput` sin estos
 * campos, a propósito (ver diseño §B: "esto es información solo para el
 * profesor").
 */
export interface RutinaVigenteConVinculacionOutput extends RutinaVigenteOutput {
  vinculada: boolean;
  origenTemplateId: string | null;
  origenTemplateNombre: string | null;
}

@Injectable()
export class GetAlumnoRutinaVigenteAsProfesorUseCase {
  constructor(
    @Inject(ROUTINE_INSTANCE_REPOSITORY)
    private readonly instanceRepository: RoutineInstanceRepositoryPort,
    @Inject(ROUTINE_TEMPLATE_REPOSITORY)
    private readonly templateRepository: RoutineTemplateRepositoryPort,
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
  ) {}

  async execute(
    input: GetAlumnoRutinaVigenteAsProfesorInput,
  ): Promise<RutinaVigenteConVinculacionOutput | null> {
    const alumno = await resolveUserInGym(
      this.userRepository,
      input.alumnoId,
      input.invocadoPor.gymId,
    );
    if (alumno.role !== Role.ALUMNO) {
      throw new AlumnoNotInCarteraError(input.alumnoId);
    }

    const enCartera = await this.carteraRepository.existe(input.invocadoPor.id, input.alumnoId);
    if (!enCartera) {
      throw new AlumnoNotInCarteraError(input.alumnoId);
    }

    const instancia = await this.instanceRepository.findVigentePorAlumno(input.alumnoId);
    if (!instancia) {
      return null;
    }

    const rutina = await this.resolverRutina(instancia.id, instancia.nombre, instancia.ejercicios);

    let origenTemplateNombre: string | null = null;
    if (instancia.vinculada && instancia.origenTemplateId) {
      const template = await this.templateRepository.findById(instancia.origenTemplateId);
      origenTemplateNombre = template?.nombre ?? null;
    }

    return {
      ...rutina,
      vinculada: instancia.vinculada,
      origenTemplateId: instancia.origenTemplateId,
      origenTemplateNombre,
    };
  }

  private async resolverRutina(
    id: string,
    nombre: string,
    ejercicios: Array<{
      exerciseId: string;
      orden: number;
      series: number;
      repeticiones: number;
      peso: number | null;
      notas: string | null;
    }>,
  ): Promise<RutinaVigenteOutput> {
    const catalogados = await this.exerciseRepository.findByIds(
      ejercicios.map((e) => e.exerciseId),
    );
    const porId = new Map(catalogados.map((e) => [e.id, e]));

    return {
      id,
      nombre,
      ejercicios: ejercicios.map((e) => {
        const catalogo = porId.get(e.exerciseId);
        return {
          exerciseId: e.exerciseId,
          nombre: catalogo?.nombre ?? '(ejercicio no encontrado)',
          imageUrl: catalogo?.imageUrl ?? null,
          gifUrl: catalogo?.gifUrl ?? null,
          orden: e.orden,
          series: e.series,
          repeticiones: e.repeticiones,
          peso: e.peso,
          notas: e.notas,
        };
      }),
    };
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/api && npx jest get-alumno-rutina-vigente-as-profesor.use-case.spec.ts`
Expected: PASS (all tests, old + new)

- [ ] **Step 5: Run the full backend test suite**

Run: `cd apps/api && npm test`
Expected: PASS, 0 failures. (`RoutinesController`'s DI picks up the new constructor param automatically.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.ts apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.spec.ts
git commit -m "feat(routines): informa al profesor si la rutina del alumno esta vinculada"
```

---

### Task 9: "Vincular a la plantilla" checkbox

**Files:**

- Modify: `apps/web/app/(profesor)/profesor/alumnos/[id]/assign-template-form.tsx`

**Interfaces:**

- Consumes: `CreateRoutineInstanceDto.vincular` (Task 5) — sent as `vincular: boolean` in the existing `POST routine-instances` call.

- [ ] **Step 1: Add the checkbox and wire it into the request**

Replace the full contents of `apps/web/app/(profesor)/profesor/alumnos/[id]/assign-template-form.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserApiFetch, BrowserApiError } from '../../../../../lib/browser-api-client';
import { PrimaryButton } from '../../../../../components/ui/primary-button';

interface TemplateOption {
  id: string;
  nombre: string;
  activa: boolean;
}

export function AssignTemplateForm({
  alumnoId,
  plantillas,
  reemplazaRutinaVigente = false,
}: {
  alumnoId: string;
  plantillas: TemplateOption[];
  reemplazaRutinaVigente?: boolean;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState('');
  const [nombre, setNombre] = useState('');
  const [vincular, setVincular] = useState(false);
  const [asignando, setAsignando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plantillasActivas = plantillas.filter((p) => p.activa);

  async function asignar() {
    if (!templateId || !nombre.trim()) return;
    if (
      reemplazaRutinaVigente &&
      !window.confirm(
        'Esto reemplaza la rutina actual del alumno por la plantilla elegida. ¿Continuar?',
      )
    ) {
      return;
    }
    setAsignando(true);
    setError(null);
    try {
      await browserApiFetch('routine-instances', {
        method: 'POST',
        body: JSON.stringify({ alumnoId, nombre, origenTemplateId: templateId, vincular }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof BrowserApiError ? err.message : 'No se pudo asignar.');
    } finally {
      setAsignando(false);
    }
  }

  if (plantillasActivas.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        No tenés plantillas activas — armá una en{' '}
        <a href="/profesor/plantillas" className="text-accent-text underline">
          Mis plantillas
        </a>{' '}
        primero, o armá la rutina desde cero más abajo.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <select
        value={templateId}
        onChange={(e) => setTemplateId(e.target.value)}
        className="min-h-11 rounded-lg border border-border bg-surface px-3 text-text lg:min-h-9"
      >
        <option value="">Elegir plantilla...</option>
        {plantillasActivas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre de esta rutina para el alumno"
        className="min-h-11 rounded-lg border border-border bg-surface px-3 text-text placeholder:text-text-muted lg:min-h-9"
      />
      <label className="flex items-center gap-2 text-sm text-text-muted">
        <input
          type="checkbox"
          checked={vincular}
          onChange={(e) => setVincular(e.target.checked)}
          className="h-4 w-4"
        />
        Vincular a la plantilla (se actualiza sola si edito la plantilla después)
      </label>
      <PrimaryButton
        type="button"
        onClick={asignar}
        disabled={asignando || !templateId || !nombre.trim()}
        size="sm"
      >
        {asignando
          ? 'Asignando...'
          : reemplazaRutinaVigente
            ? 'Reemplazar rutina'
            : 'Asignar plantilla'}
      </PrimaryButton>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify with a build**

Run: `cd apps/web && npm run build`
Expected: builds successfully with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(profesor)/profesor/alumnos/[id]/assign-template-form.tsx"
git commit -m "feat(web): checkbox para vincular una rutina asignada a su plantilla"
```

---

### Task 10: "Vinculada a «Plantilla»" badge on the alumno-detail page

**Files:**

- Modify: `apps/web/app/(profesor)/profesor/alumnos/[id]/page.tsx`

**Interfaces:**

- Consumes: `RutinaVigenteConVinculacionOutput` (Task 8) — the `GET /users/:alumnoId/rutina-vigente` response now includes `vinculada`, `origenTemplateId`, `origenTemplateNombre`.

- [ ] **Step 1: Add the fields to the response type and render the badge**

Replace the full contents of `apps/web/app/(profesor)/profesor/alumnos/[id]/page.tsx`:

```typescript
import Link from 'next/link';
import { apiFetch, ApiError } from '../../../../../lib/api-client';
import { AssignTemplateForm } from './assign-template-form';
import { InstanceEditor } from './instance-editor';
import { Pill } from '../../../../../components/ui/pill';

interface TemplateOption {
  id: string;
  nombre: string;
  activa: boolean;
}

interface RutinaVigenteResponse {
  id: string;
  nombre: string;
  vinculada: boolean;
  origenTemplateId: string | null;
  origenTemplateNombre: string | null;
  ejercicios: Array<{
    exerciseId: string;
    nombre: string;
    imageUrl: string | null;
    orden: number;
    series: number;
    repeticiones: number;
    peso: number | null;
    notas: string | null;
  }>;
}

export default async function AlumnoDetailPage({ params }: { params: { id: string } }) {
  const plantillas = await apiFetch<TemplateOption[]>('/routine-templates');

  let rutinaVigente: RutinaVigenteResponse | null = null;
  try {
    rutinaVigente = await apiFetch<RutinaVigenteResponse>(`/users/${params.id}/rutina-vigente`);
  } catch (error) {
    // El backend responde 200 con el body vacío/null si no hay vigente
    // (ver GetAlumnoRutinaVigenteAsProfesorUseCase) — este catch es solo
    // para el caso de un 403/404 real (alumno fuera de cartera), que acá
    // no debería pasar porque /users/me/alumnos ya filtró la cartera.
    if (!(error instanceof ApiError)) throw error;
    rutinaVigente = null;
  }

  return (
    <main className="flex w-full flex-col gap-6 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-text">
          {rutinaVigente ? `Rutina de ${rutinaVigente.nombre}` : 'Sin rutina asignada'}
        </h1>
        {rutinaVigente?.vinculada && rutinaVigente.origenTemplateNombre && (
          <Link href={`/profesor/plantillas/${rutinaVigente.origenTemplateId}`}>
            <Pill>Vinculada a «{rutinaVigente.origenTemplateNombre}»</Pill>
          </Link>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-muted">
          {rutinaVigente ? 'Reemplazar con una plantilla' : 'Asignar plantilla existente'}
        </h2>
        <AssignTemplateForm
          alumnoId={params.id}
          plantillas={plantillas}
          reemplazaRutinaVigente={Boolean(rutinaVigente)}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-muted">
          {rutinaVigente ? 'Ajustar ejercicios' : 'O armar rutina desde cero'}
        </h2>
        <InstanceEditor
          alumnoId={params.id}
          instanciaVigente={
            rutinaVigente
              ? {
                  id: rutinaVigente.id,
                  nombre: rutinaVigente.nombre,
                  ejercicios: rutinaVigente.ejercicios.map((e) => ({
                    exerciseId: e.exerciseId,
                    nombre: e.nombre,
                    imageUrl: e.imageUrl,
                    orden: e.orden,
                    series: e.series,
                    repeticiones: e.repeticiones,
                    peso: e.peso,
                    notas: e.notas,
                  })),
                }
              : null
          }
        />
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Verify with a build**

Run: `cd apps/web && npm run build`
Expected: builds successfully with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(profesor)/profesor/alumnos/[id]/page.tsx"
git commit -m "feat(web): muestra si la rutina del alumno esta vinculada a su plantilla"
```

---

## After all tasks: manual verification

This plan has no frontend test suite to lean on for the two UI tasks (9, 10) and no e2e test covering the full "assign linked → edit template → see it propagate → edit alumno exercises → see it desvincular" flow end to end. Before considering the branch done, manually walk through, logged in as profesor:

1. Assign a template to an alumno with "Vincular a la plantilla" checked.
2. Edit the template (change an exercise's series, add a new exercise, remove one) and save.
3. Reopen the alumno's page — confirm: existing exercise kept its own series/reps/peso, the new exercise appeared with the template's values, the removed one is gone, and the alumno's own series/reps/peso values from before the edit were NOT overwritten on entries that already existed.
4. On the alumno's page, add or remove one exercise for that specific alumno and save — confirm the "Vinculada a" badge disappears.
5. Search the exercise catalog for a word without accents (e.g. "frances") and confirm an accented exercise name (e.g. "Press Francés") shows up, still displayed with its accent.

Applying the Task 1 migration to the real Supabase database, and re-running `npm run seed:exercises` to backfill `nombreNormalizado`, are separate manual steps for the user — not part of any task above.
