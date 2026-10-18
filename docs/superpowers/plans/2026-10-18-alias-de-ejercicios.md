# Alias de nombre de ejercicio por profesor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un profesor pueda renombrar un ejercicio del catálogo solo para él (alias por perfil, en vivo) y que ese nombre se vea en sus plantillas, en las rutinas de sus alumnos, en el buscador y en el catálogo del profesor, sin modificar nunca la tabla `Exercise`.

**Architecture:** Tabla nueva `ExerciseAlias(profesorId, exerciseId, nombre)` resuelta al leer: `ExerciseRepositoryPort` recibe un `aliasDeProfesorId` opcional y devuelve `nombre` ya resuelto más `nombreCatalogo`. Los endpoints del catálogo pasan el id solo si quien llama es PROFESOR; las rutinas pasan el profesor dueño. Escritura vía `PUT`/`DELETE /exercises/:id/alias` con dos casos de uso hexagonales. En el frontend, "Renombrar" vive en el menú ⋮ de cada línea del editor y guarda al instante.

**Tech Stack:** NestJS + Prisma + PostgreSQL (backend, tests con jest y PGlite), Next.js App Router + Tailwind v4 + shadcn (frontend). Sin dependencias nuevas.

## Global Constraints

- El catálogo `Exercise` no se modifica: ni columnas ni filas. `Exercise` solo gana la relación inversa `aliases ExerciseAlias[]` en el schema de Prisma.
- Un alias por `(profesorId, exerciseId)`; el nombre se recorta y tiene entre 1 y 80 caracteres; dos ejercicios distintos del mismo profesor pueden compartir alias (sin unicidad entre ejercicios).
- Resolución: en catálogo, buscador y detalle se usa el alias del profesor que llama, solo si el rol es PROFESOR (ALUMNO y ADMIN ven el catálogo puro). En rutinas se usa el alias del profesor dueño (`RoutineInstance.profesorId`), sin importar quién mire; sin dueño (`null`) se usa el nombre del catálogo.
- La búsqueda (`search`) del profesor matchea `nombreNormalizado`, `nombreOriginalNormalizado` **y** sus alias propios.
- Endpoints: `PUT /exercises/:id/alias` con `{ nombre }` y `DELETE /exercises/:id/alias`, ambos `@Roles(PROFESOR)`; devuelven el ejercicio resuelto con `nombre` y `nombreCatalogo`. Ejercicio inexistente → 404; nombre inválido → 400.
- `validarExerciseIdsEnCatalogo` usa `findByIds` solo para verificar existencia y **no** pasa la opción de alias.
- `nombreCatalogo` es opcional en los tipos (`ExerciseSummary`, `ExerciseCardData`, `EjercicioEnEdicion`, `DetalleEjercicio`) para no romper fixtures, pero el repositorio y el resolver de rutinas lo devuelven siempre (`null` cuando no hay alias).
- El orden del listado sigue siendo por `nombre` del catálogo (no por alias): limitación aceptada.
- Frontend: "Renombrar" va en el menú ⋮ de cada línea (menú siempre visible); se guarda al instante, sin depender del guardado de la rutina; al guardar se actualizan todas las líneas del editor con ese `exerciseId`.
- Sin React Testing Library ni tests de render: la lógica pura se testea con jest y el diálogo se verifica a mano.
- Sin dependencias nuevas.
- `apps/api`: los tests se corren con `pnpm test` (el script agrega `--experimental-vm-modules`; un `npx jest` pelado hace fallar los `*.int.spec.ts` por entorno). Tras cambiar `schema.prisma` hay que correr `npx prisma generate`. Baseline antes de empezar: `apps/api` 64 suites / 337 tests, `apps/web` 6 suites / 32 tests, todo en verde.
- Los commits tienen el subject en minúscula (commitlint `subject-case`) y terminan con el trailer de coautoría vigente. Los pasos de commit se ejecutan solo si el usuario autorizó commits en la rama de ejecución.
- Tras cambiar firmas de `findById`/`findByIds`, los tests existentes que verifican esas llamadas con `toHaveBeenCalledWith` y argumentos exactos hay que ajustarlos (un argumento `undefined` extra cuenta como argumento): los casos conocidos están listados en cada task.

---

### Task 1: Schema de Prisma y migración de `ExerciseAlias`

**Files:**

- Modify: `apps/api/prisma/schema.prisma` (modelos `User`, `Exercise`, y modelo nuevo `ExerciseAlias`)
- Create: `apps/api/prisma/migrations/20261018120000_exercise_alias/migration.sql`

**Interfaces:**

- Consumes: nada.
- Produces: el modelo Prisma `ExerciseAlias` con campos `id`, `profesorId`, `exerciseId`, `nombre`, `nombreNormalizado`, `createdAt`, `updatedAt`; unicidad compuesta accesible como `profesorId_exerciseId` en `where` de `upsert`; relaciones `Exercise.aliases` (usada por el filtro `aliases: { some: ... }` y por `select`) y `User.aliasesDeEjercicios`. Lo consumen las Tasks 2 y 3.

- [ ] **Step 1: Agregar los modelos al schema**

En `apps/api/prisma/schema.prisma`, dentro de `model User { ... }`, reemplazar:

```prisma
  profesoresAsignados    ProfesorAlumno[]  @relation("ProfesoresDelAlumno")
```

por:

```prisma
  profesoresAsignados    ProfesorAlumno[]  @relation("ProfesoresDelAlumno")
  aliasesDeEjercicios    ExerciseAlias[]
```

Dentro de `model Exercise { ... }`, reemplazar:

```prisma
  ejerciciosDeInstance RoutineInstanceExercise[]

  @@index([gymId])
  @@index([parteCuerpo])
```

por:

```prisma
  ejerciciosDeInstance RoutineInstanceExercise[]
  aliases              ExerciseAlias[]

  @@index([gymId])
  @@index([parteCuerpo])
```

Justo antes del comentario `// Routines — modelo plantilla -> clon al asignar (HLD / PRD §3)`, agregar el modelo nuevo:

```prisma
// Alias de nombre de ejercicio por profesor: renombra un ejercicio del
// catálogo solo para ese profesor (y, por la resolución al leer, para las
// rutinas que él asignó). El catálogo `Exercise` nunca se modifica.
model ExerciseAlias {
  id                String   @id @default(uuid())
  profesorId        String
  exerciseId        String
  nombre            String
  nombreNormalizado String
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  profesor User     @relation(fields: [profesorId], references: [id], onDelete: Cascade)
  exercise Exercise @relation(fields: [exerciseId], references: [id], onDelete: Cascade)

  @@unique([profesorId, exerciseId])
  @@index([profesorId, nombreNormalizado])
}

```

- [ ] **Step 2: Correr la verificación de migraciones y ver que falla**

Run: `cd apps/api && pnpm db:verificar-migraciones`
Expected: sale con código distinto de 0 e informa diferencias entre las migraciones y `schema.prisma` (falta la tabla `ExerciseAlias`).

- [ ] **Step 3: Escribir la migración**

Crear `apps/api/prisma/migrations/20261018120000_exercise_alias/migration.sql` con exactamente:

```sql
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
```

- [ ] **Step 4: Verificar que migraciones y schema coinciden**

Run: `cd apps/api && pnpm db:verificar-migraciones`
Expected: sale con código 0, sin diferencias.

- [ ] **Step 5: Regenerar el cliente de Prisma y correr la suite**

Run: `cd apps/api && npx prisma generate && pnpm test`
Expected: PASS — 64 suites / 337 tests, sin suites nuevas fallando (los `*.int.spec.ts` aplican todas las migraciones, incluida la nueva).

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261018120000_exercise_alias
git commit -m "feat(exercise-catalog): agregar tabla de alias de ejercicio por profesor"
```

---

### Task 2: Lectura del catálogo con alias (puerto y repositorio)

**Files:**

- Modify: `apps/api/src/exercise-catalog/application/ports/exercise-repository.port.ts`
- Modify: `apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise.repository.ts`
- Modify: `apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise.repository.spec.ts`
- Create: `apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise.repository.int.spec.ts`

**Interfaces:**

- Consumes: el modelo `ExerciseAlias` y la relación `Exercise.aliases` (Task 1); `normalizarNombre(texto: string): string` (ya existe en `apps/api/src/exercise-catalog/normalizar-nombre.ts`).
- Produces (los consumen las Tasks 3, 4 y 5):
  - `ExerciseSummary.nombreCatalogo?: string | null`.
  - `ListExercisesFilter.aliasDeProfesorId?: string`.
  - `ExerciseRepositoryPort.findById(id: string, aliasDeProfesorId?: string): Promise<ExerciseDetail | null>`.
  - `ExerciseRepositoryPort.findByIds(ids: string[], aliasDeProfesorId?: string): Promise<ExerciseSummary[]>`.
  - `findMany(filter)` honra `filter.aliasDeProfesorId`.
  - Con `aliasDeProfesorId`, `nombre` ya es el alias y `nombreCatalogo` es el nombre del catálogo; sin alias, `nombre` es el del catálogo y `nombreCatalogo` es `null`. Sin `aliasDeProfesorId`, siempre catálogo puro y `nombreCatalogo: null`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise.repository.int.spec.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import {
  ConexionPrisma,
  conectarPrisma,
  crearPGliteMigrado,
} from '../../../test-support/base-de-prueba';
import { sembrarUsuariosYEjercicios } from '../../../test-support/semillas';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import { normalizarNombre } from '../../normalizar-nombre';
import { PrismaExerciseRepository } from './prisma-exercise.repository';

jest.setTimeout(60_000);

describe('PrismaExerciseRepository con alias (PGlite)', () => {
  let conexion: ConexionPrisma;
  let prisma: PrismaClient;
  let repo: PrismaExerciseRepository;

  beforeAll(async () => {
    conexion = await conectarPrisma(await crearPGliteMigrado());
    prisma = conexion.prisma;
    repo = new PrismaExerciseRepository(prisma as unknown as PrismaService);
    await sembrarUsuariosYEjercicios(prisma);
    await prisma.exercise.update({
      where: { id: 'ex-1' },
      data: {
        nombre: 'Barra press de banca',
        nombreNormalizado: normalizarNombre('Barra press de banca'),
      },
    });
    await prisma.exerciseAlias.create({
      data: {
        profesorId: 'prof-1',
        exerciseId: 'ex-1',
        nombre: 'Banca plana',
        nombreNormalizado: normalizarNombre('Banca plana'),
      },
    });
  });

  afterAll(async () => {
    await conexion.cerrar();
  });

  it('findByIds con el profesor dueño del alias devuelve el alias como nombre y el del catálogo en nombreCatalogo', async () => {
    const [resultado] = await repo.findByIds(['ex-1'], 'prof-1');

    expect(resultado.nombre).toBe('Banca plana');
    expect(resultado.nombreCatalogo).toBe('Barra press de banca');
  });

  it('findByIds sin profesor devuelve el nombre del catálogo y nombreCatalogo null', async () => {
    const [resultado] = await repo.findByIds(['ex-1']);

    expect(resultado.nombre).toBe('Barra press de banca');
    expect(resultado.nombreCatalogo).toBeNull();
  });

  it('findByIds de otro profesor no ve el alias ajeno', async () => {
    const [resultado] = await repo.findByIds(['ex-1'], 'prof-2');

    expect(resultado.nombre).toBe('Barra press de banca');
    expect(resultado.nombreCatalogo).toBeNull();
  });

  it('findByIds de un ejercicio sin alias devuelve nombreCatalogo null aunque se pida con profesor', async () => {
    const [resultado] = await repo.findByIds(['ex-2'], 'prof-1');

    expect(resultado.nombre).toBe('ex-2');
    expect(resultado.nombreCatalogo).toBeNull();
  });

  it('findById resuelve el alias del profesor y no el de otro', async () => {
    const propio = await repo.findById('ex-1', 'prof-1');
    const ajeno = await repo.findById('ex-1', 'prof-2');
    const puro = await repo.findById('ex-1');

    expect([propio?.nombre, propio?.nombreCatalogo]).toEqual([
      'Banca plana',
      'Barra press de banca',
    ]);
    expect([ajeno?.nombre, ajeno?.nombreCatalogo]).toEqual(['Barra press de banca', null]);
    expect([puro?.nombre, puro?.nombreCatalogo]).toEqual(['Barra press de banca', null]);
  });

  it('findMany con search por alias propio encuentra el ejercicio y lo devuelve con el alias', async () => {
    const { items, total } = await repo.findMany({
      search: 'banca plana',
      aliasDeProfesorId: 'prof-1',
      page: 1,
      limit: 10,
    });

    expect(total).toBe(1);
    expect(items.map((i) => [i.id, i.nombre, i.nombreCatalogo])).toEqual([
      ['ex-1', 'Banca plana', 'Barra press de banca'],
    ]);
  });

  it('findMany con search por alias no lo encuentra para otro profesor ni sin profesor', async () => {
    const deOtro = await repo.findMany({
      search: 'banca plana',
      aliasDeProfesorId: 'prof-2',
      page: 1,
      limit: 10,
    });
    const sinProfesor = await repo.findMany({ search: 'banca plana', page: 1, limit: 10 });

    expect(deOtro.total).toBe(0);
    expect(sinProfesor.total).toBe(0);
  });

  it('findMany con search por el nombre del catálogo sigue encontrándolo y lo devuelve con el alias', async () => {
    const { items } = await repo.findMany({
      search: 'barra press',
      aliasDeProfesorId: 'prof-1',
      page: 1,
      limit: 10,
    });

    expect(items.map((i) => i.nombre)).toEqual(['Banca plana']);
  });

  it('findMany normaliza mayúsculas y tildes al buscar por alias', async () => {
    const { total } = await repo.findMany({
      search: 'BANCA PLANÁ',
      aliasDeProfesorId: 'prof-1',
      page: 1,
      limit: 10,
    });

    expect(total).toBe(1);
  });
});
```

En `apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise.repository.spec.ts`, agregar al final del `describe`, justo antes de su `});` de cierre, estos casos (el spec ya tiene `prisma` mockeado y `repo` en el `beforeEach`):

```typescript
it('findByIds con aliasDeProfesorId pide en el select los alias de ese profesor (máximo uno)', async () => {
  await repo.findByIds(['ex-1'], 'prof-1');

  const args = prisma.exercise.findMany.mock.calls[0][0];
  expect(args.select.aliases).toEqual({
    where: { profesorId: 'prof-1' },
    select: { nombre: true },
    take: 1,
  });
});

it('findByIds sin aliasDeProfesorId no pide alias', async () => {
  await repo.findByIds(['ex-1']);

  const args = prisma.exercise.findMany.mock.calls[0][0];
  expect(args.select).not.toHaveProperty('aliases');
});

it('findMany con aliasDeProfesorId suma el match por alias propio al OR de la búsqueda', async () => {
  await repo.findMany({ search: 'Banca', aliasDeProfesorId: 'prof-1', page: 1, limit: 24 });

  const args = prisma.exercise.findMany.mock.calls[0][0];
  expect(args.where.OR).toContainEqual({
    aliases: { some: { profesorId: 'prof-1', nombreNormalizado: { contains: 'banca' } } },
  });
});
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `cd apps/api && pnpm test -- prisma-exercise.repository`
Expected: FAIL — error de compilación de TS (`aliasDeProfesorId` no existe en `ListExercisesFilter`; `findByIds`/`findById` no aceptan un segundo argumento; `nombreCatalogo` no existe en `ExerciseSummary`).

- [ ] **Step 3: Actualizar el puerto**

En `apps/api/src/exercise-catalog/application/ports/exercise-repository.port.ts`:

Reemplazar la interfaz `ExerciseSummary` por:

```typescript
export interface ExerciseSummary {
  id: string;
  /** Nombre a mostrar: el alias del profesor si se pidió con `aliasDeProfesorId` y tiene uno; si no, el del catálogo. */
  nombre: string;
  /** Nombre del catálogo cuando `nombre` es un alias; `null` (o ausente en fixtures) si no hay alias. */
  nombreCatalogo?: string | null;
  nombreOriginal: string | null;
  imageUrl: string | null;
  gifUrl: string | null;
  parteCuerpo: string;
  grupoMuscular: string;
  equipamiento: string | null;
}
```

Reemplazar `ListExercisesFilter` por:

```typescript
export interface ListExercisesFilter {
  search?: string;
  parteCuerpo?: string;
  equipamiento?: string;
  /** Si viene, `nombre` se resuelve con el alias de ese profesor y `search` también matchea sus alias. */
  aliasDeProfesorId?: string;
  page: number;
  limit: number;
}
```

Reemplazar el bloque de `ExerciseRepositoryPort` (comentario y métodos) por:

```typescript
/**
 * Catálogo global de solo lectura en el MVP (sin scoping por gymId — ver
 * Global Constraints del plan). `findMany` filtra/pagina; `findById`
 * devuelve el detalle completo o null si no existe. En los tres métodos,
 * `aliasDeProfesorId` (opcional) resuelve `nombre` con el alias de ese
 * profesor; sin él, siempre el nombre del catálogo.
 */
export interface ExerciseRepositoryPort {
  findMany(filter: ListExercisesFilter): Promise<ListExercisesResult>;
  findById(id: string, aliasDeProfesorId?: string): Promise<ExerciseDetail | null>;
  /**
   * Resuelve varios ejercicios en un solo query — lo usa Routines para
   * enriquecer una rutina completa (nombre/imageUrl/gifUrl por ejercicio)
   * sin hacer un query por cada línea de la rutina.
   */
  findByIds(ids: string[], aliasDeProfesorId?: string): Promise<ExerciseSummary[]>;
}
```

- [ ] **Step 4: Implementar el repositorio**

Reemplazar todo el contenido de `apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise.repository.ts` por:

```typescript
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import {
  ExerciseDetail,
  ExerciseRepositoryPort,
  ExerciseSummary,
  ListExercisesFilter,
  ListExercisesResult,
} from '../../application/ports/exercise-repository.port';
import { normalizarNombre } from '../../normalizar-nombre';

const SELECT_SUMMARY = {
  id: true,
  nombre: true,
  nombreOriginal: true,
  imageUrl: true,
  gifUrl: true,
  parteCuerpo: true,
  grupoMuscular: true,
  equipamiento: true,
} satisfies Prisma.ExerciseSelect;

const SELECT_DETAIL = {
  ...SELECT_SUMMARY,
  gruposMuscularesSecundarios: true,
  instrucciones: true,
  pasos: true,
  atribucionMedia: true,
} satisfies Prisma.ExerciseSelect;

type FilaConAlias = { nombre: string; aliases?: Array<{ nombre: string }> };

/** Trae, junto con el ejercicio, el alias de ese profesor (a lo sumo uno por la unicidad). */
function incluirAlias(aliasDeProfesorId?: string) {
  return aliasDeProfesorId
    ? { aliases: { where: { profesorId: aliasDeProfesorId }, select: { nombre: true }, take: 1 } }
    : {};
}

/** Si hay alias: `nombre` pasa a ser el alias y `nombreCatalogo` el nombre del catálogo. */
function resolverAlias<T extends FilaConAlias>(
  fila: T,
): Omit<T, 'aliases'> & { nombreCatalogo: string | null } {
  const { aliases, ...resto } = fila;
  const alias = aliases?.[0]?.nombre;
  return { ...resto, nombre: alias ?? fila.nombre, nombreCatalogo: alias ? fila.nombre : null };
}

@Injectable()
export class PrismaExerciseRepository implements ExerciseRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(filter: ListExercisesFilter): Promise<ListExercisesResult> {
    const busqueda = filter.search ? normalizarNombre(filter.search) : undefined;
    const where: Prisma.ExerciseWhereInput = {
      activo: true,
      ...(busqueda
        ? {
            OR: [
              { nombreNormalizado: { contains: busqueda } },
              { nombreOriginalNormalizado: { contains: busqueda } },
              ...(filter.aliasDeProfesorId
                ? [
                    {
                      aliases: {
                        some: {
                          profesorId: filter.aliasDeProfesorId,
                          nombreNormalizado: { contains: busqueda },
                        },
                      },
                    },
                  ]
                : []),
            ],
          }
        : {}),
      ...(filter.parteCuerpo ? { parteCuerpo: filter.parteCuerpo } : {}),
      ...(filter.equipamiento ? { equipamiento: filter.equipamiento } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.exercise.findMany({
        where,
        orderBy: { nombre: 'asc' },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        select: { ...SELECT_SUMMARY, ...incluirAlias(filter.aliasDeProfesorId) },
      }),
      this.prisma.exercise.count({ where }),
    ]);

    return {
      items: (items as unknown as FilaConAlias[]).map(
        resolverAlias,
      ) as unknown as ExerciseSummary[],
      total,
    };
  }

  async findById(id: string, aliasDeProfesorId?: string): Promise<ExerciseDetail | null> {
    const exercise = await this.prisma.exercise.findUnique({
      where: { id },
      select: { ...SELECT_DETAIL, ...incluirAlias(aliasDeProfesorId) },
    });
    return exercise
      ? (resolverAlias(exercise as unknown as FilaConAlias) as unknown as ExerciseDetail)
      : null;
  }

  async findByIds(ids: string[], aliasDeProfesorId?: string): Promise<ExerciseSummary[]> {
    if (ids.length === 0) {
      return [];
    }
    const exercises = await this.prisma.exercise.findMany({
      where: { id: { in: ids } },
      select: { ...SELECT_SUMMARY, ...incluirAlias(aliasDeProfesorId) },
    });
    return (exercises as unknown as FilaConAlias[]).map(
      resolverAlias,
    ) as unknown as ExerciseSummary[];
  }
}
```

- [ ] **Step 5: Correr los tests y ver que pasan**

Run: `cd apps/api && pnpm test -- prisma-exercise.repository`
Expected: PASS — los 6 tests existentes del spec unitario, los 3 nuevos unitarios y los 9 de integración.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/exercise-catalog/application/ports/exercise-repository.port.ts \
        apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise.repository.ts \
        apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise.repository.spec.ts \
        apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise.repository.int.spec.ts
git commit -m "feat(exercise-catalog): resolver el alias del profesor al leer ejercicios"
```

---

### Task 3: Escritura de alias (repositorio y casos de uso)

**Files:**

- Create: `apps/api/src/exercise-catalog/application/ports/exercise-alias-repository.port.ts`
- Create: `apps/api/src/exercise-catalog/application/errors/invalid-exercise-alias.error.ts`
- Create: `apps/api/src/exercise-catalog/application/set-exercise-alias.use-case.ts`
- Create: `apps/api/src/exercise-catalog/application/set-exercise-alias.use-case.spec.ts`
- Create: `apps/api/src/exercise-catalog/application/clear-exercise-alias.use-case.ts`
- Create: `apps/api/src/exercise-catalog/application/clear-exercise-alias.use-case.spec.ts`
- Create: `apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise-alias.repository.ts`
- Create: `apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise-alias.repository.int.spec.ts`

**Interfaces:**

- Consumes: `ExerciseRepositoryPort.findById(id, aliasDeProfesorId?)` y `EXERCISE_REPOSITORY` (Task 2, y el existente); `ExerciseNotFoundError` (ya existe en `application/errors/exercise-not-found.error.ts`); `InsufficientRoleError(role, rolesPermitidos)` (ya existe en `apps/api/src/identity/application/errors/insufficient-role.error.ts`); `AuthenticatedUser` y `Role` de `identity/domain`; `normalizarNombre`; `DomainError` de `shared-kernel/domain-error`.
- Produces (los consume la Task 4):
  - `EXERCISE_ALIAS_REPOSITORY` (Symbol) y `ExerciseAliasRepositoryPort { upsert(data: { profesorId: string; exerciseId: string; nombre: string; nombreNormalizado: string }): Promise<void>; delete(profesorId: string, exerciseId: string): Promise<void> }`.
  - `PrismaExerciseAliasRepository` (constructor `(prisma: PrismaService)`).
  - `SetExerciseAliasUseCase.execute({ invocadoPor: AuthenticatedUser; exerciseId: string; nombre: string }): Promise<ExerciseDetail>` y `MAX_LONGITUD_ALIAS = 80`.
  - `ClearExerciseAliasUseCase.execute({ invocadoPor: AuthenticatedUser; exerciseId: string }): Promise<ExerciseDetail>`.
  - `InvalidExerciseAliasError` (`httpStatus = 400`).

- [ ] **Step 1: Escribir los tests que fallan**

Crear `apps/api/src/exercise-catalog/application/set-exercise-alias.use-case.spec.ts`:

```typescript
import { Role } from '../../identity/domain/role';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import { SetExerciseAliasUseCase, MAX_LONGITUD_ALIAS } from './set-exercise-alias.use-case';
import { InvalidExerciseAliasError } from './errors/invalid-exercise-alias.error';
import { ExerciseNotFoundError } from './errors/exercise-not-found.error';
import { ExerciseDetail, ExerciseRepositoryPort } from './ports/exercise-repository.port';
import { ExerciseAliasRepositoryPort } from './ports/exercise-alias-repository.port';

describe('SetExerciseAliasUseCase', () => {
  let exerciseRepository: jest.Mocked<ExerciseRepositoryPort>;
  let aliasRepository: jest.Mocked<ExerciseAliasRepositoryPort>;
  let useCase: SetExerciseAliasUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const alumno = { id: 'alum-1', gymId: 'gym-1', role: Role.ALUMNO };

  const detalle: ExerciseDetail = {
    id: 'ex-1',
    nombre: 'Banca plana',
    nombreCatalogo: 'Barra press de banca',
    nombreOriginal: 'barbell bench press',
    imageUrl: null,
    gifUrl: null,
    parteCuerpo: 'chest',
    grupoMuscular: 'pectorals',
    equipamiento: 'barbell',
    gruposMuscularesSecundarios: [],
    instrucciones: null,
    pasos: [],
    atribucionMedia: null,
  };

  beforeEach(() => {
    exerciseRepository = { findMany: jest.fn(), findById: jest.fn(), findByIds: jest.fn() };
    aliasRepository = { upsert: jest.fn(), delete: jest.fn() };
    useCase = new SetExerciseAliasUseCase(exerciseRepository, aliasRepository);
  });

  it('rechaza si quien invoca no es PROFESOR', async () => {
    await expect(
      useCase.execute({ invocadoPor: alumno, exerciseId: 'ex-1', nombre: 'Banca plana' }),
    ).rejects.toThrow(InsufficientRoleError);
    expect(aliasRepository.upsert).not.toHaveBeenCalled();
  });

  it('rechaza un nombre vacío o de solo espacios', async () => {
    await expect(
      useCase.execute({ invocadoPor: profesor, exerciseId: 'ex-1', nombre: '   ' }),
    ).rejects.toThrow(InvalidExerciseAliasError);
    expect(aliasRepository.upsert).not.toHaveBeenCalled();
  });

  it('rechaza un nombre de más de 80 caracteres, pero acepta uno de exactamente 80', async () => {
    exerciseRepository.findById.mockResolvedValue(detalle);

    await expect(
      useCase.execute({
        invocadoPor: profesor,
        exerciseId: 'ex-1',
        nombre: 'a'.repeat(MAX_LONGITUD_ALIAS + 1),
      }),
    ).rejects.toThrow(InvalidExerciseAliasError);

    await expect(
      useCase.execute({
        invocadoPor: profesor,
        exerciseId: 'ex-1',
        nombre: 'a'.repeat(MAX_LONGITUD_ALIAS),
      }),
    ).resolves.toBeDefined();
  });

  it('rechaza con ExerciseNotFoundError si el ejercicio no existe', async () => {
    exerciseRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ invocadoPor: profesor, exerciseId: 'no-existe', nombre: 'Banca plana' }),
    ).rejects.toThrow(ExerciseNotFoundError);
    expect(aliasRepository.upsert).not.toHaveBeenCalled();
  });

  it('recorta y normaliza el nombre, hace upsert con el id del invocador y devuelve el ejercicio resuelto', async () => {
    exerciseRepository.findById.mockResolvedValue(detalle);

    const resultado = await useCase.execute({
      invocadoPor: profesor,
      exerciseId: 'ex-1',
      nombre: '  Banca Plana ÁÉ  ',
    });

    expect(aliasRepository.upsert).toHaveBeenCalledWith({
      profesorId: 'prof-1',
      exerciseId: 'ex-1',
      nombre: 'Banca Plana ÁÉ',
      nombreNormalizado: 'banca plana ae',
    });
    expect(exerciseRepository.findById).toHaveBeenLastCalledWith('ex-1', 'prof-1');
    expect(resultado).toEqual(detalle);
  });
});
```

Crear `apps/api/src/exercise-catalog/application/clear-exercise-alias.use-case.spec.ts`:

```typescript
import { Role } from '../../identity/domain/role';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import { ClearExerciseAliasUseCase } from './clear-exercise-alias.use-case';
import { ExerciseNotFoundError } from './errors/exercise-not-found.error';
import { ExerciseDetail, ExerciseRepositoryPort } from './ports/exercise-repository.port';
import { ExerciseAliasRepositoryPort } from './ports/exercise-alias-repository.port';

describe('ClearExerciseAliasUseCase', () => {
  let exerciseRepository: jest.Mocked<ExerciseRepositoryPort>;
  let aliasRepository: jest.Mocked<ExerciseAliasRepositoryPort>;
  let useCase: ClearExerciseAliasUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };

  const detalle: ExerciseDetail = {
    id: 'ex-1',
    nombre: 'Barra press de banca',
    nombreCatalogo: null,
    nombreOriginal: 'barbell bench press',
    imageUrl: null,
    gifUrl: null,
    parteCuerpo: 'chest',
    grupoMuscular: 'pectorals',
    equipamiento: 'barbell',
    gruposMuscularesSecundarios: [],
    instrucciones: null,
    pasos: [],
    atribucionMedia: null,
  };

  beforeEach(() => {
    exerciseRepository = { findMany: jest.fn(), findById: jest.fn(), findByIds: jest.fn() };
    aliasRepository = { upsert: jest.fn(), delete: jest.fn() };
    useCase = new ClearExerciseAliasUseCase(exerciseRepository, aliasRepository);
  });

  it('rechaza si quien invoca no es PROFESOR', async () => {
    await expect(useCase.execute({ invocadoPor: admin, exerciseId: 'ex-1' })).rejects.toThrow(
      InsufficientRoleError,
    );
    expect(aliasRepository.delete).not.toHaveBeenCalled();
  });

  it('rechaza con ExerciseNotFoundError si el ejercicio no existe', async () => {
    exerciseRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ invocadoPor: profesor, exerciseId: 'no-existe' }),
    ).rejects.toThrow(ExerciseNotFoundError);
    expect(aliasRepository.delete).not.toHaveBeenCalled();
  });

  it('borra el alias propio y devuelve el ejercicio resuelto (idempotente: borra aunque no hubiera alias)', async () => {
    exerciseRepository.findById.mockResolvedValue(detalle);

    const resultado = await useCase.execute({ invocadoPor: profesor, exerciseId: 'ex-1' });

    expect(aliasRepository.delete).toHaveBeenCalledWith('prof-1', 'ex-1');
    expect(exerciseRepository.findById).toHaveBeenLastCalledWith('ex-1', 'prof-1');
    expect(resultado).toEqual(detalle);
  });
});
```

Crear `apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise-alias.repository.int.spec.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import {
  ConexionPrisma,
  conectarPrisma,
  crearPGliteMigrado,
} from '../../../test-support/base-de-prueba';
import { sembrarUsuariosYEjercicios } from '../../../test-support/semillas';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import { PrismaExerciseAliasRepository } from './prisma-exercise-alias.repository';

jest.setTimeout(60_000);

describe('PrismaExerciseAliasRepository (PGlite)', () => {
  let conexion: ConexionPrisma;
  let prisma: PrismaClient;
  let repo: PrismaExerciseAliasRepository;

  beforeAll(async () => {
    conexion = await conectarPrisma(await crearPGliteMigrado());
    prisma = conexion.prisma;
    repo = new PrismaExerciseAliasRepository(prisma as unknown as PrismaService);
    await sembrarUsuariosYEjercicios(prisma);
  });

  afterAll(async () => {
    await conexion.cerrar();
  });

  it('upsert crea el alias y un segundo upsert lo actualiza sin duplicar', async () => {
    await repo.upsert({
      profesorId: 'prof-1',
      exerciseId: 'ex-1',
      nombre: 'Banca',
      nombreNormalizado: 'banca',
    });
    await repo.upsert({
      profesorId: 'prof-1',
      exerciseId: 'ex-1',
      nombre: 'Banca plana',
      nombreNormalizado: 'banca plana',
    });

    const filas = await prisma.exerciseAlias.findMany({
      where: { profesorId: 'prof-1', exerciseId: 'ex-1' },
    });
    expect(filas).toHaveLength(1);
    expect(filas[0].nombre).toBe('Banca plana');
    expect(filas[0].nombreNormalizado).toBe('banca plana');
  });

  it('dos profesores pueden tener alias distintos para el mismo ejercicio', async () => {
    await repo.upsert({
      profesorId: 'prof-2',
      exerciseId: 'ex-1',
      nombre: 'Press plano',
      nombreNormalizado: 'press plano',
    });

    const filas = await prisma.exerciseAlias.findMany({ where: { exerciseId: 'ex-1' } });
    expect(filas.map((f) => [f.profesorId, f.nombre]).sort()).toEqual([
      ['prof-1', 'Banca plana'],
      ['prof-2', 'Press plano'],
    ]);
  });

  it('delete borra el alias propio y es idempotente (no falla si no existe)', async () => {
    await repo.upsert({
      profesorId: 'prof-1',
      exerciseId: 'ex-2',
      nombre: 'Sentadilla',
      nombreNormalizado: 'sentadilla',
    });

    await repo.delete('prof-1', 'ex-2');
    await expect(repo.delete('prof-1', 'ex-2')).resolves.toBeUndefined();

    expect(
      await prisma.exerciseAlias.count({ where: { profesorId: 'prof-1', exerciseId: 'ex-2' } }),
    ).toBe(0);
  });

  it('borrar el profesor borra sus alias en cascada', async () => {
    await repo.upsert({
      profesorId: 'prof-2',
      exerciseId: 'ex-4',
      nombre: 'Remo',
      nombreNormalizado: 'remo',
    });

    await prisma.user.delete({ where: { id: 'prof-2' } });

    expect(await prisma.exerciseAlias.count({ where: { profesorId: 'prof-2' } })).toBe(0);
  });

  it('borrar el ejercicio borra sus alias en cascada', async () => {
    await repo.upsert({
      profesorId: 'prof-1',
      exerciseId: 'ex-5',
      nombre: 'Peso muerto',
      nombreNormalizado: 'peso muerto',
    });

    await prisma.exercise.delete({ where: { id: 'ex-5' } });

    expect(await prisma.exerciseAlias.count({ where: { exerciseId: 'ex-5' } })).toBe(0);
  });
});
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `cd apps/api && pnpm test -- exercise-alias`
Expected: FAIL — `Cannot find module` (puerto, casos de uso y repositorio todavía no existen).

- [ ] **Step 3: Crear puerto, error y repositorio**

Crear `apps/api/src/exercise-catalog/application/ports/exercise-alias-repository.port.ts`:

```typescript
export const EXERCISE_ALIAS_REPOSITORY = Symbol('EXERCISE_ALIAS_REPOSITORY');

export interface ExerciseAliasRepositoryPort {
  /** Crea o actualiza el alias de ese profesor para ese ejercicio (uno solo por par). */
  upsert(data: {
    profesorId: string;
    exerciseId: string;
    nombre: string;
    nombreNormalizado: string;
  }): Promise<void>;
  /** Idempotente: no falla si el alias no existe. */
  delete(profesorId: string, exerciseId: string): Promise<void>;
}
```

Crear `apps/api/src/exercise-catalog/application/errors/invalid-exercise-alias.error.ts`:

```typescript
import { DomainError } from '../../../shared-kernel/domain-error';

export class InvalidExerciseAliasError extends DomainError {
  readonly httpStatus = 400;

  constructor(maxLength: number) {
    super(`El nombre del ejercicio no puede estar vacío ni superar los ${maxLength} caracteres.`);
    this.name = 'InvalidExerciseAliasError';
  }
}
```

Crear `apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise-alias.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import { ExerciseAliasRepositoryPort } from '../../application/ports/exercise-alias-repository.port';

@Injectable()
export class PrismaExerciseAliasRepository implements ExerciseAliasRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(data: {
    profesorId: string;
    exerciseId: string;
    nombre: string;
    nombreNormalizado: string;
  }): Promise<void> {
    await this.prisma.exerciseAlias.upsert({
      where: {
        profesorId_exerciseId: { profesorId: data.profesorId, exerciseId: data.exerciseId },
      },
      create: data,
      update: { nombre: data.nombre, nombreNormalizado: data.nombreNormalizado },
    });
  }

  async delete(profesorId: string, exerciseId: string): Promise<void> {
    await this.prisma.exerciseAlias.deleteMany({ where: { profesorId, exerciseId } });
  }
}
```

- [ ] **Step 4: Crear los casos de uso**

Crear `apps/api/src/exercise-catalog/application/set-exercise-alias.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { Role } from '../../identity/domain/role';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import {
  EXERCISE_REPOSITORY,
  ExerciseDetail,
  ExerciseRepositoryPort,
} from './ports/exercise-repository.port';
import {
  EXERCISE_ALIAS_REPOSITORY,
  ExerciseAliasRepositoryPort,
} from './ports/exercise-alias-repository.port';
import { ExerciseNotFoundError } from './errors/exercise-not-found.error';
import { InvalidExerciseAliasError } from './errors/invalid-exercise-alias.error';
import { normalizarNombre } from '../normalizar-nombre';

export const MAX_LONGITUD_ALIAS = 80;

const ROLES_QUE_PUEDEN_RENOMBRAR: Role[] = [Role.PROFESOR];

export interface SetExerciseAliasInput {
  invocadoPor: AuthenticatedUser;
  exerciseId: string;
  nombre: string;
}

/**
 * Crea o actualiza el alias que el profesor le pone a un ejercicio del
 * catálogo. Solo escribe en `ExerciseAlias`: el catálogo no se toca.
 */
@Injectable()
export class SetExerciseAliasUseCase {
  constructor(
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
    @Inject(EXERCISE_ALIAS_REPOSITORY)
    private readonly aliasRepository: ExerciseAliasRepositoryPort,
  ) {}

  async execute(input: SetExerciseAliasInput): Promise<ExerciseDetail> {
    if (!ROLES_QUE_PUEDEN_RENOMBRAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_RENOMBRAR);
    }

    const nombre = input.nombre.trim();
    if (nombre.length === 0 || nombre.length > MAX_LONGITUD_ALIAS) {
      throw new InvalidExerciseAliasError(MAX_LONGITUD_ALIAS);
    }

    const existente = await this.exerciseRepository.findById(input.exerciseId);
    if (!existente) {
      throw new ExerciseNotFoundError(input.exerciseId);
    }

    await this.aliasRepository.upsert({
      profesorId: input.invocadoPor.id,
      exerciseId: input.exerciseId,
      nombre,
      nombreNormalizado: normalizarNombre(nombre),
    });

    const resuelto = await this.exerciseRepository.findById(input.exerciseId, input.invocadoPor.id);
    if (!resuelto) {
      throw new ExerciseNotFoundError(input.exerciseId);
    }
    return resuelto;
  }
}
```

Crear `apps/api/src/exercise-catalog/application/clear-exercise-alias.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { Role } from '../../identity/domain/role';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import {
  EXERCISE_REPOSITORY,
  ExerciseDetail,
  ExerciseRepositoryPort,
} from './ports/exercise-repository.port';
import {
  EXERCISE_ALIAS_REPOSITORY,
  ExerciseAliasRepositoryPort,
} from './ports/exercise-alias-repository.port';
import { ExerciseNotFoundError } from './errors/exercise-not-found.error';

const ROLES_QUE_PUEDEN_RENOMBRAR: Role[] = [Role.PROFESOR];

export interface ClearExerciseAliasInput {
  invocadoPor: AuthenticatedUser;
  exerciseId: string;
}

/** Vuelve al nombre del catálogo: borra el alias propio. Idempotente. */
@Injectable()
export class ClearExerciseAliasUseCase {
  constructor(
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
    @Inject(EXERCISE_ALIAS_REPOSITORY)
    private readonly aliasRepository: ExerciseAliasRepositoryPort,
  ) {}

  async execute(input: ClearExerciseAliasInput): Promise<ExerciseDetail> {
    if (!ROLES_QUE_PUEDEN_RENOMBRAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_RENOMBRAR);
    }

    const existente = await this.exerciseRepository.findById(input.exerciseId);
    if (!existente) {
      throw new ExerciseNotFoundError(input.exerciseId);
    }

    await this.aliasRepository.delete(input.invocadoPor.id, input.exerciseId);

    const resuelto = await this.exerciseRepository.findById(input.exerciseId, input.invocadoPor.id);
    if (!resuelto) {
      throw new ExerciseNotFoundError(input.exerciseId);
    }
    return resuelto;
  }
}
```

- [ ] **Step 5: Correr los tests y ver que pasan**

Run: `cd apps/api && pnpm test -- exercise-alias`
Expected: PASS — 5 tests de `SetExerciseAlias`, 3 de `ClearExerciseAlias` y 5 de integración del repositorio.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/exercise-catalog/application/ports/exercise-alias-repository.port.ts \
        apps/api/src/exercise-catalog/application/errors/invalid-exercise-alias.error.ts \
        apps/api/src/exercise-catalog/application/set-exercise-alias.use-case.ts \
        apps/api/src/exercise-catalog/application/set-exercise-alias.use-case.spec.ts \
        apps/api/src/exercise-catalog/application/clear-exercise-alias.use-case.ts \
        apps/api/src/exercise-catalog/application/clear-exercise-alias.use-case.spec.ts \
        apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise-alias.repository.ts \
        apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise-alias.repository.int.spec.ts
git commit -m "feat(exercise-catalog): casos de uso para crear y borrar el alias de un ejercicio"
```

---

### Task 4: Endpoints del catálogo conscientes del profesor

**Files:**

- Modify: `apps/api/src/exercise-catalog/application/list-exercises.use-case.ts`
- Modify: `apps/api/src/exercise-catalog/application/get-exercise.use-case.ts`
- Modify: `apps/api/src/exercise-catalog/application/get-exercises-by-ids.use-case.ts`
- Modify: `apps/api/src/exercise-catalog/application/list-exercises.use-case.spec.ts`
- Modify: `apps/api/src/exercise-catalog/application/get-exercise.use-case.spec.ts`
- Modify: `apps/api/src/exercise-catalog/application/get-exercises-by-ids.use-case.spec.ts`
- Create: `apps/api/src/exercise-catalog/infrastructure/http/dto/set-exercise-alias.dto.ts`
- Modify: `apps/api/src/exercise-catalog/infrastructure/http/exercises.controller.ts`
- Modify: `apps/api/src/exercise-catalog/exercise-catalog.module.ts`
- Modify: `apps/api/src/exercise-catalog/infrastructure/http/exercises.e2e.spec.ts`

**Interfaces:**

- Consumes: `ExerciseRepositoryPort` con `aliasDeProfesorId` (Task 2); `SetExerciseAliasUseCase`, `ClearExerciseAliasUseCase`, `EXERCISE_ALIAS_REPOSITORY`, `PrismaExerciseAliasRepository` (Task 3); `Roles` de `apps/api/src/identity/infrastructure/decorators/roles.decorator`.
- Produces: `ListExercisesInput.aliasDeProfesorId?: string`; `GetExerciseUseCase.execute(id: string, aliasDeProfesorId?: string)`; `GetExercisesByIdsUseCase.execute(ids: string[], aliasDeProfesorId?: string)`; las rutas `PUT /exercises/:id/alias` y `DELETE /exercises/:id/alias`. Lo consume el frontend (Task 7).

- [ ] **Step 1: Escribir los tests que fallan y ajustar los existentes**

En `apps/api/src/exercise-catalog/application/get-exercise.use-case.spec.ts`:

- cambiar la aserción `expect(repo.findById).toHaveBeenCalledWith('ex-1');` por `expect(repo.findById).toHaveBeenCalledWith('ex-1', undefined);`
- agregar, antes del `});` de cierre del `describe`:

```typescript
it('pasa aliasDeProfesorId al repositorio para resolver el alias', async () => {
  repo.findById.mockResolvedValue(detalle);

  await useCase.execute('ex-1', 'prof-1');

  expect(repo.findById).toHaveBeenCalledWith('ex-1', 'prof-1');
});
```

En `apps/api/src/exercise-catalog/application/get-exercises-by-ids.use-case.spec.ts`:

- cambiar `expect(repo.findByIds).toHaveBeenCalledWith(['ex-a', 'ex-b']);` por `expect(repo.findByIds).toHaveBeenCalledWith(['ex-a', 'ex-b'], undefined);`
- agregar, antes del `});` de cierre del `describe`:

```typescript
it('pasa aliasDeProfesorId al repositorio para resolver el alias', async () => {
  repo.findByIds.mockResolvedValue([resumenA]);

  await useCase.execute(['ex-a'], 'prof-1');

  expect(repo.findByIds).toHaveBeenCalledWith(['ex-a'], 'prof-1');
});
```

En `apps/api/src/exercise-catalog/application/list-exercises.use-case.spec.ts`, agregar antes del `});` de cierre del `describe`:

```typescript
it('pasa aliasDeProfesorId al repositorio', async () => {
  repo.findMany.mockResolvedValue({ items: [], total: 0 });

  await useCase.execute({ search: 'banca', aliasDeProfesorId: 'prof-1', page: 1, limit: 24 });

  expect(repo.findMany).toHaveBeenCalledWith({
    search: 'banca',
    aliasDeProfesorId: 'prof-1',
    page: 1,
    limit: 24,
  });
});
```

En `apps/api/src/exercise-catalog/infrastructure/http/exercises.e2e.spec.ts`:

(a) Después de la línea `import { GetExercisesByIdsUseCase } from '../../application/get-exercises-by-ids.use-case';` agregar:

```typescript
import { SetExerciseAliasUseCase } from '../../application/set-exercise-alias.use-case';
import { ClearExerciseAliasUseCase } from '../../application/clear-exercise-alias.use-case';
import {
  EXERCISE_ALIAS_REPOSITORY,
  ExerciseAliasRepositoryPort,
} from '../../application/ports/exercise-alias-repository.port';
```

(b) Reemplazar el `findById` del `fakeExerciseRepository`:

```typescript
    findById: jest.fn(async (id: string) =>
      id === 'ex-1'
        ? {
            ...ejercicioResumen,
            gruposMuscularesSecundarios: ['hip flexors'],
            instrucciones: 'Texto',
            pasos: ['Paso 1'],
            atribucionMedia: '© Gym visual — https://gymvisual.com/',
          }
        : null,
    ),
```

por:

```typescript
    findById: jest.fn(async (id: string, aliasDeProfesorId?: string) =>
      id === 'ex-1'
        ? {
            ...ejercicioResumen,
            ...(aliasDeProfesorId
              ? { nombre: 'Banca plana', nombreCatalogo: ejercicioResumen.nombre }
              : {}),
            gruposMuscularesSecundarios: ['hip flexors'],
            instrucciones: 'Texto',
            pasos: ['Paso 1'],
            atribucionMedia: '© Gym visual — https://gymvisual.com/',
          }
        : null,
    ),
```

(c) Reemplazar el bloque `const fakeUserRepository ... };` completo (el que define `findByAuthUserId`) por:

```typescript
const usuarioProfesor: UserRecord = {
  id: 'user-prof',
  authUserId: 'auth-prof',
  gymId: 'gym-A',
  username: 'prof',
  nombre: 'Prof',
  role: Role.PROFESOR,
  activo: true,
};

const fakeUserRepository: Pick<UserRepositoryPort, 'findByAuthUserId'> = {
  findByAuthUserId: async (authUserId: string) => {
    if (authUserId === 'auth-1') return usuarioAlumno;
    if (authUserId === 'auth-prof') return usuarioProfesor;
    return null;
  },
};

const fakeAliasRepository: ExerciseAliasRepositoryPort = {
  upsert: jest.fn(async () => undefined),
  delete: jest.fn(async () => undefined),
};
```

(d) Reemplazar la función `firmarToken`:

```typescript
function firmarToken(): Promise<string> {
  return signTestToken(claves.privateKey, {
    issuer: `${TEST_SUPABASE_URL}/auth/v1`,
    sub: 'auth-1',
  });
}
```

por:

```typescript
function firmarToken(sub = 'auth-1'): Promise<string> {
  return signTestToken(claves.privateKey, {
    issuer: `${TEST_SUPABASE_URL}/auth/v1`,
    sub,
  });
}
```

(e) En los providers del `Test.createTestingModule`, reemplazar:

```typescript
        GetExercisesByIdsUseCase,
        { provide: EXERCISE_REPOSITORY, useValue: fakeExerciseRepository },
```

por:

```typescript
        GetExercisesByIdsUseCase,
        SetExerciseAliasUseCase,
        ClearExerciseAliasUseCase,
        { provide: EXERCISE_REPOSITORY, useValue: fakeExerciseRepository },
        { provide: EXERCISE_ALIAS_REPOSITORY, useValue: fakeAliasRepository },
```

(f) En el test `by-ids resuelve varios en un solo llamado, comma-separated`, cambiar `expect(fakeExerciseRepository.findByIds).toHaveBeenCalledWith(['ex-1', 'ex-2']);` por `expect(fakeExerciseRepository.findByIds).toHaveBeenCalledWith(['ex-1', 'ex-2'], undefined);`

(g) Agregar, antes del `});` de cierre del `describe('/exercises (e2e)'`:

```typescript
describe('alias de profesor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('PROFESOR: el listado se resuelve con su alias (aliasDeProfesorId = su id)', async () => {
    const token = await firmarToken('auth-prof');
    await request(app.getHttpServer())
      .get('/exercises?search=banca')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(fakeExerciseRepository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'banca', aliasDeProfesorId: 'user-prof' }),
    );
  });

  it('ALUMNO: el listado no pasa aliasDeProfesorId (catálogo puro)', async () => {
    const token = await firmarToken();
    await request(app.getHttpServer())
      .get('/exercises')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const filtro = (fakeExerciseRepository.findMany as jest.Mock).mock.calls[0][0];
    expect(filtro.aliasDeProfesorId).toBeUndefined();
  });

  it('PROFESOR: by-ids y detalle resuelven con su alias', async () => {
    const token = await firmarToken('auth-prof');

    await request(app.getHttpServer())
      .get('/exercises/by-ids?ids=ex-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(fakeExerciseRepository.findByIds).toHaveBeenCalledWith(['ex-1'], 'user-prof');

    const detalle = await request(app.getHttpServer())
      .get('/exercises/ex-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(fakeExerciseRepository.findById).toHaveBeenCalledWith('ex-1', 'user-prof');
    expect(detalle.body.nombre).toBe('Banca plana');
  });

  it('PUT alias como PROFESOR responde 200 con el ejercicio resuelto y guarda el alias recortado y normalizado', async () => {
    const token = await firmarToken('auth-prof');
    const res = await request(app.getHttpServer())
      .put('/exercises/ex-1/alias')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: '  Banca plana  ' })
      .expect(200);

    expect(res.body.nombre).toBe('Banca plana');
    expect(res.body.nombreCatalogo).toBe('3/4 Sit-Up');
    expect(fakeAliasRepository.upsert).toHaveBeenCalledWith({
      profesorId: 'user-prof',
      exerciseId: 'ex-1',
      nombre: 'Banca plana',
      nombreNormalizado: 'banca plana',
    });
  });

  it('PUT alias como ALUMNO responde 403 y no escribe', async () => {
    const token = await firmarToken();
    await request(app.getHttpServer())
      .put('/exercises/ex-1/alias')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Banca plana' })
      .expect(403);

    expect(fakeAliasRepository.upsert).not.toHaveBeenCalled();
  });

  it('PUT alias con nombre vacío o ausente responde 400', async () => {
    const token = await firmarToken('auth-prof');
    await request(app.getHttpServer())
      .put('/exercises/ex-1/alias')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: '   ' })
      .expect(400);
    await request(app.getHttpServer())
      .put('/exercises/ex-1/alias')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);

    expect(fakeAliasRepository.upsert).not.toHaveBeenCalled();
  });

  it('PUT alias de un ejercicio inexistente responde 404', async () => {
    const token = await firmarToken('auth-prof');
    const res = await request(app.getHttpServer())
      .put('/exercises/no-existe/alias')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Banca plana' })
      .expect(404);

    expect(res.body.error).toBe('ExerciseNotFoundError');
  });

  it('DELETE alias como PROFESOR responde 200 y borra su alias', async () => {
    const token = await firmarToken('auth-prof');
    await request(app.getHttpServer())
      .delete('/exercises/ex-1/alias')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(fakeAliasRepository.delete).toHaveBeenCalledWith('user-prof', 'ex-1');
  });

  it('DELETE alias como ALUMNO responde 403 y no borra', async () => {
    const token = await firmarToken();
    await request(app.getHttpServer())
      .delete('/exercises/ex-1/alias')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(fakeAliasRepository.delete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `cd apps/api && pnpm test -- exercise-catalog`
Expected: FAIL — errores de compilación de TS (los casos de uso no aceptan `aliasDeProfesorId`; `exercises.controller` no tiene las rutas ni conoce a los casos de uso nuevos).

- [ ] **Step 3: Pasar el alias a través de los casos de uso de lectura**

En `apps/api/src/exercise-catalog/application/list-exercises.use-case.ts`, en `ListExercisesInput` agregar el campo y pasarlo al repositorio. Reemplazar:

```typescript
export interface ListExercisesInput {
  search?: string;
  parteCuerpo?: string;
  equipamiento?: string;
  page: number;
  limit: number;
}
```

por:

```typescript
export interface ListExercisesInput {
  search?: string;
  parteCuerpo?: string;
  equipamiento?: string;
  /** Profesor cuyos alias se aplican al listado y a la búsqueda; ausente = catálogo puro. */
  aliasDeProfesorId?: string;
  page: number;
  limit: number;
}
```

y reemplazar la llamada:

```typescript
const { items, total } = await this.exerciseRepository.findMany({
  search: input.search,
  parteCuerpo: input.parteCuerpo,
  equipamiento: input.equipamiento,
  page: input.page,
  limit: input.limit,
});
```

por:

```typescript
const { items, total } = await this.exerciseRepository.findMany({
  search: input.search,
  parteCuerpo: input.parteCuerpo,
  equipamiento: input.equipamiento,
  aliasDeProfesorId: input.aliasDeProfesorId,
  page: input.page,
  limit: input.limit,
});
```

En `apps/api/src/exercise-catalog/application/get-exercise.use-case.ts`, reemplazar el método `execute`:

```typescript
  async execute(id: string, aliasDeProfesorId?: string): Promise<ExerciseDetail> {
    const exercise = await this.exerciseRepository.findById(id, aliasDeProfesorId);
    if (!exercise) {
      throw new ExerciseNotFoundError(id);
    }
    return exercise;
  }
```

En `apps/api/src/exercise-catalog/application/get-exercises-by-ids.use-case.ts`, reemplazar el método `execute`:

```typescript
  async execute(ids: string[], aliasDeProfesorId?: string): Promise<ExerciseSummary[]> {
    if (ids.length === 0) {
      return [];
    }
    return this.exerciseRepository.findByIds(ids, aliasDeProfesorId);
  }
```

- [ ] **Step 4: Crear el DTO, el controlador y el módulo**

Crear `apps/api/src/exercise-catalog/infrastructure/http/dto/set-exercise-alias.dto.ts`:

```typescript
import { IsString } from 'class-validator';

/** El recorte y el largo (1 a 80) los valida el caso de uso, después de recortar. */
export class SetExerciseAliasDto {
  @IsString()
  nombre!: string;
}
```

Reemplazar todo el contenido de `apps/api/src/exercise-catalog/infrastructure/http/exercises.controller.ts` por:

```typescript
import { Body, Controller, Delete, Get, HttpCode, Param, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  ListExercisesUseCase,
  ListExercisesOutput,
} from '../../application/list-exercises.use-case';
import { GetExerciseUseCase } from '../../application/get-exercise.use-case';
import { GetExercisesByIdsUseCase } from '../../application/get-exercises-by-ids.use-case';
import { SetExerciseAliasUseCase } from '../../application/set-exercise-alias.use-case';
import { ClearExerciseAliasUseCase } from '../../application/clear-exercise-alias.use-case';
import { ExerciseDetail, ExerciseSummary } from '../../application/ports/exercise-repository.port';
import { ListExercisesDto } from './dto/list-exercises.dto';
import { GetExercisesByIdsDto } from './dto/get-exercises-by-ids.dto';
import { SetExerciseAliasDto } from './dto/set-exercise-alias.dto';
import { Roles } from '../../../identity/infrastructure/decorators/roles.decorator';
import { Role } from '../../../identity/domain/role';
import { AuthenticatedUser } from '../../../identity/domain/authenticated-user';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

/** Solo el PROFESOR tiene alias propios: ALUMNO y ADMIN ven siempre el catálogo puro. */
function aliasDe(req: RequestWithUser): string | undefined {
  return req.user.role === Role.PROFESOR ? req.user.id : undefined;
}

@Controller('exercises')
export class ExercisesController {
  constructor(
    private readonly listExercisesUseCase: ListExercisesUseCase,
    private readonly getExerciseUseCase: GetExerciseUseCase,
    private readonly getExercisesByIdsUseCase: GetExercisesByIdsUseCase,
    private readonly setExerciseAliasUseCase: SetExerciseAliasUseCase,
    private readonly clearExerciseAliasUseCase: ClearExerciseAliasUseCase,
  ) {}

  @Get()
  async list(
    @Query() dto: ListExercisesDto,
    @Req() req: RequestWithUser,
  ): Promise<ListExercisesOutput> {
    return this.listExercisesUseCase.execute({ ...dto, aliasDeProfesorId: aliasDe(req) });
  }

  // Declarado antes de `:id` — si no, Nest lo matchearía como
  // GET /exercises/:id con id="by-ids".
  @Get('by-ids')
  async byIds(
    @Query() dto: GetExercisesByIdsDto,
    @Req() req: RequestWithUser,
  ): Promise<ExerciseSummary[]> {
    return this.getExercisesByIdsUseCase.execute(dto.ids, aliasDe(req));
  }

  @Get(':id')
  async detail(@Param('id') id: string, @Req() req: RequestWithUser): Promise<ExerciseDetail> {
    return this.getExerciseUseCase.execute(id, aliasDe(req));
  }

  @Put(':id/alias')
  @Roles(Role.PROFESOR)
  async setAlias(
    @Param('id') id: string,
    @Body() dto: SetExerciseAliasDto,
    @Req() req: RequestWithUser,
  ): Promise<ExerciseDetail> {
    return this.setExerciseAliasUseCase.execute({
      invocadoPor: req.user,
      exerciseId: id,
      nombre: dto.nombre,
    });
  }

  @Delete(':id/alias')
  @Roles(Role.PROFESOR)
  @HttpCode(200)
  async clearAlias(@Param('id') id: string, @Req() req: RequestWithUser): Promise<ExerciseDetail> {
    return this.clearExerciseAliasUseCase.execute({ invocadoPor: req.user, exerciseId: id });
  }
}
```

Reemplazar todo el contenido de `apps/api/src/exercise-catalog/exercise-catalog.module.ts` por:

```typescript
import { Module } from '@nestjs/common';
import { EXERCISE_REPOSITORY } from './application/ports/exercise-repository.port';
import { EXERCISE_ALIAS_REPOSITORY } from './application/ports/exercise-alias-repository.port';
import { ListExercisesUseCase } from './application/list-exercises.use-case';
import { GetExerciseUseCase } from './application/get-exercise.use-case';
import { GetExercisesByIdsUseCase } from './application/get-exercises-by-ids.use-case';
import { SetExerciseAliasUseCase } from './application/set-exercise-alias.use-case';
import { ClearExerciseAliasUseCase } from './application/clear-exercise-alias.use-case';
import { PrismaExerciseRepository } from './infrastructure/persistence/prisma-exercise.repository';
import { PrismaExerciseAliasRepository } from './infrastructure/persistence/prisma-exercise-alias.repository';
import { ExercisesController } from './infrastructure/http/exercises.controller';

@Module({
  imports: [],
  controllers: [ExercisesController],
  providers: [
    { provide: EXERCISE_REPOSITORY, useClass: PrismaExerciseRepository },
    { provide: EXERCISE_ALIAS_REPOSITORY, useClass: PrismaExerciseAliasRepository },
    ListExercisesUseCase,
    GetExerciseUseCase,
    GetExercisesByIdsUseCase,
    SetExerciseAliasUseCase,
    ClearExerciseAliasUseCase,
  ],
  exports: [EXERCISE_REPOSITORY],
})
export class ExerciseCatalogModule {}
```

- [ ] **Step 5: Correr los tests y ver que pasan**

Run: `cd apps/api && pnpm test -- exercise-catalog`
Expected: PASS — todo el módulo `exercise-catalog` en verde, incluidos los 9 casos nuevos de `alias de profesor` del e2e.

- [ ] **Step 6: Correr la suite completa y el chequeo de tipos**

Run: `cd apps/api && pnpm test && npx tsc --noEmit -p tsconfig.json`
Expected: PASS — suite completa en verde (el resolver de rutinas todavía llama a `findByIds(ids)` con un solo argumento hasta la Task 5, así que sus tests no cambian); `tsc` sin errores.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/exercise-catalog
git commit -m "feat(exercise-catalog): endpoints de alias y catalogo resuelto por profesor"
```

---

### Task 5: Resolución del alias en las rutinas

**Files:**

- Modify: `apps/api/src/routines/application/resolver-dias-de-rutina.ts`
- Create: `apps/api/src/routines/application/resolver-dias-de-rutina.spec.ts`
- Modify: `apps/api/src/routines/application/get-mi-rutina-vigente.use-case.ts`
- Modify: `apps/api/src/routines/application/get-mi-rutina-vigente.use-case.spec.ts`
- Modify: `apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.ts`
- Modify: `apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.spec.ts`

**Interfaces:**

- Consumes: `ExerciseRepositoryPort.findByIds(ids, aliasDeProfesorId?)` y `ExerciseSummary.nombreCatalogo` (Task 2); `RoutineInstanceDetail.profesorId: string | null` (ya existe).
- Produces: `resolverDiasDeRutina(exerciseRepository, dias, aliasDeProfesorId?: string | null)`; `RutinaVigenteEjercicioResuelto.nombreCatalogo: string | null`. Lo consume el frontend (Task 6, vía `DiaRutinaApi`).

- [ ] **Step 1: Escribir los tests que fallan y ajustar los existentes**

Crear `apps/api/src/routines/application/resolver-dias-de-rutina.spec.ts`:

```typescript
import { resolverDiasDeRutina } from './resolver-dias-de-rutina';
import {
  ExerciseRepositoryPort,
  ExerciseSummary,
} from '../../exercise-catalog/application/ports/exercise-repository.port';

describe('resolverDiasDeRutina', () => {
  let exerciseRepository: jest.Mocked<ExerciseRepositoryPort>;

  const dias = [
    {
      numero: 1,
      ejercicios: [
        { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, peso: null, notas: null },
      ],
    },
  ];

  const conAlias: ExerciseSummary = {
    id: 'ex-1',
    nombre: 'Banca plana',
    nombreCatalogo: 'Barra press de banca',
    nombreOriginal: null,
    imageUrl: null,
    gifUrl: null,
    parteCuerpo: 'chest',
    grupoMuscular: 'pectorals',
    equipamiento: 'barbell',
  };

  beforeEach(() => {
    exerciseRepository = { findMany: jest.fn(), findById: jest.fn(), findByIds: jest.fn() };
  });

  it('con profesor dueño pide los nombres con su alias y expone nombre y nombreCatalogo', async () => {
    exerciseRepository.findByIds.mockResolvedValue([conAlias]);

    const [dia] = await resolverDiasDeRutina(exerciseRepository, dias, 'prof-1');

    expect(exerciseRepository.findByIds).toHaveBeenCalledWith(['ex-1'], 'prof-1');
    expect(dia.ejercicios[0]).toMatchObject({
      nombre: 'Banca plana',
      nombreCatalogo: 'Barra press de banca',
    });
  });

  it('sin profesor dueño (null) pide el catálogo puro, sin alias', async () => {
    exerciseRepository.findByIds.mockResolvedValue([
      { ...conAlias, nombre: 'Barra press de banca', nombreCatalogo: null },
    ]);

    const [dia] = await resolverDiasDeRutina(exerciseRepository, dias, null);

    expect(exerciseRepository.findByIds).toHaveBeenCalledWith(['ex-1'], undefined);
    expect(dia.ejercicios[0]).toMatchObject({
      nombre: 'Barra press de banca',
      nombreCatalogo: null,
    });
  });

  it('un ejercicio sin alias devuelve nombreCatalogo null aunque venga sin el campo', async () => {
    const sinCampo: ExerciseSummary = {
      id: 'ex-1',
      nombre: 'Sentadilla',
      nombreOriginal: null,
      imageUrl: null,
      gifUrl: null,
      parteCuerpo: 'upper legs',
      grupoMuscular: 'quads',
      equipamiento: 'barbell',
    };
    exerciseRepository.findByIds.mockResolvedValue([sinCampo]);

    const [dia] = await resolverDiasDeRutina(exerciseRepository, dias, 'prof-1');

    expect(dia.ejercicios[0].nombreCatalogo).toBeNull();
  });

  it('un ejercicio que ya no existe se muestra como no encontrado, con nombreCatalogo null', async () => {
    exerciseRepository.findByIds.mockResolvedValue([]);

    const [dia] = await resolverDiasDeRutina(exerciseRepository, dias, 'prof-1');

    expect(dia.ejercicios[0]).toMatchObject({
      nombre: '(ejercicio no encontrado)',
      nombreCatalogo: null,
    });
  });
});
```

En `apps/api/src/routines/application/get-mi-rutina-vigente.use-case.spec.ts`:

- cambiar la aserción `expect(exerciseRepository.findByIds).toHaveBeenCalledWith(['ex-1']);` (test "resuelve los ejercicios de todos los días con un solo findByIds…") por `expect(exerciseRepository.findByIds).toHaveBeenCalledWith(['ex-1'], 'prof-1');`
- agregar, antes del `});` de cierre del `describe`:

```typescript
it('resuelve los nombres con el alias del profesor dueño de la rutina', async () => {
  instanceRepository.findVigentePorAlumno.mockResolvedValue(instancia);
  exerciseRepository.findByIds.mockResolvedValue([
    { ...ejercicioResuelto, nombre: 'Sentadilla del gym', nombreCatalogo: 'Sentadilla' },
  ]);

  const salida = await useCase.execute({ invocadoPor: alumno });

  expect(exerciseRepository.findByIds).toHaveBeenCalledWith(['ex-1'], 'prof-1');
  expect(salida?.dias[0].ejercicios[0]).toMatchObject({
    nombre: 'Sentadilla del gym',
    nombreCatalogo: 'Sentadilla',
  });
});

it('sin profesor dueño (borrado) resuelve con el nombre del catálogo', async () => {
  instanceRepository.findVigentePorAlumno.mockResolvedValue({ ...instancia, profesorId: null });
  exerciseRepository.findByIds.mockResolvedValue([ejercicioResuelto]);

  await useCase.execute({ invocadoPor: alumno });

  expect(exerciseRepository.findByIds).toHaveBeenCalledWith(['ex-1'], undefined);
});
```

En `apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.spec.ts`, agregar antes del `});` de cierre del `describe`:

```typescript
it('resuelve los nombres con el alias del profesor dueño de la rutina, no con el del invocador', async () => {
  userRepository.findById.mockResolvedValue(alumno);
  carteraRepository.existe.mockResolvedValue(true);
  instanceRepository.findVigentePorAlumno.mockResolvedValue({ ...instancia, profesorId: 'prof-2' });
  exerciseRepository.findByIds.mockResolvedValue([ejercicioResuelto]);

  await useCase.execute({ invocadoPor: profesor, alumnoId: 'alum-1' });

  expect(exerciseRepository.findByIds).toHaveBeenCalledWith(['ex-1'], 'prof-2');
});
```

Si algún test existente compara la salida completa de un ejercicio con `toEqual`, agregar `nombreCatalogo: null` al objeto esperado (es el cambio de forma esperado de la salida).

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `cd apps/api && pnpm test -- routines/application`
Expected: FAIL — `resolverDiasDeRutina` no acepta el tercer parámetro y no devuelve `nombreCatalogo`; los casos de uso no pasan el dueño.

- [ ] **Step 3: Implementar el resolver**

En `apps/api/src/routines/application/resolver-dias-de-rutina.ts`:

Reemplazar `RutinaVigenteEjercicioResuelto`:

```typescript
export interface RutinaVigenteEjercicioResuelto {
  exerciseId: string;
  nombre: string;
  /** Nombre del catálogo cuando `nombre` es un alias del profesor dueño; `null` si no hay alias. */
  nombreCatalogo: string | null;
  imageUrl: string | null;
  gifUrl: string | null;
  orden: number;
  series: number;
  repeticiones: number;
  peso: number | null;
  notas: string | null;
}
```

Reemplazar la función `resolverDiasDeRutina` completa por:

```typescript
/**
 * Resuelve nombre/media de todos los días con UN solo `findByIds`. El nombre
 * se resuelve con el alias del profesor dueño de la rutina
 * (`aliasDeProfesorId`); sin dueño (`null`/ausente), con el del catálogo.
 */
export async function resolverDiasDeRutina(
  exerciseRepository: ExerciseRepositoryPort,
  dias: ReadonlyArray<{ numero: number; ejercicios: EjercicioItem[] }>,
  aliasDeProfesorId?: string | null,
): Promise<RutinaVigenteDiaOutput[]> {
  const ids = [...new Set(dias.flatMap((d) => d.ejercicios.map((e) => e.exerciseId)))];
  const catalogados =
    ids.length > 0 ? await exerciseRepository.findByIds(ids, aliasDeProfesorId ?? undefined) : [];
  const porId = new Map(catalogados.map((e) => [e.id, e]));

  return dias.map((dia) => ({
    numero: dia.numero,
    ejercicios: dia.ejercicios.map((e) => {
      const catalogo = porId.get(e.exerciseId);
      return {
        exerciseId: e.exerciseId,
        nombre: catalogo?.nombre ?? '(ejercicio no encontrado)',
        nombreCatalogo: catalogo?.nombreCatalogo ?? null,
        imageUrl: catalogo?.imageUrl ?? null,
        gifUrl: catalogo?.gifUrl ?? null,
        orden: e.orden,
        series: e.series,
        repeticiones: e.repeticiones,
        peso: e.peso,
        notas: e.notas,
      };
    }),
  }));
}
```

En `apps/api/src/routines/application/get-mi-rutina-vigente.use-case.ts`, reemplazar:

```typescript
      dias: await resolverDiasDeRutina(this.exerciseRepository, instancia.dias),
```

por:

```typescript
      dias: await resolverDiasDeRutina(
        this.exerciseRepository,
        instancia.dias,
        instancia.profesorId,
      ),
```

En `apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.ts`, reemplazar:

```typescript
const diasResueltos = await resolverDiasDeRutina(this.exerciseRepository, instancia.dias);
```

por:

```typescript
const diasResueltos = await resolverDiasDeRutina(
  this.exerciseRepository,
  instancia.dias,
  instancia.profesorId,
);
```

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `cd apps/api && pnpm test`
Expected: PASS — toda la suite de `apps/api` en verde, sin suites nuevas fallando.

- [ ] **Step 5: Chequear tipos**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routines/application
git commit -m "feat(routines): mostrar los ejercicios con el alias del profesor dueño de la rutina"
```

---

### Task 6: Tipos y datos del frontend, y actualización de líneas del editor

**Files:**

- Modify: `apps/web/components/exercise-card.tsx` (interfaz `ExerciseCardData`)
- Modify: `apps/web/lib/routine-types.ts` (interfaz `EjercicioEnEdicion`)
- Modify: `apps/web/lib/routine-days.ts`
- Modify: `apps/web/lib/routine-days.spec.ts`
- Modify: `apps/web/app/(profesor)/profesor/plantillas/[id]/page.tsx` (interfaz local `ExerciseSummary`)
- Modify: `apps/web/components/import-template-day-dialog.tsx` (interfaz local `ExerciseSummary`)

**Interfaces:**

- Consumes: el campo `nombreCatalogo` que ahora devuelven `GET /exercises*` y la rutina vigente (Tasks 4 y 5).
- Produces (lo consume la Task 7):
  - `ExerciseCardData.nombreCatalogo?: string | null`.
  - `EjercicioEnEdicion.nombreCatalogo?: string | null`.
  - `aplicarNombreAEjercicio(dias: DiaEnEdicion[], exerciseId: string, nombre: string, nombreCatalogo: string | null): DiaEnEdicion[]`, exportada desde `apps/web/lib/routine-days.ts`.
  - `ejercicioApiADatos` y `diasDeRutinaAEdicion` propagan `nombreCatalogo` (`null` si no viene).

- [ ] **Step 1: Escribir los tests que fallan**

En `apps/web/lib/routine-days.spec.ts`, agregar `aplicarNombreAEjercicio` al import de `./routine-days` (queda ordenado alfabéticamente: antes de `claveDeVersion`):

```typescript
import {
  MAX_DIAS,
  aPayloadDeDias,
  aPlantillaParaImportar,
  agregarDia,
  aplicarNombreAEjercicio,
  claveDeVersion,
  ...
```

y agregar al final del archivo:

```typescript
describe('aplicarNombreAEjercicio', () => {
  it('actualiza nombre y nombreCatalogo en todas las líneas de ese ejercicio, en todos los días', () => {
    const dias = [dia('d1', [ej('ex-1', 'u1'), ej('ex-2', 'u2')]), dia('d2', [ej('ex-1', 'u3')])];

    const resultado = aplicarNombreAEjercicio(dias, 'ex-1', 'Banca plana', 'Barra press de banca');

    expect(
      resultado.flatMap((d) => d.ejercicios.map((e) => [e.uid, e.nombre, e.nombreCatalogo])),
    ).toEqual([
      ['u1', 'Banca plana', 'Barra press de banca'],
      ['u2', 'ex-2', undefined],
      ['u3', 'Banca plana', 'Barra press de banca'],
    ]);
  });

  it('no muta los días originales', () => {
    const dias = [dia('d1', [ej('ex-1')])];

    aplicarNombreAEjercicio(dias, 'ex-1', 'Banca plana', 'Barra press de banca');

    expect(dias[0].ejercicios[0].nombre).toBe('ex-1');
  });

  it('volver al nombre original deja nombreCatalogo en null', () => {
    const dias = [dia('d1', [{ ...ej('ex-1'), nombre: 'Banca plana', nombreCatalogo: 'Barra' }])];

    const resultado = aplicarNombreAEjercicio(dias, 'ex-1', 'Barra press de banca', null);

    expect(resultado[0].ejercicios[0]).toMatchObject({
      nombre: 'Barra press de banca',
      nombreCatalogo: null,
    });
  });
});

describe('nombreCatalogo en la conversión desde la API', () => {
  it('diasDePlantillaAEdicion lo toma del detalle del ejercicio', () => {
    const dias = diasDePlantillaAEdicion(
      [
        {
          id: 't1',
          numero: 1,
          ejercicios: [
            { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, peso: null, notas: null },
            { exerciseId: 'ex-2', orden: 2, series: 3, repeticiones: 10, peso: null, notas: null },
          ],
        },
      ],
      new Map<string, { nombre: string; imageUrl: string | null; nombreCatalogo?: string | null }>([
        ['ex-1', { nombre: 'Banca plana', imageUrl: null, nombreCatalogo: 'Barra press de banca' }],
        ['ex-2', { nombre: 'Sentadilla', imageUrl: null }],
      ]),
    );

    expect(dias[0].ejercicios.map((e) => [e.nombre, e.nombreCatalogo])).toEqual([
      ['Banca plana', 'Barra press de banca'],
      ['Sentadilla', null],
    ]);
  });

  it('diasDeRutinaAEdicion lo toma de la rutina resuelta por la API', () => {
    const dias = diasDeRutinaAEdicion([
      {
        id: 'i1',
        numero: 1,
        vinculado: null,
        ejercicios: [
          {
            exerciseId: 'ex-1',
            orden: 1,
            series: 3,
            repeticiones: 10,
            peso: null,
            notas: null,
            nombre: 'Banca plana',
            imageUrl: null,
            nombreCatalogo: 'Barra press de banca',
          },
        ],
      },
    ]);

    expect(dias[0].ejercicios[0]).toMatchObject({
      nombre: 'Banca plana',
      nombreCatalogo: 'Barra press de banca',
    });
  });
});
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `cd apps/web && npx jest routine-days`
Expected: FAIL — `aplicarNombreAEjercicio` no está exportada y `nombreCatalogo` no existe en los tipos.

- [ ] **Step 3: Agregar el campo a los tipos**

En `apps/web/components/exercise-card.tsx`, reemplazar la interfaz `ExerciseCardData`:

```typescript
export interface ExerciseCardData {
  id: string;
  nombre: string;
  /** Nombre del catálogo cuando `nombre` es un alias del profesor; null/ausente si no hay alias. */
  nombreCatalogo?: string | null;
  nombreOriginal: string | null;
  imageUrl: string | null;
  parteCuerpo: string;
  equipamiento: string | null;
}
```

En `apps/web/lib/routine-types.ts`, reemplazar la interfaz `EjercicioEnEdicion`:

```typescript
export interface EjercicioEnEdicion {
  uid: string;
  exerciseId: string;
  nombre: string;
  /** Nombre del catálogo cuando `nombre` es un alias del profesor; null/ausente si no hay alias. */
  nombreCatalogo?: string | null;
  imageUrl: string | null;
  series: number;
  repeticiones: number;
  peso: number | null;
  notas: string | null;
}
```

En `apps/web/app/(profesor)/profesor/plantillas/[id]/page.tsx` y en `apps/web/components/import-template-day-dialog.tsx`, reemplazar la interfaz local `ExerciseSummary` (idéntica en ambos archivos):

```typescript
interface ExerciseSummary {
  id: string;
  nombre: string;
  imageUrl: string | null;
}
```

por:

```typescript
interface ExerciseSummary {
  id: string;
  nombre: string;
  nombreCatalogo?: string | null;
  imageUrl: string | null;
}
```

- [ ] **Step 4: Propagar el campo y agregar la función pura**

En `apps/web/lib/routine-days.ts`, reemplazar la definición de `DetalleEjercicio` y la función `ejercicioApiADatos`:

```typescript
type DetalleEjercicio = {
  nombre: string;
  imageUrl: string | null;
  nombreCatalogo?: string | null;
};

function ejercicioApiADatos(
  e: EjercicioApi,
  detalle: DetalleEjercicio | undefined,
): Omit<EjercicioEnEdicion, 'uid'> {
  return {
    exerciseId: e.exerciseId,
    nombre: detalle?.nombre ?? '(ejercicio no encontrado)',
    nombreCatalogo: detalle?.nombreCatalogo ?? null,
    imageUrl: detalle?.imageUrl ?? null,
    series: e.series,
    repeticiones: e.repeticiones,
    peso: e.peso,
    notas: e.notas,
  };
}
```

y agregar, después de la función `totalEjercicios`:

```typescript
/**
 * Un alias vale para todo el perfil del profesor: al renombrar (o volver al
 * nombre original) se actualizan TODAS las líneas del editor con ese
 * ejercicio, en todos los días. `nombreCatalogo` es `null` al volver al original.
 */
export function aplicarNombreAEjercicio(
  dias: DiaEnEdicion[],
  exerciseId: string,
  nombre: string,
  nombreCatalogo: string | null,
): DiaEnEdicion[] {
  return dias.map((d) => ({
    ...d,
    ejercicios: d.ejercicios.map((e) =>
      e.exerciseId === exerciseId ? { ...e, nombre, nombreCatalogo } : e,
    ),
  }));
}
```

- [ ] **Step 5: Correr los tests y chequear tipos**

Run: `cd apps/web && npx jest && npx tsc --noEmit`
Expected: PASS — los tests existentes más los 5 nuevos; `tsc` sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/exercise-card.tsx \
        apps/web/lib/routine-types.ts \
        apps/web/lib/routine-days.ts \
        apps/web/lib/routine-days.spec.ts \
        "apps/web/app/(profesor)/profesor/plantillas/[id]/page.tsx" \
        apps/web/components/import-template-day-dialog.tsx
git commit -m "feat(web): propagar el nombre del catalogo y actualizar lineas al renombrar"
```

---

### Task 7: Diálogo "Renombrar" en el editor

**Files:**

- Create: `apps/web/components/rename-exercise-dialog.tsx`
- Modify: `apps/web/components/day-exercises-list.tsx`
- Modify: `apps/web/components/routine-days-editor.tsx`

**Interfaces:**

- Consumes: `browserApiFetch` y `BrowserApiError` de `apps/web/lib/browser-api-client.ts`; los endpoints `PUT`/`DELETE /exercises/:id/alias` (Task 4), que devuelven el ejercicio resuelto con `nombre` y `nombreCatalogo`; `aplicarNombreAEjercicio` y `EjercicioEnEdicion.nombreCatalogo` (Task 6); componentes shadcn existentes (`Dialog`, `Field`, `Input`, `Alert`, `Spinner`, `Button`, `DropdownMenu*`).
- Produces: `RenameExerciseDialog` (props `{ ejercicio, onCerrar, onRenombrado }`). `DayExercisesList` gana la prop obligatoria `onRenombrado: (exerciseId: string, nombre: string, nombreCatalogo: string | null) => void`. Es la última capa: ninguna task posterior depende de esto.

- [ ] **Step 1: Crear el diálogo**

Crear `apps/web/components/rename-exercise-dialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { browserApiFetch, BrowserApiError } from '../lib/browser-api-client';

const MAX_ALIAS = 80;

export interface EjercicioRenombrable {
  exerciseId: string;
  nombre: string;
  /** Presente solo si `nombre` ya es un alias; es el nombre del catálogo. */
  nombreCatalogo?: string | null;
}

interface EjercicioResuelto {
  nombre: string;
  nombreCatalogo?: string | null;
}

/**
 * El alias vale para todo el perfil del profesor y se guarda al instante
 * (no depende del guardado de la rutina). El padre remonta este componente
 * por ejercicio (`key`), así que el estado inicial siempre es el actual.
 */
export function RenameExerciseDialog({
  ejercicio,
  onCerrar,
  onRenombrado,
}: {
  ejercicio: EjercicioRenombrable;
  onCerrar: () => void;
  onRenombrado: (exerciseId: string, nombre: string, nombreCatalogo: string | null) => void;
}) {
  const [valor, setValor] = useState(ejercicio.nombre);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tieneAlias = Boolean(ejercicio.nombreCatalogo);
  const nombreCatalogo = ejercicio.nombreCatalogo ?? ejercicio.nombre;
  const recortado = valor.trim();
  const invalido = recortado.length === 0 || recortado.length > MAX_ALIAS;
  const rutaAlias = `exercises/${ejercicio.exerciseId}/alias`;

  async function ejecutar(accion: () => Promise<EjercicioResuelto>) {
    setGuardando(true);
    setError(null);
    try {
      const resuelto = await accion();
      onRenombrado(ejercicio.exerciseId, resuelto.nombre, resuelto.nombreCatalogo ?? null);
    } catch (err) {
      setError(err instanceof BrowserApiError ? err.message : 'No se pudo guardar el nombre.');
      setGuardando(false);
    }
  }

  const guardar = () =>
    ejecutar(() =>
      browserApiFetch<EjercicioResuelto>(rutaAlias, {
        method: 'PUT',
        body: JSON.stringify({ nombre: recortado }),
      }),
    );

  const volverAlOriginal = () =>
    ejecutar(() => browserApiFetch<EjercicioResuelto>(rutaAlias, { method: 'DELETE' }));

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto && !guardando) onCerrar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renombrar ejercicio</DialogTitle>
          <DialogDescription>
            Nombre del catálogo: {nombreCatalogo}. El nombre nuevo lo ven tus alumnos y vale en
            todas tus plantillas y rutinas.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="nombre-alias-ejercicio">Nombre</FieldLabel>
          <Input
            id="nombre-alias-ejercicio"
            value={valor}
            maxLength={MAX_ALIAS}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !invalido && !guardando) guardar();
            }}
          />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          {tieneAlias && (
            <Button type="button" variant="ghost" disabled={guardando} onClick={volverAlOriginal}>
              Volver al nombre original
            </Button>
          )}
          <Button type="button" variant="outline" disabled={guardando} onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="button" variant="brand" disabled={invalido || guardando} onClick={guardar}>
            {guardando && <Spinner data-icon="inline-start" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Chequear que el diálogo compila**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores (el componente todavía no se usa; `tsc` valida sus imports y tipos).

- [ ] **Step 3: Agregar "Renombrar" al menú de la línea y montar el diálogo**

En `apps/web/components/day-exercises-list.tsx`:

(a) Reemplazar el import de íconos:

```tsx
import { GripVertical, ListPlus, MoreVertical, X } from 'lucide-react';
```

por:

```tsx
import { GripVertical, ListPlus, MoreVertical, Pencil, X } from 'lucide-react';
```

(b) En el bloque de imports de `@/components/ui/dropdown-menu`, agregar `DropdownMenuSeparator`:

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
```

(c) Después de `import { ExerciseCardData } from './exercise-card';` agregar:

```tsx
import { RenameExerciseDialog } from './rename-exercise-dialog';
```

Además, el archivo todavía no importa nada de `react`: agregar `import { useState } from 'react';` como primera línea de imports, justo debajo de `'use client';` y antes del bloque `import { DndContext, ... } from '@dnd-kit/core';`.

(d) En `FilaEjercicio`, agregar la prop `onRenombrar`. Reemplazar la firma:

```tsx
function FilaEjercicio({
  ejercicio,
  destinos,
  onCambiar,
  onQuitar,
  onMover,
}: {
  ejercicio: EjercicioEnEdicion;
  destinos: DestinoParaMover[];
  onCambiar: (campo: CampoEditable, valor: string) => void;
  onQuitar: () => void;
  onMover: (diaUid: string) => void;
}) {
```

por:

```tsx
function FilaEjercicio({
  ejercicio,
  destinos,
  onCambiar,
  onQuitar,
  onMover,
  onRenombrar,
}: {
  ejercicio: EjercicioEnEdicion;
  destinos: DestinoParaMover[];
  onCambiar: (campo: CampoEditable, valor: string) => void;
  onQuitar: () => void;
  onMover: (diaUid: string) => void;
  onRenombrar: () => void;
}) {
```

(e) Reemplazar todo el bloque del menú (desde `{destinos.length > 0 && (` hasta su `)}` de cierre, justo antes del botón con `<X size={18} aria-hidden />`):

```tsx
{
  destinos.length > 0 && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground"
          aria-label={`Más opciones de ${ejercicio.nombre}`}
        >
          <MoreVertical size={18} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Mover a</DropdownMenuLabel>
        {destinos.map((destino) => (
          <DropdownMenuItem
            key={destino.uid}
            disabled={destino.exerciseIds.has(ejercicio.exerciseId)}
            onSelect={() => onMover(destino.uid)}
          >
            Día {destino.numero}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

por:

```tsx
{
  /* modal={false}: el diálogo de renombrar se abre al elegir un ítem; con el menú modal, Radix puede dejar la página sin responder al cerrarlo. */
}
<DropdownMenu modal={false}>
  <DropdownMenuTrigger asChild>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="shrink-0 text-muted-foreground"
      aria-label={`Más opciones de ${ejercicio.nombre}`}
    >
      <MoreVertical size={18} aria-hidden />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onSelect={onRenombrar}>
      <Pencil size={16} aria-hidden />
      Renombrar
    </DropdownMenuItem>
    {destinos.length > 0 && (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Mover a</DropdownMenuLabel>
        {destinos.map((destino) => (
          <DropdownMenuItem
            key={destino.uid}
            disabled={destino.exerciseIds.has(ejercicio.exerciseId)}
            onSelect={() => onMover(destino.uid)}
          >
            Día {destino.numero}
          </DropdownMenuItem>
        ))}
      </>
    )}
  </DropdownMenuContent>
</DropdownMenu>;
```

(f) En `DayExercisesList`, reemplazar la firma y agregar el estado del diálogo:

```tsx
export function DayExercisesList({
  ejercicios,
  onChange,
  destinosParaMover,
  onMoverADia,
}: {
  ejercicios: EjercicioEnEdicion[];
  onChange: (ejercicios: EjercicioEnEdicion[]) => void;
  destinosParaMover: DestinoParaMover[];
  onMoverADia: (ejercicioUid: string, diaUid: string) => void;
}) {
  const sensors = useSensors(
```

por:

```tsx
export function DayExercisesList({
  ejercicios,
  onChange,
  destinosParaMover,
  onMoverADia,
  onRenombrado,
}: {
  ejercicios: EjercicioEnEdicion[];
  onChange: (ejercicios: EjercicioEnEdicion[]) => void;
  destinosParaMover: DestinoParaMover[];
  onMoverADia: (ejercicioUid: string, diaUid: string) => void;
  /** El alias vale para todo el perfil: el padre actualiza todas las líneas con ese ejercicio, en todos los días. */
  onRenombrado: (exerciseId: string, nombre: string, nombreCatalogo: string | null) => void;
}) {
  const [renombrando, setRenombrando] = useState<EjercicioEnEdicion | null>(null);
  const sensors = useSensors(
```

(g) En la función `agregar` de `DayExercisesList`, agregar `nombreCatalogo` al ejercicio nuevo. Reemplazar:

```tsx
        nombre: ejercicio.nombre,
        imageUrl: ejercicio.imageUrl,
        series: 3,
```

por:

```tsx
        nombre: ejercicio.nombre,
        nombreCatalogo: ejercicio.nombreCatalogo ?? null,
        imageUrl: ejercicio.imageUrl,
        series: 3,
```

(h) Pasar `onRenombrar` a cada fila. Reemplazar:

```tsx
                  onMover={(diaUid) => onMoverADia(ejercicio.uid, diaUid)}
                />
```

por:

```tsx
                  onMover={(diaUid) => onMoverADia(ejercicio.uid, diaUid)}
                  onRenombrar={() => setRenombrando(ejercicio)}
                />
```

(i) Montar el diálogo al final del JSX de `DayExercisesList`. Reemplazar el cierre:

```tsx
        </DndContext>
      )}
    </div>
  );
}
```

por:

```tsx
        </DndContext>
      )}

      {renombrando && (
        <RenameExerciseDialog
          key={renombrando.uid}
          ejercicio={renombrando}
          onCerrar={() => setRenombrando(null)}
          onRenombrado={(exerciseId, nombre, nombreCatalogo) => {
            onRenombrado(exerciseId, nombre, nombreCatalogo);
            setRenombrando(null);
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Conectar el editor padre**

En `apps/web/components/routine-days-editor.tsx`, agregar `aplicarNombreAEjercicio` al import desde `'../lib/routine-days'` (junto a `actualizarEjerciciosDeDia`, `agregarDia`, etc., en orden alfabético: después de `agregarDia`):

```tsx
  agregarDia,
  aplicarNombreAEjercicio,
  crearDiaVacio,
```

y reemplazar el uso de `DayExercisesList`:

```tsx
<DayExercisesList
  ejercicios={activo.ejercicios}
  onChange={(ejercicios) => setDias(actualizarEjerciciosDeDia(dias, activo.uid, ejercicios))}
  destinosParaMover={destinosParaMover}
  onMoverADia={(ejercicioUid, diaUid) =>
    setDias(moverEjercicioADia(dias, activo.uid, ejercicioUid, diaUid))
  }
/>
```

por:

```tsx
<DayExercisesList
  ejercicios={activo.ejercicios}
  onChange={(ejercicios) => setDias(actualizarEjerciciosDeDia(dias, activo.uid, ejercicios))}
  destinosParaMover={destinosParaMover}
  onMoverADia={(ejercicioUid, diaUid) =>
    setDias(moverEjercicioADia(dias, activo.uid, ejercicioUid, diaUid))
  }
  onRenombrado={(exerciseId, nombre, nombreCatalogo) =>
    setDias(aplicarNombreAEjercicio(dias, exerciseId, nombre, nombreCatalogo))
  }
/>
```

- [ ] **Step 5: Tests, tipos y lint**

Run: `cd apps/web && npx jest && npx tsc --noEmit`
Expected: PASS — todos los tests del web en verde y `tsc` sin errores.

- [ ] **Step 6: Verificación manual**

Run: `cd apps/api && pnpm start:dev` y, en otra terminal, `cd apps/web && pnpm dev` (el API tiene que incluir las Tasks 1-5 y la base tiene que tener aplicada la migración de la Task 1; ojo: el `.env` local apunta a la base real de Supabase).

Entrar como un PROFESOR a `http://localhost:3000/login` y comprobar:

- En el editor de una plantilla o de la rutina de un alumno, cada línea tiene el menú ⋮ (también cuando el día es único) con "Renombrar".
- "Renombrar" abre el diálogo con el nombre actual y "Nombre del catálogo: …". Cambiarlo a "Banca plana" y guardar: la línea muestra "Banca plana" al instante y también cualquier otra línea con el mismo ejercicio en otro día.
- Recargar la página: el nombre sigue siendo "Banca plana" (se guardó sin tocar "Guardar" de la rutina).
- Abrir de nuevo el diálogo: aparece "Volver al nombre original"; usarlo restituye el nombre del catálogo.
- En el buscador de ejercicios, escribir "banca plana" encuentra el ejercicio y los resultados muestran el alias; en `/catalogo` (como profesor) el ejercicio aparece con el alias.
- Entrar como el ALUMNO de ese profesor: en su rutina ve "Banca plana"; en `/catalogo` ve el nombre original del catálogo.
- Tras cerrar el diálogo, la página sigue respondiendo a clics (si quedara bloqueada, el `modal={false}` del menú no se aplicó).
- En celular (ventana angosta) la fila no se desborda y el menú ⋮ se ve.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/rename-exercise-dialog.tsx \
        apps/web/components/day-exercises-list.tsx \
        apps/web/components/routine-days-editor.tsx
git commit -m "feat(web): renombrar ejercicios desde el menu de cada linea del editor"
```

---

## Rollout (fuera de las tasks — lo hace el usuario con ayuda del asistente)

1. **Backup de Supabase** (precaución; la migración es aditiva y no necesita backfill).
2. **Aplicar la migración** `20261018120000_exercise_alias` a la base de producción (`pnpm prisma migrate deploy` desde `apps/api`, con el `.env` de producción). Solo crea una tabla nueva.
3. **Manual Deploy del API en Render.**
4. **Push del frontend** (Vercel deploya solo).

Cada paso es compatible con el anterior: si el frontend saliera antes que el API, solo "Renombrar" fallaría hasta el deploy. Después, comprobar en producción: renombrar un ejercicio como profesor y ver el alias en la rutina del alumno.
