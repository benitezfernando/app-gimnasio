# Rutina dividida en días — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que plantillas y rutinas de alumno se dividan en días numerados (Día 1…Día 7), con vínculo a plantilla por día, combinación de días de distintas plantillas, y un selector de día para el alumno.

**Architecture:** Dos tablas nuevas (`RoutineTemplateDay`, `RoutineInstanceDay`) entre plantilla/instancia y sus ejercicios; el vínculo vive en el día de instancia (`vinculadoADiaId` → `RoutineTemplateDay.id`, `onDelete: SetNull`). Las reglas (límites, vínculo, merge de propagación) son funciones puras en `routines/application/dias/`; los repositorios persisten días por `id` (upsert + renumeración en dos pasadas) y la propagación de una plantilla a sus alumnos vinculados corre en la misma transacción. En el frontend, un `RoutineDaysEditor` compartido reemplaza al editor de lista plana en las tres pantallas del profesor, y la vista del alumno suma un selector de días que recuerda el último elegido en `localStorage`.

**Tech Stack:** NestJS 10 + Prisma 5 + PostgreSQL (Supabase), Jest/ts-jest, PGlite 0.5.8 (Postgres en WASM, solo tests), Next.js 15 App Router + React 19, shadcn/ui (`radix-maia`) + Tailwind v4, dnd-kit.

**Spec:** `docs/superpowers/specs/2026-09-24-rutina-por-dias-design.md` (decisiones 1–13 numeradas ahí).

## Global Constraints

- Límites: `MAX_DIAS = 7`, `MAX_EJERCICIOS_TOTALES = 50` (suma de todos los días). Todo día guardado tiene ≥ 1 ejercicio. Sin `exerciseId` repetido **dentro** de un día; entre días distintos sí se permite.
- Los días viajan como array ordenado: la posición define `numero` (1-based). El cliente nunca manda `numero`.
- Regla de vínculo (servidor, siempre): un día queda con `vinculadoADiaId = X` sii el request pide `X` **y** el conjunto de `exerciseId` del día es igual al del día de plantilla `X` **y**, si `X` es un vínculo nuevo para ese día, el día de plantilla pertenece a una plantilla del profesor que invoca (mismo gym) — si no, `404`. En cualquier otro caso, `null`.
- Recurso ajeno o inexistente → `404`, nunca `403` (HLD §Autorización). La única excepción ya existente es `AlumnoNotInCarteraError` (403).
- Toda tabla nueva lleva `ENABLE ROW LEVEL SECURITY` en su migración (deny-all para PostgREST, ver migración `20260907210000_enable_rls_deny_all`).
- **Nunca** correr `prisma migrate dev`, `prisma migrate deploy` ni `prisma db push` contra ninguna base real. La migración se escribe a mano. Se verifica con `pnpm --filter api db:verificar-migraciones` y con specs `*.int.spec.ts` contra PGlite. Aplicarla a Supabase es un paso manual del usuario al final (ver §Deploy).
- Sin código de compatibilidad: los endpoints `PUT …/exercises`, `origenTemplateId`/`vincular` en `POST /routine-instances` y la respuesta plana `ejercicios` de `rutina-vigente` se eliminan.
- UI: tema oscuro único, sin colores nuevos; el acento de marca es `variant="brand"` de `Button` / utilidades `bg-gradient-brand`. Mobile-first: nunca sobreescribir alturas de `Button`/`Input`/`NativeSelect` (ya cumplen 44px en mobile). Textos en español rioplatense (vos).
- Identificadores de dominio en español, siguiendo el código existente.
- Comandos: tests API `pnpm --filter api test -- <patrón>`; build API `pnpm --filter api build`; tests web `pnpm --filter web test`; typecheck web `pnpm --filter web exec tsc --noEmit`; build web `pnpm --filter web build`; lint `pnpm lint`.
- **Secuencia backend:** después de la Tarea 3, `pnpm --filter api build` falla en los dos repositorios Prisma de `routines` hasta que la Tarea 4 los reescribe. Jest de la API debe quedar verde al final de **cada** tarea. Al final de la Tarea 6, build y Jest de la API completos en verde.
- **Secuencia web:** entre las Tareas 7 y 9, `pnpm --filter web exec tsc --noEmit` y `pnpm --filter web build` fallan **solo** por archivos de `app/(profesor)/profesor/alumnos/[id]/` (usan la forma vieja de `EjercicioEnEdicion` y el editor borrado); la Tarea 9 los reescribe. Jest web verde en cada tarea. Al final de la Tarea 9, typecheck y build web completos en verde.

---

## Mapa de archivos

**API — nuevos**

- `apps/api/src/test-support/base-de-prueba.ts` — PGlite migrado + Prisma por socket.
- `apps/api/src/test-support/base-de-prueba.int.spec.ts` — smoke test del helper.
- `apps/api/src/test-support/semillas.ts` — filas mínimas (profesor, alumno, ejercicios) para specs de integración.
- `apps/api/src/test-support/repositorios-routines.mock.ts` — factories de mocks de los dos puertos de `routines`.
- `apps/api/prisma/verificar-migraciones.mjs` — drift check migraciones ↔ `schema.prisma`.
- `apps/api/prisma/migrations/20260924120000_rutina_por_dias/migration.sql`
- `apps/api/src/routines/application/dias/limites.ts`, `validar-dias.ts`, `resolver-vinculo-de-dia.ts`, `merge-dia-vinculado.ts`, `resolver-vinculos-pedidos.ts` (+ specs)
- `apps/api/src/routines/application/validar-exercise-ids.ts`
- `apps/api/src/routines/application/resolver-dias-de-rutina.ts`
- `apps/api/src/routines/application/errors/too-many-days.error.ts`, `empty-day.error.ts`, `duplicate-exercise-in-day.error.ts`, `routine-day-not-found.error.ts`
- `apps/api/src/routines/application/replace-template-days.use-case.ts` (+ spec)
- `apps/api/src/routines/application/replace-instance-days.use-case.ts` (+ spec)
- `apps/api/src/routines/infrastructure/persistence/fila-ejercicio.ts`
- `apps/api/src/routines/infrastructure/persistence/*.int.spec.ts` (migración + 2 repositorios)
- `apps/api/src/routines/infrastructure/http/dto/dia.dto.ts`, `dia.mapper.ts`, `replace-template-days.dto.ts`, `replace-instance-days.dto.ts`

**API — se eliminan**

- `replace-template-exercises.use-case.ts`, `replace-instance-exercises.use-case.ts`, `merge-ejercicios-vinculados.ts` (+ sus specs), `errors/template-has-no-exercises.error.ts`, `dto/replace-exercises.dto.ts`.

**Web — nuevos**

- `apps/web/lib/routine-days.ts` (+ `routine-days.spec.ts`) — lógica pura del editor de días y del selector del alumno.
- `apps/web/components/day-exercises-list.tsx` — reemplaza a `routine-exercises-editor.tsx` (lista de UN día, controlada).
- `apps/web/components/routine-days-editor.tsx`, `import-template-day-dialog.tsx`
- `apps/web/components/ui/dialog.tsx`, `dropdown-menu.tsx` (generados por shadcn CLI)
- `apps/web/app/(profesor)/profesor/alumnos/[id]/new-routine-form.tsx`
- `apps/web/app/(alumno)/alumno/lista-ejercicios-del-dia.tsx`, `selector-de-dias.tsx`

**Web — se eliminan**

- `apps/web/components/routine-exercises-editor.tsx`, `apps/web/app/(profesor)/profesor/alumnos/[id]/assign-template-form.tsx`.

---

### Task 1: Infraestructura de tests contra Postgres real (PGlite)

**Files:**

- Modify: `apps/api/package.json` (devDependencies + scripts `test` y `db:verificar-migraciones`)
- Modify: `apps/api/tsconfig.build.json` (excluir `src/test-support`)
- Create: `apps/api/src/test-support/base-de-prueba.ts`
- Create: `apps/api/src/test-support/base-de-prueba.int.spec.ts`
- Create: `apps/api/prisma/verificar-migraciones.mjs`

**Interfaces:**

- Produces: `crearPGliteMigrado(opciones?: { excluir?: string[] }): Promise<PGlite>`, `aplicarMigracion(db: PGlite, nombre: string): Promise<void>`, `listarMigraciones(): string[]`, `conectarPrisma(db: PGlite): Promise<ConexionPrisma>` con `ConexionPrisma = { prisma: PrismaClient; cerrar(): Promise<void> }`. Script `pnpm --filter api db:verificar-migraciones` (exit 0 = sin drift).

Contexto verificado antes de escribir este plan (spike): PGlite aplica las 12 migraciones existentes si antes existe una tabla `_prisma_migrations` (la migración de RLS la referencia); el Prisma Client real del proyecto se conecta por `@electric-sql/pglite-socket` con `connection_limit=1`, incluidas transacciones interactivas; `prisma migrate diff --from-url <pglite> --to-schema-datamodel` devuelve "No difference detected" sobre el estado actual. Dentro de Jest, PGlite necesita `node --experimental-vm-modules` (hace un `import()` dinámico).

- [ ] **Step 1: Instalar dependencias**

```bash
pnpm --filter api add -D @electric-sql/pglite@0.5.8 @electric-sql/pglite-socket@0.2.11
```

- [ ] **Step 2: Scripts y exclusión del build**

En `apps/api/package.json`, reemplazar `"test": "jest"` y agregar el script de verificación:

```json
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js",
    "db:verificar-migraciones": "node prisma/verificar-migraciones.mjs",
```

`apps/api/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "**/*spec.ts", "prisma", "src/test-support"]
}
```

- [ ] **Step 3: Confirmar que la suite existente sigue verde con el flag**

Run: `pnpm --filter api test`
Expected: PASS, misma cantidad de suites/tests que antes (puede aparecer un `ExperimentalWarning: VM Modules` — es esperado).
**Si alguna suite existente falla solo por el flag:** volver `"test"` a `"jest --testPathIgnorePatterns=\\.int\\.spec\\.ts$"`, agregar `"test:int": "node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=\\.int\\.spec\\.ts$"`, y en todas las tareas siguientes correr los `*.int.spec.ts` con `pnpm --filter api test:int -- <patrón>`. Reportarlo como DONE_WITH_CONCERNS.

- [ ] **Step 4: Escribir el helper**

`apps/api/src/test-support/base-de-prueba.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient } from '@prisma/client';

const DIR_MIGRACIONES = join(__dirname, '..', '..', 'prisma', 'migrations');

export function listarMigraciones(): string[] {
  return readdirSync(DIR_MIGRACIONES)
    .filter((nombre) => /^\d/.test(nombre))
    .sort();
}

export async function aplicarMigracion(db: PGlite, nombre: string): Promise<void> {
  await db.exec(readFileSync(join(DIR_MIGRACIONES, nombre, 'migration.sql'), 'utf8'));
}

/**
 * Postgres real en memoria con las migraciones del repo aplicadas en
 * orden. `_prisma_migrations` se crea vacía porque la migración de RLS la
 * referencia y en Supabase la crea Prisma, no una migración.
 */
export async function crearPGliteMigrado(opciones: { excluir?: string[] } = {}): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec('CREATE TABLE "_prisma_migrations" (id text PRIMARY KEY);');
  const excluir = new Set(opciones.excluir ?? []);
  for (const nombre of listarMigraciones()) {
    if (!excluir.has(nombre)) {
      await aplicarMigracion(db, nombre);
    }
  }
  return db;
}

function puertoLibre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const servidor = createServer();
    servidor.once('error', reject);
    servidor.listen(0, '127.0.0.1', () => {
      const direccion = servidor.address();
      const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;
      servidor.close(() => resolve(puerto));
    });
  });
}

export interface ConexionPrisma {
  prisma: PrismaClient;
  cerrar(): Promise<void>;
}

/** PGlite atiende una sola conexión: `connection_limit=1` es obligatorio. */
export async function conectarPrisma(db: PGlite): Promise<ConexionPrisma> {
  const port = await puertoLibre();
  const servidor = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
  await servidor.start();
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?connection_limit=1&sslmode=disable`,
      },
    },
  });
  return {
    prisma,
    async cerrar() {
      await prisma.$disconnect();
      await servidor.stop();
      await db.close();
    },
  };
}
```

- [ ] **Step 5: Smoke test del helper**

`apps/api/src/test-support/base-de-prueba.int.spec.ts`:

```ts
import { ConexionPrisma, conectarPrisma, crearPGliteMigrado } from './base-de-prueba';

jest.setTimeout(60_000);

describe('base de prueba PGlite', () => {
  let conexion: ConexionPrisma;

  beforeAll(async () => {
    conexion = await conectarPrisma(await crearPGliteMigrado());
  });

  afterAll(async () => {
    await conexion.cerrar();
  });

  it('aplica todas las migraciones y Prisma consulta dentro de una transacción interactiva', async () => {
    const cantidad = await conexion.prisma.$transaction(async (tx) => tx.routineTemplate.count());
    expect(cantidad).toBe(0);
  });
});
```

Run: `pnpm --filter api test -- base-de-prueba`
Expected: PASS (1 test).

- [ ] **Step 6: Script de drift**

`apps/api/prisma/verificar-migraciones.mjs`:

```js
// Aplica prisma/migrations (SQL escrito a mano) sobre un Postgres en
// memoria y compara el resultado contra schema.prisma. Exit 0 = sin
// diferencias. Nunca toca Supabase.
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dirMigraciones = join(raiz, 'prisma', 'migrations');

const puerto = await new Promise((resolve, reject) => {
  const s = createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});

const db = await PGlite.create();
await db.exec('CREATE TABLE "_prisma_migrations" (id text PRIMARY KEY);');
for (const nombre of readdirSync(dirMigraciones)
  .filter((d) => /^\d/.test(d))
  .sort()) {
  await db.exec(readFileSync(join(dirMigraciones, nombre, 'migration.sql'), 'utf8'));
}

const servidor = new PGLiteSocketServer({ db, port: puerto, host: '127.0.0.1' });
await servidor.start();

const url = `postgresql://postgres:postgres@127.0.0.1:${puerto}/postgres?connection_limit=1&sslmode=disable`;
// spawn asíncrono (no spawnSync): el servidor PGlite corre en este mismo
// event loop y tiene que poder atender a Prisma mientras el hijo corre.
const codigo = await new Promise((resolve) => {
  const hijo = spawn(
    'npx',
    [
      'prisma',
      'migrate',
      'diff',
      '--from-url',
      url,
      '--to-schema-datamodel',
      'prisma/schema.prisma',
      '--exit-code',
    ],
    { cwd: raiz, stdio: 'inherit' },
  );
  hijo.on('close', (c) => resolve(c ?? 1));
});

await servidor.stop();
await db.close();
process.exit(codigo);
```

Run: `pnpm --filter api db:verificar-migraciones`
Expected: imprime `No difference detected.` y exit 0.

- [ ] **Step 7: Build y commit**

Run: `pnpm --filter api build` → Expected: OK (el helper queda fuera de `dist`).

```bash
git add apps/api/package.json apps/api/tsconfig.build.json apps/api/src/test-support apps/api/prisma/verificar-migraciones.mjs pnpm-lock.yaml
git commit -m "test(api): postgres en memoria (pglite) para specs de integración y drift de migraciones"
```

---

### Task 2: Reglas puras de días

**Files:**

- Create: `apps/api/src/routines/application/dias/limites.ts`
- Create: `apps/api/src/routines/application/errors/too-many-days.error.ts`, `empty-day.error.ts`, `duplicate-exercise-in-day.error.ts`, `routine-day-not-found.error.ts`
- Modify: `apps/api/src/routines/application/errors/too-many-exercises.error.ts`
- Create: `apps/api/src/routines/application/dias/validar-dias.ts` (+ `validar-dias.spec.ts`)
- Create: `apps/api/src/routines/application/dias/resolver-vinculo-de-dia.ts` (+ spec)
- Create: `apps/api/src/routines/application/dias/merge-dia-vinculado.ts` (+ spec)
- Create: `apps/api/src/routines/application/validar-exercise-ids.ts`

**Interfaces:**

- Consumes: `EjercicioItem` de `apps/api/src/routines/application/ports/routine-template-repository.port.ts` (sin cambios en esta tarea).
- Produces:
  - `MAX_DIAS = 7`, `MAX_EJERCICIOS_TOTALES = 50`
  - `validarDias(dias: ReadonlyArray<{ ejercicios: ReadonlyArray<EjercicioItem> }>): void` — lanza `TooManyDaysError`, `TooManyExercisesError`, `EmptyDayError`, `DuplicateExerciseInDayError` (todos 400).
  - `resolverVinculoDeDia(entrada: EntradaVinculo): string | null` con `EntradaVinculo = { pedido: string | undefined; anterior: string | null; exerciseIdsDelDia: string[]; diaPlantilla: DiaPlantillaReferenciado | undefined }` y `DiaPlantillaReferenciado = { id: string; exerciseIds: string[]; esDelInvocador: boolean }`. Lanza `RoutineTemplateNotFoundError` (404) si pide un vínculo nuevo a un día inexistente o ajeno.
  - `mergeDiaVinculado(entrada: { ejerciciosDiaPlantilla: EjercicioItem[]; ejerciciosDiaInstancia: EjercicioItem[]; ejerciciosOtrosDiasVinculados: EjercicioItem[][] }): EjercicioItem[]`
  - `validarExerciseIdsEnCatalogo(repo: ExerciseRepositoryPort, ejercicios: ReadonlyArray<{ exerciseId: string }>): Promise<void>` — lanza `InvalidExerciseIdError`.
  - `RoutineDayNotFoundError(diaId: string)` (404).

- [ ] **Step 1: Límites y errores**

`apps/api/src/routines/application/dias/limites.ts`:

```ts
export const MAX_DIAS = 7;
export const MAX_EJERCICIOS_TOTALES = 50;
```

`apps/api/src/routines/application/errors/too-many-days.error.ts`:

```ts
import { DomainError } from '../../../shared-kernel/domain-error';
import { MAX_DIAS } from '../dias/limites';

export class TooManyDaysError extends DomainError {
  readonly httpStatus = 400;

  constructor(cantidad: number) {
    super(`Una rutina puede tener hasta ${MAX_DIAS} días (llegaron ${cantidad}).`);
    this.name = 'TooManyDaysError';
  }
}
```

`apps/api/src/routines/application/errors/empty-day.error.ts`:

```ts
import { DomainError } from '../../../shared-kernel/domain-error';

export class EmptyDayError extends DomainError {
  readonly httpStatus = 400;

  constructor(numero: number) {
    super(`El Día ${numero} no tiene ejercicios. Agregale al menos uno o quitá el día.`);
    this.name = 'EmptyDayError';
  }
}
```

`apps/api/src/routines/application/errors/duplicate-exercise-in-day.error.ts`:

```ts
import { DomainError } from '../../../shared-kernel/domain-error';

export class DuplicateExerciseInDayError extends DomainError {
  readonly httpStatus = 400;

  constructor(numero: number, exerciseId: string) {
    super(`El Día ${numero} tiene el ejercicio '${exerciseId}' repetido.`);
    this.name = 'DuplicateExerciseInDayError';
  }
}
```

`apps/api/src/routines/application/errors/routine-day-not-found.error.ts`:

```ts
import { DomainError } from '../../../shared-kernel/domain-error';

export class RoutineDayNotFoundError extends DomainError {
  readonly httpStatus = 404;

  constructor(diaId: string) {
    super(`No existe un día con id '${diaId}' en esta rutina.`);
    this.name = 'RoutineDayNotFoundError';
  }
}
```

Reemplazar el contenido de `apps/api/src/routines/application/errors/too-many-exercises.error.ts`:

```ts
import { DomainError } from '../../../shared-kernel/domain-error';
import { MAX_EJERCICIOS_TOTALES } from '../dias/limites';

export class TooManyExercisesError extends DomainError {
  readonly httpStatus = 400;

  constructor(cantidad: number) {
    super(
      `No se pueden cargar ${cantidad} ejercicios en total — el máximo es ${MAX_EJERCICIOS_TOTALES}.`,
    );
    this.name = 'TooManyExercisesError';
  }
}
```

- [ ] **Step 2: Test de `validarDias` (falla)**

`apps/api/src/routines/application/dias/validar-dias.spec.ts`:

```ts
import { validarDias } from './validar-dias';
import { EjercicioItem } from '../ports/routine-template-repository.port';
import { TooManyDaysError } from '../errors/too-many-days.error';
import { TooManyExercisesError } from '../errors/too-many-exercises.error';
import { EmptyDayError } from '../errors/empty-day.error';
import { DuplicateExerciseInDayError } from '../errors/duplicate-exercise-in-day.error';

function ej(exerciseId: string, orden = 1): EjercicioItem {
  return { exerciseId, orden, series: 3, repeticiones: 10, peso: null, notas: null };
}

describe('validarDias', () => {
  it('acepta cero días (rutina o plantilla vacía)', () => {
    expect(() => validarDias([])).not.toThrow();
  });

  it('acepta el mismo ejercicio en días distintos', () => {
    expect(() =>
      validarDias([{ ejercicios: [ej('ex-1')] }, { ejercicios: [ej('ex-1')] }]),
    ).not.toThrow();
  });

  it('rechaza 8 días', () => {
    const dias = Array.from({ length: 8 }, (_, i) => ({ ejercicios: [ej(`ex-${i}`)] }));
    expect(() => validarDias(dias)).toThrow(TooManyDaysError);
  });

  it('rechaza 51 ejercicios sumando todos los días', () => {
    const dia = (desde: number, cantidad: number) => ({
      ejercicios: Array.from({ length: cantidad }, (_, i) => ej(`ex-${desde + i}`, i + 1)),
    });
    expect(() => validarDias([dia(0, 25), dia(100, 26)])).toThrow(TooManyExercisesError);
  });

  it('acepta exactamente 50 ejercicios en total', () => {
    const ejercicios = Array.from({ length: 50 }, (_, i) => ej(`ex-${i}`, i + 1));
    expect(() => validarDias([{ ejercicios }])).not.toThrow();
  });

  it('rechaza un día vacío informando su número', () => {
    expect(() => validarDias([{ ejercicios: [ej('ex-1')] }, { ejercicios: [] }])).toThrow(
      'El Día 2 no tiene ejercicios',
    );
    expect(() => validarDias([{ ejercicios: [] }])).toThrow(EmptyDayError);
  });

  it('rechaza un ejercicio repetido dentro del mismo día', () => {
    expect(() => validarDias([{ ejercicios: [ej('ex-1', 1), ej('ex-1', 2)] }])).toThrow(
      DuplicateExerciseInDayError,
    );
  });
});
```

Run: `pnpm --filter api test -- validar-dias` → Expected: FAIL (`Cannot find module './validar-dias'`).

- [ ] **Step 3: Implementar `validarDias`**

`apps/api/src/routines/application/dias/validar-dias.ts`:

```ts
import { EjercicioItem } from '../ports/routine-template-repository.port';
import { MAX_DIAS, MAX_EJERCICIOS_TOTALES } from './limites';
import { TooManyDaysError } from '../errors/too-many-days.error';
import { TooManyExercisesError } from '../errors/too-many-exercises.error';
import { EmptyDayError } from '../errors/empty-day.error';
import { DuplicateExerciseInDayError } from '../errors/duplicate-exercise-in-day.error';

export function validarDias(
  dias: ReadonlyArray<{ ejercicios: ReadonlyArray<EjercicioItem> }>,
): void {
  if (dias.length > MAX_DIAS) {
    throw new TooManyDaysError(dias.length);
  }

  const total = dias.reduce((suma, dia) => suma + dia.ejercicios.length, 0);
  if (total > MAX_EJERCICIOS_TOTALES) {
    throw new TooManyExercisesError(total);
  }

  dias.forEach((dia, indice) => {
    const numero = indice + 1;
    if (dia.ejercicios.length === 0) {
      throw new EmptyDayError(numero);
    }
    const vistos = new Set<string>();
    for (const ejercicio of dia.ejercicios) {
      if (vistos.has(ejercicio.exerciseId)) {
        throw new DuplicateExerciseInDayError(numero, ejercicio.exerciseId);
      }
      vistos.add(ejercicio.exerciseId);
    }
  });
}
```

Run: `pnpm --filter api test -- validar-dias` → Expected: PASS (7 tests).

- [ ] **Step 4: Test de `resolverVinculoDeDia` (falla)**

`apps/api/src/routines/application/dias/resolver-vinculo-de-dia.spec.ts`:

```ts
import { resolverVinculoDeDia, DiaPlantillaReferenciado } from './resolver-vinculo-de-dia';
import { RoutineTemplateNotFoundError } from '../errors/routine-template-not-found.error';

const diaPiernas: DiaPlantillaReferenciado = {
  id: 'tday-1',
  exerciseIds: ['ex-1', 'ex-2'],
  esDelInvocador: true,
};

describe('resolverVinculoDeDia', () => {
  it('sin pedido de vínculo, el día queda independiente', () => {
    expect(
      resolverVinculoDeDia({
        pedido: undefined,
        anterior: 'tday-1',
        exerciseIdsDelDia: ['ex-1', 'ex-2'],
        diaPlantilla: undefined,
      }),
    ).toBeNull();
  });

  it('vínculo nuevo con el mismo conjunto de ejercicios (en otro orden) queda vinculado', () => {
    expect(
      resolverVinculoDeDia({
        pedido: 'tday-1',
        anterior: null,
        exerciseIdsDelDia: ['ex-2', 'ex-1'],
        diaPlantilla: diaPiernas,
      }),
    ).toBe('tday-1');
  });

  it('vínculo nuevo con un conjunto distinto queda independiente (importado y modificado)', () => {
    expect(
      resolverVinculoDeDia({
        pedido: 'tday-1',
        anterior: null,
        exerciseIdsDelDia: ['ex-1', 'ex-3'],
        diaPlantilla: diaPiernas,
      }),
    ).toBeNull();
  });

  it('mismo largo pero un ejercicio distinto cuenta como divergencia', () => {
    expect(
      resolverVinculoDeDia({
        pedido: 'tday-1',
        anterior: 'tday-1',
        exerciseIdsDelDia: ['ex-1', 'ex-9'],
        diaPlantilla: diaPiernas,
      }),
    ).toBeNull();
  });

  it('vínculo nuevo a un día de plantilla ajena → 404', () => {
    expect(() =>
      resolverVinculoDeDia({
        pedido: 'tday-1',
        anterior: null,
        exerciseIdsDelDia: ['ex-1', 'ex-2'],
        diaPlantilla: { ...diaPiernas, esDelInvocador: false },
      }),
    ).toThrow(RoutineTemplateNotFoundError);
  });

  it('vínculo nuevo a un día inexistente → 404', () => {
    expect(() =>
      resolverVinculoDeDia({
        pedido: 'tday-x',
        anterior: null,
        exerciseIdsDelDia: ['ex-1'],
        diaPlantilla: undefined,
      }),
    ).toThrow(RoutineTemplateNotFoundError);
  });

  it('vínculo ya existente a una plantilla de otro profesor de la cartera se conserva', () => {
    expect(
      resolverVinculoDeDia({
        pedido: 'tday-1',
        anterior: 'tday-1',
        exerciseIdsDelDia: ['ex-1', 'ex-2'],
        diaPlantilla: { ...diaPiernas, esDelInvocador: false },
      }),
    ).toBe('tday-1');
  });

  it('vínculo existente cuyo día de plantilla ya no existe queda independiente sin error', () => {
    expect(
      resolverVinculoDeDia({
        pedido: 'tday-1',
        anterior: 'tday-1',
        exerciseIdsDelDia: ['ex-1', 'ex-2'],
        diaPlantilla: undefined,
      }),
    ).toBeNull();
  });
});
```

Run: `pnpm --filter api test -- resolver-vinculo-de-dia` → Expected: FAIL (módulo inexistente).

- [ ] **Step 5: Implementar `resolverVinculoDeDia`**

`apps/api/src/routines/application/dias/resolver-vinculo-de-dia.ts`:

```ts
import { RoutineTemplateNotFoundError } from '../errors/routine-template-not-found.error';

export interface DiaPlantillaReferenciado {
  id: string;
  exerciseIds: string[];
  /** Pertenece a una plantilla del profesor que invoca, en su mismo gym. */
  esDelInvocador: boolean;
}

export interface EntradaVinculo {
  pedido: string | undefined;
  /** Vínculo que el día ya tenía persistido; `null` para días nuevos. */
  anterior: string | null;
  exerciseIdsDelDia: string[];
  diaPlantilla: DiaPlantillaReferenciado | undefined;
}

/**
 * Regla única de vínculo (spec §Regla única de vínculo). Un vínculo que
 * el día ya tenía no exige propiedad: otro profesor de la cartera puede
 * haberlo vinculado a SU plantilla y se conserva mientras el conjunto de
 * ejercicios no cambie.
 */
export function resolverVinculoDeDia(entrada: EntradaVinculo): string | null {
  const { pedido, anterior, exerciseIdsDelDia, diaPlantilla } = entrada;
  if (!pedido) {
    return null;
  }

  const esVinculoNuevo = pedido !== anterior;
  if (esVinculoNuevo && (!diaPlantilla || !diaPlantilla.esDelInvocador)) {
    throw new RoutineTemplateNotFoundError(pedido);
  }
  if (!diaPlantilla) {
    return null;
  }

  return mismoConjunto(exerciseIdsDelDia, diaPlantilla.exerciseIds) ? pedido : null;
}

function mismoConjunto(a: string[], b: string[]): boolean {
  const conjuntoA = new Set(a);
  const conjuntoB = new Set(b);
  if (conjuntoA.size !== conjuntoB.size) return false;
  return [...conjuntoA].every((id) => conjuntoB.has(id));
}
```

Run: `pnpm --filter api test -- resolver-vinculo-de-dia` → Expected: PASS (8 tests).

- [ ] **Step 6: Test de `mergeDiaVinculado` (falla)**

`apps/api/src/routines/application/dias/merge-dia-vinculado.spec.ts`:

```ts
import { mergeDiaVinculado } from './merge-dia-vinculado';
import { EjercicioItem } from '../ports/routine-template-repository.port';

function ej(exerciseId: string, valores: Partial<EjercicioItem> = {}): EjercicioItem {
  return {
    exerciseId,
    orden: 1,
    series: 4,
    repeticiones: 12,
    peso: 50,
    notas: null,
    ...valores,
  };
}

describe('mergeDiaVinculado', () => {
  it('estructura, orden y notas salen de la plantilla', () => {
    const resultado = mergeDiaVinculado({
      ejerciciosDiaPlantilla: [
        ej('ex-2', { orden: 1, notas: 'nota nueva' }),
        ej('ex-1', { orden: 2 }),
      ],
      ejerciciosDiaInstancia: [ej('ex-1', { orden: 1, series: 3 }), ej('ex-3', { orden: 2 })],
      ejerciciosOtrosDiasVinculados: [],
    });

    expect(resultado.map((e) => [e.exerciseId, e.orden, e.notas])).toEqual([
      ['ex-2', 1, 'nota nueva'],
      ['ex-1', 2, null],
    ]);
  });

  it('prioridad 1: series/reps/peso del alumno en el mismo día', () => {
    const [resultado] = mergeDiaVinculado({
      ejerciciosDiaPlantilla: [ej('ex-1')],
      ejerciciosDiaInstancia: [ej('ex-1', { series: 3, repeticiones: 8, peso: 20 })],
      ejerciciosOtrosDiasVinculados: [[ej('ex-1', { series: 9, repeticiones: 9, peso: 99 })]],
    });

    expect([resultado.series, resultado.repeticiones, resultado.peso]).toEqual([3, 8, 20]);
  });

  it('prioridad 2: el ejercicio cambió de día en la plantilla y aparece una sola vez en otro día vinculado', () => {
    const [resultado] = mergeDiaVinculado({
      ejerciciosDiaPlantilla: [ej('ex-1')],
      ejerciciosDiaInstancia: [],
      ejerciciosOtrosDiasVinculados: [[ej('ex-1', { series: 5, repeticiones: 6, peso: 70 })]],
    });

    expect([resultado.series, resultado.repeticiones, resultado.peso]).toEqual([5, 6, 70]);
  });

  it('prioridad 3: ambigüedad (aparece en dos otros días) → valores de la plantilla', () => {
    const [resultado] = mergeDiaVinculado({
      ejerciciosDiaPlantilla: [ej('ex-1', { series: 4, repeticiones: 12, peso: 50 })],
      ejerciciosDiaInstancia: [],
      ejerciciosOtrosDiasVinculados: [
        [ej('ex-1', { series: 5, peso: 70 })],
        [ej('ex-1', { series: 6, peso: 80 })],
      ],
    });

    expect([resultado.series, resultado.repeticiones, resultado.peso]).toEqual([4, 12, 50]);
  });

  it('prioridad 3: ejercicio nuevo en la plantilla → valores de la plantilla', () => {
    const [resultado] = mergeDiaVinculado({
      ejerciciosDiaPlantilla: [ej('ex-7', { series: 2, repeticiones: 20, peso: null })],
      ejerciciosDiaInstancia: [ej('ex-1')],
      ejerciciosOtrosDiasVinculados: [],
    });

    expect(resultado).toEqual(ej('ex-7', { series: 2, repeticiones: 20, peso: null }));
  });
});
```

Run: `pnpm --filter api test -- merge-dia-vinculado` → Expected: FAIL.

- [ ] **Step 7: Implementar `mergeDiaVinculado`**

`apps/api/src/routines/application/dias/merge-dia-vinculado.ts`:

```ts
import { EjercicioItem } from '../ports/routine-template-repository.port';

export interface EntradaMergeDia {
  ejerciciosDiaPlantilla: EjercicioItem[];
  ejerciciosDiaInstancia: EjercicioItem[];
  /** Ejercicios de los OTROS días de la misma instancia vinculados a la misma plantilla. */
  ejerciciosOtrosDiasVinculados: EjercicioItem[][];
}

/**
 * Membresía, `orden` y `notas` siguen al día de plantilla. `series`/
 * `repeticiones`/`peso` son del alumno: se buscan primero en el mismo
 * día, después en otro día vinculado a la misma plantilla si el
 * ejercicio aparece ahí exactamente una vez (la plantilla lo cambió de
 * día), y si no, se toman de la plantilla.
 */
export function mergeDiaVinculado(entrada: EntradaMergeDia): EjercicioItem[] {
  const delMismoDia = new Map(entrada.ejerciciosDiaInstancia.map((e) => [e.exerciseId, e]));

  const apariciones = new Map<string, EjercicioItem[]>();
  for (const dia of entrada.ejerciciosOtrosDiasVinculados) {
    for (const ejercicio of dia) {
      apariciones.set(ejercicio.exerciseId, [
        ...(apariciones.get(ejercicio.exerciseId) ?? []),
        ejercicio,
      ]);
    }
  }

  return entrada.ejerciciosDiaPlantilla.map((dePlantilla) => {
    const otros = apariciones.get(dePlantilla.exerciseId);
    const propio =
      delMismoDia.get(dePlantilla.exerciseId) ?? (otros?.length === 1 ? otros[0] : undefined);
    if (!propio) {
      return { ...dePlantilla };
    }
    return {
      ...dePlantilla,
      series: propio.series,
      repeticiones: propio.repeticiones,
      peso: propio.peso,
    };
  });
}
```

Run: `pnpm --filter api test -- merge-dia-vinculado` → Expected: PASS (5 tests).

- [ ] **Step 8: Extraer la validación contra el catálogo**

Hoy `validarExerciseIdsEnCatalogo` está copiada como método privado en tres casos de uso. `apps/api/src/routines/application/validar-exercise-ids.ts` (la usan las Tareas 5 y 6; los casos de uso viejos se borran en la Tarea 4):

```ts
import { ExerciseRepositoryPort } from '../../exercise-catalog/application/ports/exercise-repository.port';
import { InvalidExerciseIdError } from './errors/invalid-exercise-id.error';

export async function validarExerciseIdsEnCatalogo(
  exerciseRepository: ExerciseRepositoryPort,
  ejercicios: ReadonlyArray<{ exerciseId: string }>,
): Promise<void> {
  const exerciseIds = new Set(ejercicios.map((e) => e.exerciseId));
  if (exerciseIds.size === 0) return;
  const catalogados = await exerciseRepository.findByIds([...exerciseIds]);
  if (catalogados.length !== exerciseIds.size) {
    const encontrados = new Set(catalogados.map((e) => e.id));
    const faltantes = [...exerciseIds].filter((id) => !encontrados.has(id));
    throw new InvalidExerciseIdError(faltantes);
  }
}
```

- [ ] **Step 9: Suite completa y commit**

Run: `pnpm --filter api test` → Expected: PASS.

```bash
git add apps/api/src/routines/application/dias apps/api/src/routines/application/errors apps/api/src/routines/application/validar-exercise-ids.ts
git commit -m "feat(routines): reglas puras de días (límites, vínculo por día, merge de propagación)"
```

---

### Task 3: Schema Prisma + migración de datos

**Files:**

- Modify: `apps/api/prisma/schema.prisma` (modelos de Routines)
- Create: `apps/api/prisma/migrations/20260924120000_rutina_por_dias/migration.sql`
- Create: `apps/api/src/routines/infrastructure/persistence/migracion-rutina-por-dias.int.spec.ts`

**Interfaces:**

- Consumes: `crearPGliteMigrado`, `aplicarMigracion` (Tarea 1).
- Produces: modelos Prisma `RoutineTemplateDay` (`dias` en `RoutineTemplate`; relación `ejercicios`, `diasVinculados`), `RoutineInstanceDay` (`dias` en `RoutineInstance`; `vinculadoADiaId`, relación `vinculadoA`, `ejercicios`), `RoutineTemplateExercise.dayId`/`day`, `RoutineInstanceExercise.dayId`/`day`. Se eliminan `RoutineInstance.vinculada`, `origenTemplateId`, `origenTemplate`, `RoutineTemplate.instanciasOrigen`, `RoutineTemplate.ejercicios`, `RoutineInstance.ejercicios`.

Después de esta tarea `pnpm --filter api build` falla en `prisma-routine-template.repository.ts` y `prisma-routine-instance.repository.ts` (Global Constraints, secuencia backend). Jest queda verde: ningún spec importa esos repositorios.

- [ ] **Step 1: Test de la migración (falla)**

`apps/api/src/routines/infrastructure/persistence/migracion-rutina-por-dias.int.spec.ts`:

```ts
import { PGlite } from '@electric-sql/pglite';
import { aplicarMigracion, crearPGliteMigrado } from '../../../test-support/base-de-prueba';

jest.setTimeout(60_000);

const MIGRACION = '20260924120000_rutina_por_dias';

const DATOS_PREVIOS = `
INSERT INTO "User" ("id","authUserId","gymId","username","nombre","role","updatedAt") VALUES
  ('prof-1','auth-prof','gym-1','profe','Profe','PROFESOR',now()),
  ('alum-1','auth-a1','gym-1','a1','A1','ALUMNO',now()),
  ('alum-2','auth-a2','gym-1','a2','A2','ALUMNO',now()),
  ('alum-3','auth-a3','gym-1','a3','A3','ALUMNO',now()),
  ('alum-4','auth-a4','gym-1','a4','A4','ALUMNO',now());
INSERT INTO "Exercise" ("id","nombre","parteCuerpo","grupoMuscular","updatedAt") VALUES
  ('ex-1','Sentadilla','piernas','cuadriceps',now()),
  ('ex-2','Remo','espalda','dorsal',now());
INSERT INTO "RoutineTemplate" ("id","gymId","profesorId","nombre","updatedAt") VALUES
  ('tpl-a','gym-1','prof-1','Full body',now()),
  ('tpl-vacia','gym-1','prof-1','Vacía',now());
INSERT INTO "RoutineTemplateExercise" ("id","templateId","exerciseId","orden","series","repeticiones") VALUES
  ('te-1','tpl-a','ex-1',1,4,12),
  ('te-2','tpl-a','ex-2',2,3,10);
INSERT INTO "RoutineInstance" ("id","gymId","profesorId","alumnoId","nombre","origenTemplateId","vinculada","updatedAt") VALUES
  ('inst-vinc','gym-1','prof-1','alum-1','Vinculada','tpl-a',true,now()),
  ('inst-libre','gym-1','prof-1','alum-2','Libre','tpl-a',false,now()),
  ('inst-huerfana','gym-1','prof-1','alum-3','Huérfana',NULL,true,now()),
  ('inst-vacia','gym-1','prof-1','alum-4','Vacía',NULL,false,now());
INSERT INTO "RoutineInstanceExercise" ("id","instanceId","exerciseId","orden","series","repeticiones","peso") VALUES
  ('ie-1','inst-vinc','ex-1',1,3,8,20),
  ('ie-2','inst-vinc','ex-2',2,3,8,NULL),
  ('ie-3','inst-libre','ex-1',1,5,5,60),
  ('ie-4','inst-huerfana','ex-2',1,4,10,NULL);
`;

describe(`migración ${MIGRACION}`, () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await crearPGliteMigrado({ excluir: [MIGRACION] });
    await db.exec(DATOS_PREVIOS);
    await aplicarMigracion(db, MIGRACION);
  });

  afterAll(async () => {
    await db.close();
  });

  async function filas<T>(sql: string): Promise<T[]> {
    return (await db.query<T>(sql)).rows;
  }

  it('cada plantilla con ejercicios recibe un Día 1 con todos sus ejercicios, en el mismo orden', async () => {
    const dias = await filas<{ templateId: string; numero: number; id: string }>(
      `SELECT "templateId","numero","id" FROM "RoutineTemplateDay" ORDER BY "templateId"`,
    );
    expect(dias.map((d) => [d.templateId, d.numero])).toEqual([['tpl-a', 1]]);

    const ejercicios = await filas<{ id: string; dayId: string; orden: number }>(
      `SELECT "id","dayId","orden" FROM "RoutineTemplateExercise" ORDER BY "orden"`,
    );
    expect(ejercicios).toEqual([
      { id: 'te-1', dayId: dias[0].id, orden: 1 },
      { id: 'te-2', dayId: dias[0].id, orden: 2 },
    ]);
  });

  it('una instancia vinculada queda con su Día 1 vinculado al Día 1 de su plantilla', async () => {
    const [diaPlantilla] = await filas<{ id: string }>(
      `SELECT "id" FROM "RoutineTemplateDay" WHERE "templateId" = 'tpl-a'`,
    );
    const dias = await filas<{
      instanceId: string;
      numero: number;
      vinculadoADiaId: string | null;
    }>(
      `SELECT "instanceId","numero","vinculadoADiaId" FROM "RoutineInstanceDay" ORDER BY "instanceId"`,
    );
    expect(dias).toEqual([
      { instanceId: 'inst-huerfana', numero: 1, vinculadoADiaId: null },
      { instanceId: 'inst-libre', numero: 1, vinculadoADiaId: null },
      { instanceId: 'inst-vinc', numero: 1, vinculadoADiaId: diaPlantilla.id },
    ]);
  });

  it('no se pierde ningún ejercicio de instancia y cada uno cuelga del día de su instancia', async () => {
    const filasEjercicios = await filas<{ id: string; instanceId: string }>(
      `SELECT e."id", d."instanceId" FROM "RoutineInstanceExercise" e
       JOIN "RoutineInstanceDay" d ON d."id" = e."dayId" ORDER BY e."id"`,
    );
    expect(filasEjercicios).toEqual([
      { id: 'ie-1', instanceId: 'inst-vinc' },
      { id: 'ie-2', instanceId: 'inst-vinc' },
      { id: 'ie-3', instanceId: 'inst-libre' },
      { id: 'ie-4', instanceId: 'inst-huerfana' },
    ]);
  });

  it('se eliminan las columnas viejas', async () => {
    const columnas = await filas<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE (table_name = 'RoutineInstance' AND column_name IN ('vinculada','origenTemplateId'))
          OR (table_name = 'RoutineTemplateExercise' AND column_name = 'templateId')
          OR (table_name = 'RoutineInstanceExercise' AND column_name = 'instanceId')`,
    );
    expect(columnas).toEqual([]);
  });

  it('las tablas nuevas tienen RLS habilitado', async () => {
    const tablas = await filas<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class
       WHERE relname IN ('RoutineTemplateDay','RoutineInstanceDay') ORDER BY relname`,
    );
    expect(tablas).toEqual([
      { relname: 'RoutineInstanceDay', relrowsecurity: true },
      { relname: 'RoutineTemplateDay', relrowsecurity: true },
    ]);
  });

  it('borrar un día de plantilla desvincula el día de instancia sin borrarlo', async () => {
    await db.exec(`DELETE FROM "RoutineTemplate" WHERE "id" = 'tpl-a'`);
    const [dia] = await filas<{ vinculadoADiaId: string | null }>(
      `SELECT "vinculadoADiaId" FROM "RoutineInstanceDay" WHERE "instanceId" = 'inst-vinc'`,
    );
    expect(dia.vinculadoADiaId).toBeNull();
  });
});
```

Run: `pnpm --filter api test -- migracion-rutina-por-dias` → Expected: FAIL (no existe el archivo de migración).

- [ ] **Step 2: Escribir la migración**

`apps/api/prisma/migrations/20260924120000_rutina_por_dias/migration.sql`:

```sql
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
```

Run: `pnpm --filter api test -- migracion-rutina-por-dias` → Expected: PASS (6 tests).

- [ ] **Step 3: Actualizar `schema.prisma`**

Reemplazar los cuatro modelos de Routines (desde `model RoutineTemplate {` hasta el cierre de `model RoutineInstanceExercise`) por:

```prisma
model RoutineTemplate {
  id          String   @id @default(uuid())
  gymId       String
  profesorId  String
  nombre      String
  descripcion String?
  activa      Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  profesor User                 @relation("ProfesorTemplates", fields: [profesorId], references: [id])
  dias     RoutineTemplateDay[]

  @@index([gymId])
  @@index([profesorId])
}

// Días numerados de una plantilla (1..7). Se persisten por id, nunca
// replace-all: los RoutineInstanceDay vinculados apuntan a este id.
model RoutineTemplateDay {
  id         String @id @default(uuid())
  templateId String
  numero     Int

  template       RoutineTemplate           @relation(fields: [templateId], references: [id], onDelete: Cascade)
  ejercicios     RoutineTemplateExercise[]
  diasVinculados RoutineInstanceDay[]

  @@unique([templateId, numero])
}

model RoutineTemplateExercise {
  id           String   @id @default(uuid())
  dayId        String
  exerciseId   String
  orden        Int
  series       Int
  repeticiones Int
  peso         Decimal? @db.Decimal(5, 2)
  notas        String?

  day      RoutineTemplateDay @relation(fields: [dayId], references: [id], onDelete: Cascade)
  exercise Exercise           @relation(fields: [exerciseId], references: [id])

  @@unique([dayId, orden])
  @@index([exerciseId])
}

model RoutineInstance {
  id           String    @id @default(uuid())
  gymId        String
  profesorId   String?
  alumnoId     String
  nombre       String
  vigenteDesde DateTime  @default(now())
  vigenteHasta DateTime?
  activa       Boolean   @default(true)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  profesor User?                @relation("ProfesorInstances", fields: [profesorId], references: [id], onDelete: SetNull)
  alumno   User                 @relation("AlumnoInstances", fields: [alumnoId], references: [id])
  dias     RoutineInstanceDay[]

  @@index([gymId])
  @@index([alumnoId])
  @@index([profesorId])
}

// Días numerados de la rutina de un alumno. "Vinculado" ≡ vinculadoADiaId
// no nulo; si se borra el día de plantilla, SetNull lo desvincula.
model RoutineInstanceDay {
  id              String  @id @default(uuid())
  instanceId      String
  numero          Int
  vinculadoADiaId String?

  instance   RoutineInstance           @relation(fields: [instanceId], references: [id], onDelete: Cascade)
  vinculadoA RoutineTemplateDay?       @relation(fields: [vinculadoADiaId], references: [id], onDelete: SetNull)
  ejercicios RoutineInstanceExercise[]

  @@unique([instanceId, numero])
  @@index([vinculadoADiaId])
}

model RoutineInstanceExercise {
  id           String   @id @default(uuid())
  dayId        String
  exerciseId   String
  orden        Int
  series       Int
  repeticiones Int
  peso         Decimal? @db.Decimal(5, 2)
  notas        String?

  day      RoutineInstanceDay @relation(fields: [dayId], references: [id], onDelete: Cascade)
  exercise Exercise           @relation(fields: [exerciseId], references: [id])

  @@unique([dayId, orden])
  @@index([exerciseId])
}
```

`Exercise.ejerciciosDeTemplate` / `ejerciciosDeInstance` no cambian.

- [ ] **Step 4: Verificar schema ↔ migraciones y regenerar el cliente**

Run: `pnpm --filter api prisma:validate` → Expected: `The schema at prisma/schema.prisma is valid`.
Run: `pnpm --filter api db:verificar-migraciones` → Expected: `No difference detected.`, exit 0. Si reporta diferencias, corregir `schema.prisma` o el SQL hasta que coincidan (nunca con `migrate dev`).
Run: `pnpm --filter api prisma:generate` → Expected: OK.
Run: `pnpm --filter api test` → Expected: PASS (el build de Nest falla hasta la Tarea 4; es esperado).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260924120000_rutina_por_dias apps/api/src/routines/infrastructure/persistence/migracion-rutina-por-dias.int.spec.ts
git commit -m "feat(db): días de plantilla e instancia con vínculo por día y migración de datos"
```

---

### Task 4: Puertos, repositorios Prisma y lectura de rutinas con días

**Files:**

- Modify: `apps/api/src/routines/application/ports/routine-template-repository.port.ts`
- Modify: `apps/api/src/routines/application/ports/routine-instance-repository.port.ts`
- Create: `apps/api/src/routines/infrastructure/persistence/fila-ejercicio.ts`
- Modify: `apps/api/src/routines/infrastructure/persistence/prisma-routine-template.repository.ts`
- Modify: `apps/api/src/routines/infrastructure/persistence/prisma-routine-instance.repository.ts`
- Modify: `apps/api/src/routines/infrastructure/persistence/prisma-routines-cleanup.adapter.ts` (solo comentarios)
- Create: `apps/api/src/test-support/semillas.ts`, `apps/api/src/test-support/repositorios-routines.mock.ts`
- Create: `apps/api/src/routines/infrastructure/persistence/prisma-routine-template.repository.int.spec.ts`
- Create: `apps/api/src/routines/infrastructure/persistence/prisma-routine-instance.repository.int.spec.ts`
- Create: `apps/api/src/routines/application/resolver-dias-de-rutina.ts`
- Modify: `apps/api/src/routines/application/get-mi-rutina-vigente.use-case.ts` (+ spec)
- Modify: `apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.ts` (+ spec)
- Modify (fixtures/mocks): `create-routine-template`, `list-routine-templates`, `get-routine-template`, `update-routine-template`, `delete-routine-template`, `update-routine-instance` `.use-case.spec.ts`
- Delete: `replace-template-exercises.use-case.ts` (+ spec), `replace-instance-exercises.use-case.ts` (+ spec), `merge-ejercicios-vinculados.ts` (+ spec), `assign-routine-to-alumno.use-case.ts` (+ spec), `errors/template-has-no-exercises.error.ts`, `infrastructure/http/dto/replace-exercises.dto.ts`, `infrastructure/http/dto/create-routine-instance.dto.ts`, `infrastructure/http/routine-instances.controller.e2e.spec.ts`
- Modify: `routine-templates.controller.ts`, `routine-instances.controller.ts`, `routines.module.ts`, `routine-templates.controller.e2e.spec.ts`, `routines.controller.e2e.spec.ts`

Las rutas de escritura (`PUT /routine-templates/:id/exercises`, `POST /routine-instances`, `PUT /routine-instances/:id/exercises`) desaparecen en esta tarea y vuelven con el formato nuevo en las Tareas 5 y 6. Así cada tarea termina compilando.

**Interfaces:**

- Produces (puerto de plantillas):

```ts
export interface EjercicioItem { exerciseId: string; orden: number; series: number; repeticiones: number; peso: number | null; notas: string | null }
export interface DiaPlantilla { id: string; numero: number; ejercicios: EjercicioItem[] }
export interface RoutineTemplateDetail extends RoutineTemplateSummary { dias: DiaPlantilla[] }
export interface DiaPlantillaReferencia { id: string; numero: number; templateId: string; templateNombre: string; profesorId: string; gymId: string; exerciseIds: string[] }
export interface DiaPlantillaAGuardar { id?: string; ejercicios: EjercicioItem[] }
export interface ActualizacionDiaVinculado { diaInstanciaId: string; ejercicios: EjercicioItem[] }
// RoutineTemplateRepositoryPort: findByProfesor, findById, create, update, delete (sin cambios) +
findDiasByIds(ids: string[]): Promise<DiaPlantillaReferencia[]>;
guardarDias(templateId: string, dias: DiaPlantillaAGuardar[], propagacion: ActualizacionDiaVinculado[]): Promise<void>;
```

- Produces (puerto de instancias):

```ts
export interface DiaInstancia { id: string; numero: number; vinculadoADiaId: string | null; ejercicios: EjercicioItem[] }
export interface RoutineInstanceDetail { id: string; gymId: string; profesorId: string | null; alumnoId: string; nombre: string; vigenteDesde: Date; vigenteHasta: Date | null; activa: boolean; dias: DiaInstancia[] }
export interface DiaInstanciaAGuardar { id?: string; vinculadoADiaId: string | null; ejercicios: EjercicioItem[] }
// RoutineInstanceRepositoryPort:
findVigentePorAlumno(alumnoId: string): Promise<RoutineInstanceDetail | null>;
findById(id: string): Promise<RoutineInstanceDetail | null>;
findActivasConDiasVinculadosA(diasPlantillaIds: string[]): Promise<RoutineInstanceDetail[]>;
crear(data: { gymId: string; profesorId: string; alumnoId: string; nombre: string; dias: DiaInstanciaAGuardar[] }): Promise<RoutineInstanceDetail>;
update(id: string, data: { nombre?: string }): Promise<RoutineInstanceDetail>;
guardarDias(instanceId: string, dias: DiaInstanciaAGuardar[]): Promise<void>;
```

- Produces (lectura): `RutinaVigenteOutput = { id; nombre; dias: RutinaVigenteDiaOutput[] }`, `RutinaVigenteDiaOutput = { numero: number; ejercicios: RutinaVigenteEjercicioResuelto[] }`, `RutinaVigenteConVinculacionOutput = { id; nombre; dias: Array<RutinaVigenteDiaOutput & { id: string; vinculado: { diaId: string; templateId: string; templateNombre: string; numero: number } | null }> }` (`diaId` = id del día de plantilla; el editor del profesor lo reenvía al guardar para conservar el vínculo), `resolverDiasDeRutina(repo, dias)`.
- Produces (tests): `crearTemplateRepositoryMock()`, `crearInstanceRepositoryMock()` en `src/test-support/repositorios-routines.mock.ts`; `sembrarUsuariosYEjercicios(prisma)` en `src/test-support/semillas.ts`.

- [ ] **Step 1: Puertos**

Reemplazar `apps/api/src/routines/application/ports/routine-template-repository.port.ts` completo:

```ts
export const ROUTINE_TEMPLATE_REPOSITORY = Symbol('ROUTINE_TEMPLATE_REPOSITORY');

/** Una línea de ejercicio; misma forma en plantillas e instancias. `orden` es relativo al día. */
export interface EjercicioItem {
  exerciseId: string;
  orden: number;
  series: number;
  repeticiones: number;
  peso: number | null;
  notas: string | null;
}

export interface DiaPlantilla {
  id: string;
  numero: number;
  ejercicios: EjercicioItem[];
}

export interface RoutineTemplateSummary {
  id: string;
  gymId: string;
  profesorId: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
}

export interface RoutineTemplateDetail extends RoutineTemplateSummary {
  dias: DiaPlantilla[];
}

/** Día de plantilla con lo necesario para decidir un vínculo y mostrarlo. */
export interface DiaPlantillaReferencia {
  id: string;
  numero: number;
  templateId: string;
  templateNombre: string;
  profesorId: string;
  gymId: string;
  exerciseIds: string[];
}

/** `id` presente = día existente (se conserva su id); ausente = día nuevo. La posición en el array define `numero`. */
export interface DiaPlantillaAGuardar {
  id?: string;
  ejercicios: EjercicioItem[];
}

export interface ActualizacionDiaVinculado {
  diaInstanciaId: string;
  ejercicios: EjercicioItem[];
}

/**
 * Propiedad exclusiva del profesor que la creó — este puerto NUNCA valida
 * cartera (HLD §3 Routines). El chequeo de "es mía" vive en los casos de uso.
 */
export interface RoutineTemplateRepositoryPort {
  findByProfesor(profesorId: string): Promise<RoutineTemplateSummary[]>;
  findById(id: string): Promise<RoutineTemplateDetail | null>;
  create(data: {
    gymId: string;
    profesorId: string;
    nombre: string;
    descripcion: string | null;
  }): Promise<RoutineTemplateSummary>;
  update(
    id: string,
    data: { nombre?: string; descripcion?: string | null; activa?: boolean },
  ): Promise<RoutineTemplateSummary>;
  delete(id: string): Promise<void>;
  findDiasByIds(ids: string[]): Promise<DiaPlantillaReferencia[]>;
  /**
   * Una sola transacción: persiste los días de la plantilla por id (días
   * ausentes se borran y sus vínculos pasan a null por SetNull), y aplica
   * `propagacion` sobre los días de instancia vinculados. Escribe en
   * tablas de instancia a propósito: plantilla + propagación tienen que ser
   * atómicas y no se arma un Unit of Work genérico para un solo caso de uso
   * (mismo criterio que la transacción de alta con cartera, HLD §Identity).
   */
  guardarDias(
    templateId: string,
    dias: DiaPlantillaAGuardar[],
    propagacion: ActualizacionDiaVinculado[],
  ): Promise<void>;
}
```

Reemplazar `apps/api/src/routines/application/ports/routine-instance-repository.port.ts` completo:

```ts
import { EjercicioItem } from './routine-template-repository.port';

export const ROUTINE_INSTANCE_REPOSITORY = Symbol('ROUTINE_INSTANCE_REPOSITORY');

export interface DiaInstancia {
  id: string;
  numero: number;
  vinculadoADiaId: string | null;
  ejercicios: EjercicioItem[];
}

export interface RoutineInstanceDetail {
  id: string;
  gymId: string;
  profesorId: string | null;
  alumnoId: string;
  nombre: string;
  vigenteDesde: Date;
  vigenteHasta: Date | null;
  activa: boolean;
  dias: DiaInstancia[];
}

/** `vinculadoADiaId` ya viene resuelto por la regla de vínculo del caso de uso. */
export interface DiaInstanciaAGuardar {
  id?: string;
  vinculadoADiaId: string | null;
  ejercicios: EjercicioItem[];
}

/**
 * Ninguno de estos métodos valida cartera — eso vive en los casos de uso,
 * vía `CarteraRepositoryPort.existe()`. El repo solo ejecuta la query.
 */
export interface RoutineInstanceRepositoryPort {
  findVigentePorAlumno(alumnoId: string): Promise<RoutineInstanceDetail | null>;
  findById(id: string): Promise<RoutineInstanceDetail | null>;
  /** Instancias activas con al menos un día vinculado a alguno de esos días de plantilla; trae TODOS sus días. */
  findActivasConDiasVinculadosA(diasPlantillaIds: string[]): Promise<RoutineInstanceDetail[]>;
  /** Archiva la vigente del alumno y crea la nueva con sus días, en una sola transacción. */
  crear(data: {
    gymId: string;
    profesorId: string;
    alumnoId: string;
    nombre: string;
    dias: DiaInstanciaAGuardar[];
  }): Promise<RoutineInstanceDetail>;
  update(id: string, data: { nombre?: string }): Promise<RoutineInstanceDetail>;
  /** Persiste los días por id en una transacción; días ausentes se borran. */
  guardarDias(instanceId: string, dias: DiaInstanciaAGuardar[]): Promise<void>;
}
```

- [ ] **Step 2: Mocks y semillas compartidos**

`apps/api/src/test-support/repositorios-routines.mock.ts`:

```ts
import { RoutineTemplateRepositoryPort } from '../routines/application/ports/routine-template-repository.port';
import { RoutineInstanceRepositoryPort } from '../routines/application/ports/routine-instance-repository.port';

export function crearTemplateRepositoryMock(): jest.Mocked<RoutineTemplateRepositoryPort> {
  return {
    findByProfesor: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findDiasByIds: jest.fn(),
    guardarDias: jest.fn(),
  };
}

export function crearInstanceRepositoryMock(): jest.Mocked<RoutineInstanceRepositoryPort> {
  return {
    findVigentePorAlumno: jest.fn(),
    findById: jest.fn(),
    findActivasConDiasVinculadosA: jest.fn(),
    crear: jest.fn(),
    update: jest.fn(),
    guardarDias: jest.fn(),
  };
}
```

`apps/api/src/test-support/semillas.ts`:

```ts
import { PrismaClient, Role } from '@prisma/client';

export const GYM = 'gym-1';

/** prof-1, prof-2 (mismo gym), alum-1, alum-2 y ejercicios ex-1..ex-5. */
export async function sembrarUsuariosYEjercicios(prisma: PrismaClient): Promise<void> {
  await prisma.user.createMany({
    data: [
      {
        id: 'prof-1',
        authUserId: 'auth-prof-1',
        gymId: GYM,
        username: 'prof1',
        nombre: 'Profe 1',
        role: Role.PROFESOR,
      },
      {
        id: 'prof-2',
        authUserId: 'auth-prof-2',
        gymId: GYM,
        username: 'prof2',
        nombre: 'Profe 2',
        role: Role.PROFESOR,
      },
      {
        id: 'alum-1',
        authUserId: 'auth-alum-1',
        gymId: GYM,
        username: 'alum1',
        nombre: 'Alumno 1',
        role: Role.ALUMNO,
      },
      {
        id: 'alum-2',
        authUserId: 'auth-alum-2',
        gymId: GYM,
        username: 'alum2',
        nombre: 'Alumno 2',
        role: Role.ALUMNO,
      },
    ],
  });
  await prisma.exercise.createMany({
    data: ['ex-1', 'ex-2', 'ex-3', 'ex-4', 'ex-5'].map((id) => ({
      id,
      nombre: id,
      parteCuerpo: 'piernas',
      grupoMuscular: 'cuadriceps',
    })),
  });
}
```

- [ ] **Step 3: Tests de integración del repositorio de plantillas (fallan)**

`apps/api/src/routines/infrastructure/persistence/prisma-routine-template.repository.int.spec.ts`:

```ts
import { PrismaClient } from '@prisma/client';
import {
  ConexionPrisma,
  conectarPrisma,
  crearPGliteMigrado,
} from '../../../test-support/base-de-prueba';
import { GYM, sembrarUsuariosYEjercicios } from '../../../test-support/semillas';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import { EjercicioItem } from '../../application/ports/routine-template-repository.port';
import { PrismaRoutineTemplateRepository } from './prisma-routine-template.repository';

jest.setTimeout(60_000);

function ej(exerciseId: string, orden: number, series = 3): EjercicioItem {
  return { exerciseId, orden, series, repeticiones: 10, peso: 12.5, notas: null };
}

describe('PrismaRoutineTemplateRepository (PGlite)', () => {
  let conexion: ConexionPrisma;
  let prisma: PrismaClient;
  let repo: PrismaRoutineTemplateRepository;

  beforeAll(async () => {
    conexion = await conectarPrisma(await crearPGliteMigrado());
    prisma = conexion.prisma;
    repo = new PrismaRoutineTemplateRepository(prisma as unknown as PrismaService);
    await sembrarUsuariosYEjercicios(prisma);
  });

  afterAll(async () => {
    await conexion.cerrar();
  });

  async function nuevaPlantilla(nombre: string): Promise<string> {
    const { id } = await repo.create({
      gymId: GYM,
      profesorId: 'prof-1',
      nombre,
      descripcion: null,
    });
    return id;
  }

  it('guardarDias crea días numerados por posición y findById los devuelve ordenados', async () => {
    const id = await nuevaPlantilla('A');
    await repo.guardarDias(
      id,
      [{ ejercicios: [ej('ex-1', 1), ej('ex-2', 2)] }, { ejercicios: [ej('ex-1', 1)] }],
      [],
    );

    const detalle = await repo.findById(id);
    expect(detalle?.dias.map((d) => [d.numero, d.ejercicios.map((e) => e.exerciseId)])).toEqual([
      [1, ['ex-1', 'ex-2']],
      [2, ['ex-1']],
    ]);
    expect(detalle?.dias[0].ejercicios[0].peso).toBe(12.5);
  });

  it('reordenar días conserva sus ids (dos pasadas, sin violar el unique de numero)', async () => {
    const id = await nuevaPlantilla('B');
    await repo.guardarDias(
      id,
      [{ ejercicios: [ej('ex-1', 1)] }, { ejercicios: [ej('ex-2', 1)] }],
      [],
    );
    const [dia1, dia2] = (await repo.findById(id))!.dias;

    await repo.guardarDias(
      id,
      [
        { id: dia2.id, ejercicios: dia2.ejercicios },
        { id: dia1.id, ejercicios: dia1.ejercicios },
      ],
      [],
    );

    const dias = (await repo.findById(id))!.dias;
    expect(dias.map((d) => [d.numero, d.id])).toEqual([
      [1, dia2.id],
      [2, dia1.id],
    ]);
  });

  it('un día omitido se borra y el día de instancia vinculado queda independiente e intacto', async () => {
    const id = await nuevaPlantilla('C');
    await repo.guardarDias(
      id,
      [{ ejercicios: [ej('ex-1', 1)] }, { ejercicios: [ej('ex-3', 1)] }],
      [],
    );
    const [dia1, dia2] = (await repo.findById(id))!.dias;
    const instancia = await prisma.routineInstance.create({
      data: {
        gymId: GYM,
        profesorId: 'prof-1',
        alumnoId: 'alum-1',
        nombre: 'R',
        dias: {
          create: {
            numero: 1,
            vinculadoADiaId: dia2.id,
            ejercicios: { create: { exerciseId: 'ex-3', orden: 1, series: 5, repeticiones: 5 } },
          },
        },
      },
      include: { dias: { include: { ejercicios: true } } },
    });

    await repo.guardarDias(id, [{ id: dia1.id, ejercicios: dia1.ejercicios }], []);

    const diaInstancia = await prisma.routineInstanceDay.findUniqueOrThrow({
      where: { id: instancia.dias[0].id },
      include: { ejercicios: true },
    });
    expect(diaInstancia.vinculadoADiaId).toBeNull();
    expect(diaInstancia.ejercicios.map((e) => [e.exerciseId, e.series])).toEqual([['ex-3', 5]]);
    expect((await repo.findById(id))!.dias.map((d) => d.id)).toEqual([dia1.id]);
  });

  it('la propagación reemplaza los ejercicios del día de instancia en la misma transacción', async () => {
    const id = await nuevaPlantilla('D');
    await repo.guardarDias(id, [{ ejercicios: [ej('ex-1', 1)] }], []);
    const [dia] = (await repo.findById(id))!.dias;
    const instancia = await prisma.routineInstance.create({
      data: {
        gymId: GYM,
        profesorId: 'prof-1',
        alumnoId: 'alum-2',
        nombre: 'R',
        dias: {
          create: {
            numero: 1,
            vinculadoADiaId: dia.id,
            ejercicios: { create: { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10 } },
          },
        },
      },
      include: { dias: true },
    });

    await repo.guardarDias(
      id,
      [{ id: dia.id, ejercicios: [ej('ex-1', 1), ej('ex-4', 2)] }],
      [{ diaInstanciaId: instancia.dias[0].id, ejercicios: [ej('ex-1', 1, 9), ej('ex-4', 2)] }],
    );

    const ejercicios = await prisma.routineInstanceExercise.findMany({
      where: { dayId: instancia.dias[0].id },
      orderBy: { orden: 'asc' },
    });
    expect(ejercicios.map((e) => [e.exerciseId, e.series])).toEqual([
      ['ex-1', 9],
      ['ex-4', 3],
    ]);
  });

  it('findDiasByIds devuelve plantilla, dueño y exerciseIds de cada día', async () => {
    const id = await nuevaPlantilla('Piernas');
    await repo.guardarDias(id, [{ ejercicios: [ej('ex-2', 1), ej('ex-5', 2)] }], []);
    const [dia] = (await repo.findById(id))!.dias;

    expect(await repo.findDiasByIds([dia.id, 'no-existe'])).toEqual([
      {
        id: dia.id,
        numero: 1,
        templateId: id,
        templateNombre: 'Piernas',
        profesorId: 'prof-1',
        gymId: GYM,
        exerciseIds: ['ex-2', 'ex-5'],
      },
    ]);
    expect(await repo.findDiasByIds([])).toEqual([]);
  });

  it('borrar la plantilla borra sus días y desvincula instancias', async () => {
    const id = await nuevaPlantilla('E');
    await repo.guardarDias(id, [{ ejercicios: [ej('ex-1', 1)] }], []);
    await repo.delete(id);
    expect(await prisma.routineTemplateDay.count({ where: { templateId: id } })).toBe(0);
  });
});
```

Run: `pnpm --filter api test -- prisma-routine-template.repository` → Expected: FAIL (errores de compilación del repo contra el cliente nuevo).

- [ ] **Step 4: Helper de filas y repositorio de plantillas**

`apps/api/src/routines/infrastructure/persistence/fila-ejercicio.ts`:

```ts
import { Prisma } from '@prisma/client';
import { EjercicioItem } from '../../application/ports/routine-template-repository.port';

/** Número de desplazamiento para la primera pasada de renumeración: fuera del rango 1..7. */
export const DESPLAZAMIENTO_TEMPORAL = 100;

/** Ver timeout: guardar 7 días + propagar a varios alumnos contra Supabase supera los 5s por defecto de Prisma. */
export const OPCIONES_TRANSACCION = { timeout: 30_000, maxWait: 10_000 };

export function aFilaEjercicio(dayId: string, e: EjercicioItem) {
  return {
    dayId,
    exerciseId: e.exerciseId,
    orden: e.orden,
    series: e.series,
    repeticiones: e.repeticiones,
    peso: e.peso === null ? null : new Prisma.Decimal(e.peso),
    notas: e.notas,
  };
}

export function aEjercicioItem(fila: {
  exerciseId: string;
  orden: number;
  series: number;
  repeticiones: number;
  peso: Prisma.Decimal | null;
  notas: string | null;
}): EjercicioItem {
  return {
    exerciseId: fila.exerciseId,
    orden: fila.orden,
    series: fila.series,
    repeticiones: fila.repeticiones,
    peso: fila.peso === null ? null : fila.peso.toNumber(),
    notas: fila.notas,
  };
}
```

Reemplazar `apps/api/src/routines/infrastructure/persistence/prisma-routine-template.repository.ts` completo:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import {
  ActualizacionDiaVinculado,
  DiaPlantillaAGuardar,
  DiaPlantillaReferencia,
  RoutineTemplateDetail,
  RoutineTemplateRepositoryPort,
  RoutineTemplateSummary,
} from '../../application/ports/routine-template-repository.port';
import {
  DESPLAZAMIENTO_TEMPORAL,
  OPCIONES_TRANSACCION,
  aEjercicioItem,
  aFilaEjercicio,
} from './fila-ejercicio';

const SELECT_SUMMARY = {
  id: true,
  gymId: true,
  profesorId: true,
  nombre: true,
  descripcion: true,
  activa: true,
} satisfies Prisma.RoutineTemplateSelect;

const INCLUDE_DIAS = {
  dias: {
    orderBy: { numero: 'asc' },
    include: { ejercicios: { orderBy: { orden: 'asc' } } },
  },
} satisfies Prisma.RoutineTemplateInclude;

@Injectable()
export class PrismaRoutineTemplateRepository implements RoutineTemplateRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByProfesor(profesorId: string): Promise<RoutineTemplateSummary[]> {
    return this.prisma.routineTemplate.findMany({
      where: { profesorId },
      orderBy: { nombre: 'asc' },
      select: SELECT_SUMMARY,
    });
  }

  async findById(id: string): Promise<RoutineTemplateDetail | null> {
    const template = await this.prisma.routineTemplate.findUnique({
      where: { id },
      include: INCLUDE_DIAS,
    });
    if (!template) return null;

    return {
      id: template.id,
      gymId: template.gymId,
      profesorId: template.profesorId,
      nombre: template.nombre,
      descripcion: template.descripcion,
      activa: template.activa,
      dias: template.dias.map((dia) => ({
        id: dia.id,
        numero: dia.numero,
        ejercicios: dia.ejercicios.map(aEjercicioItem),
      })),
    };
  }

  async create(data: {
    gymId: string;
    profesorId: string;
    nombre: string;
    descripcion: string | null;
  }): Promise<RoutineTemplateSummary> {
    return this.prisma.routineTemplate.create({ data, select: SELECT_SUMMARY });
  }

  async update(
    id: string,
    data: { nombre?: string; descripcion?: string | null; activa?: boolean },
  ): Promise<RoutineTemplateSummary> {
    return this.prisma.routineTemplate.update({ where: { id }, data, select: SELECT_SUMMARY });
  }

  async delete(id: string): Promise<void> {
    // Días y ejercicios caen por onDelete: Cascade; los días de instancia
    // vinculados quedan con vinculadoADiaId = null por onDelete: SetNull.
    await this.prisma.routineTemplate.delete({ where: { id } });
  }

  async findDiasByIds(ids: string[]): Promise<DiaPlantillaReferencia[]> {
    if (ids.length === 0) return [];
    const dias = await this.prisma.routineTemplateDay.findMany({
      where: { id: { in: ids } },
      include: {
        template: { select: { nombre: true, profesorId: true, gymId: true } },
        ejercicios: { select: { exerciseId: true }, orderBy: { orden: 'asc' } },
      },
    });
    return dias.map((dia) => ({
      id: dia.id,
      numero: dia.numero,
      templateId: dia.templateId,
      templateNombre: dia.template.nombre,
      profesorId: dia.template.profesorId,
      gymId: dia.template.gymId,
      exerciseIds: dia.ejercicios.map((e) => e.exerciseId),
    }));
  }

  async guardarDias(
    templateId: string,
    dias: DiaPlantillaAGuardar[],
    propagacion: ActualizacionDiaVinculado[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const idsConservados = dias.flatMap((dia) => (dia.id ? [dia.id] : []));
      await tx.routineTemplateDay.deleteMany({
        where: { templateId, id: { notIn: idsConservados } },
      });
      await tx.routineTemplateDay.updateMany({
        where: { templateId },
        data: { numero: { increment: DESPLAZAMIENTO_TEMPORAL } },
      });

      for (const [indice, dia] of dias.entries()) {
        const numero = indice + 1;
        const { id: dayId } = dia.id
          ? await tx.routineTemplateDay.update({
              where: { id: dia.id },
              data: { numero },
              select: { id: true },
            })
          : await tx.routineTemplateDay.create({
              data: { templateId, numero },
              select: { id: true },
            });
        await tx.routineTemplateExercise.deleteMany({ where: { dayId } });
        await tx.routineTemplateExercise.createMany({
          data: dia.ejercicios.map((e) => aFilaEjercicio(dayId, e)),
        });
      }

      for (const actualizacion of propagacion) {
        await tx.routineInstanceExercise.deleteMany({
          where: { dayId: actualizacion.diaInstanciaId },
        });
        await tx.routineInstanceExercise.createMany({
          data: actualizacion.ejercicios.map((e) =>
            aFilaEjercicio(actualizacion.diaInstanciaId, e),
          ),
        });
      }
    }, OPCIONES_TRANSACCION);
  }
}
```

Run: `pnpm --filter api test -- prisma-routine-template.repository` → Expected: PASS (6 tests).

- [ ] **Step 5: Tests de integración del repositorio de instancias (fallan)**

`apps/api/src/routines/infrastructure/persistence/prisma-routine-instance.repository.int.spec.ts`:

```ts
import { PrismaClient } from '@prisma/client';
import {
  ConexionPrisma,
  conectarPrisma,
  crearPGliteMigrado,
} from '../../../test-support/base-de-prueba';
import { GYM, sembrarUsuariosYEjercicios } from '../../../test-support/semillas';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import { EjercicioItem } from '../../application/ports/routine-template-repository.port';
import { PrismaRoutineInstanceRepository } from './prisma-routine-instance.repository';

jest.setTimeout(60_000);

function ej(exerciseId: string, orden: number): EjercicioItem {
  return { exerciseId, orden, series: 3, repeticiones: 10, peso: null, notas: null };
}

describe('PrismaRoutineInstanceRepository (PGlite)', () => {
  let conexion: ConexionPrisma;
  let prisma: PrismaClient;
  let repo: PrismaRoutineInstanceRepository;
  let diaPlantillaId: string;

  beforeAll(async () => {
    conexion = await conectarPrisma(await crearPGliteMigrado());
    prisma = conexion.prisma;
    repo = new PrismaRoutineInstanceRepository(prisma as unknown as PrismaService);
    await sembrarUsuariosYEjercicios(prisma);
    const plantilla = await prisma.routineTemplate.create({
      data: {
        gymId: GYM,
        profesorId: 'prof-1',
        nombre: 'T',
        dias: {
          create: {
            numero: 1,
            ejercicios: { create: { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10 } },
          },
        },
      },
      include: { dias: true },
    });
    diaPlantillaId = plantilla.dias[0].id;
  });

  afterAll(async () => {
    await conexion.cerrar();
  });

  it('crear archiva la vigente anterior y crea la nueva con días y vínculos', async () => {
    const primera = await repo.crear({
      gymId: GYM,
      profesorId: 'prof-1',
      alumnoId: 'alum-1',
      nombre: 'Primera',
      dias: [{ vinculadoADiaId: null, ejercicios: [ej('ex-2', 1)] }],
    });
    const segunda = await repo.crear({
      gymId: GYM,
      profesorId: 'prof-1',
      alumnoId: 'alum-1',
      nombre: 'Segunda',
      dias: [
        { vinculadoADiaId: diaPlantillaId, ejercicios: [ej('ex-1', 1)] },
        { vinculadoADiaId: null, ejercicios: [ej('ex-1', 1), ej('ex-3', 2)] },
      ],
    });

    expect((await repo.findById(primera.id))?.activa).toBe(false);
    expect(segunda.dias.map((d) => [d.numero, d.vinculadoADiaId, d.ejercicios.length])).toEqual([
      [1, diaPlantillaId, 1],
      [2, null, 2],
    ]);
    expect((await repo.findVigentePorAlumno('alum-1'))?.id).toBe(segunda.id);
  });

  it('guardarDias reordena conservando ids y vínculos, y borra los días omitidos', async () => {
    const instancia = await repo.crear({
      gymId: GYM,
      profesorId: 'prof-1',
      alumnoId: 'alum-2',
      nombre: 'R',
      dias: [
        { vinculadoADiaId: diaPlantillaId, ejercicios: [ej('ex-1', 1)] },
        { vinculadoADiaId: null, ejercicios: [ej('ex-2', 1)] },
        { vinculadoADiaId: null, ejercicios: [ej('ex-3', 1)] },
      ],
    });
    const [d1, d2] = instancia.dias;

    await repo.guardarDias(instancia.id, [
      { id: d2.id, vinculadoADiaId: null, ejercicios: [ej('ex-2', 1), ej('ex-4', 2)] },
      { id: d1.id, vinculadoADiaId: diaPlantillaId, ejercicios: d1.ejercicios },
    ]);

    const dias = (await repo.findById(instancia.id))!.dias;
    expect(
      dias.map((d) => [d.numero, d.id, d.vinculadoADiaId, d.ejercicios.map((e) => e.exerciseId)]),
    ).toEqual([
      [1, d2.id, null, ['ex-2', 'ex-4']],
      [2, d1.id, diaPlantillaId, ['ex-1']],
    ]);
  });

  it('findActivasConDiasVinculadosA trae solo activas y con todos sus días', async () => {
    const resultado = await repo.findActivasConDiasVinculadosA([diaPlantillaId]);
    expect(resultado.every((i) => i.activa)).toBe(true);
    expect(resultado.map((i) => i.alumnoId).sort()).toEqual(['alum-1', 'alum-2']);
    const deAlum1 = resultado.find((i) => i.alumnoId === 'alum-1')!;
    expect(deAlum1.dias).toHaveLength(2);
    expect(await repo.findActivasConDiasVinculadosA([])).toEqual([]);
  });

  it('update cambia el nombre y devuelve los días', async () => {
    const vigente = (await repo.findVigentePorAlumno('alum-2'))!;
    const actualizada = await repo.update(vigente.id, { nombre: 'Nuevo nombre' });
    expect(actualizada.nombre).toBe('Nuevo nombre');
    expect(actualizada.dias).toHaveLength(2);
  });
});
```

Run: `pnpm --filter api test -- prisma-routine-instance.repository` → Expected: FAIL.

- [ ] **Step 6: Repositorio de instancias**

Reemplazar `apps/api/src/routines/infrastructure/persistence/prisma-routine-instance.repository.ts` completo:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import {
  DiaInstanciaAGuardar,
  RoutineInstanceDetail,
  RoutineInstanceRepositoryPort,
} from '../../application/ports/routine-instance-repository.port';
import {
  DESPLAZAMIENTO_TEMPORAL,
  OPCIONES_TRANSACCION,
  aEjercicioItem,
  aFilaEjercicio,
} from './fila-ejercicio';

const INCLUDE_DIAS = {
  dias: {
    orderBy: { numero: 'asc' },
    include: { ejercicios: { orderBy: { orden: 'asc' } } },
  },
} satisfies Prisma.RoutineInstanceInclude;

type InstanciaConDias = Prisma.RoutineInstanceGetPayload<{ include: typeof INCLUDE_DIAS }>;

@Injectable()
export class PrismaRoutineInstanceRepository implements RoutineInstanceRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findVigentePorAlumno(alumnoId: string): Promise<RoutineInstanceDetail | null> {
    const instance = await this.prisma.routineInstance.findFirst({
      where: { alumnoId, activa: true },
      orderBy: { vigenteDesde: 'desc' },
      include: INCLUDE_DIAS,
    });
    return instance ? this.toDetail(instance) : null;
  }

  async findById(id: string): Promise<RoutineInstanceDetail | null> {
    const instance = await this.prisma.routineInstance.findUnique({
      where: { id },
      include: INCLUDE_DIAS,
    });
    return instance ? this.toDetail(instance) : null;
  }

  async findActivasConDiasVinculadosA(
    diasPlantillaIds: string[],
  ): Promise<RoutineInstanceDetail[]> {
    if (diasPlantillaIds.length === 0) return [];
    const instances = await this.prisma.routineInstance.findMany({
      where: { activa: true, dias: { some: { vinculadoADiaId: { in: diasPlantillaIds } } } },
      include: INCLUDE_DIAS,
    });
    return instances.map((instance) => this.toDetail(instance));
  }

  async crear(data: {
    gymId: string;
    profesorId: string;
    alumnoId: string;
    nombre: string;
    dias: DiaInstanciaAGuardar[];
  }): Promise<RoutineInstanceDetail> {
    const instanceId = await this.prisma.$transaction(async (tx) => {
      await tx.routineInstance.updateMany({
        where: { alumnoId: data.alumnoId, activa: true },
        data: { activa: false, vigenteHasta: new Date() },
      });
      const { id } = await tx.routineInstance.create({
        data: {
          gymId: data.gymId,
          profesorId: data.profesorId,
          alumnoId: data.alumnoId,
          nombre: data.nombre,
        },
        select: { id: true },
      });
      await this.escribirDias(tx, id, data.dias);
      return id;
    }, OPCIONES_TRANSACCION);

    return (await this.findById(instanceId))!;
  }

  async update(id: string, data: { nombre?: string }): Promise<RoutineInstanceDetail> {
    const instance = await this.prisma.routineInstance.update({
      where: { id },
      data,
      include: INCLUDE_DIAS,
    });
    return this.toDetail(instance);
  }

  async guardarDias(instanceId: string, dias: DiaInstanciaAGuardar[]): Promise<void> {
    await this.prisma.$transaction(
      (tx) => this.escribirDias(tx, instanceId, dias),
      OPCIONES_TRANSACCION,
    );
  }

  private async escribirDias(
    tx: Prisma.TransactionClient,
    instanceId: string,
    dias: DiaInstanciaAGuardar[],
  ): Promise<void> {
    const idsConservados = dias.flatMap((dia) => (dia.id ? [dia.id] : []));
    await tx.routineInstanceDay.deleteMany({
      where: { instanceId, id: { notIn: idsConservados } },
    });
    await tx.routineInstanceDay.updateMany({
      where: { instanceId },
      data: { numero: { increment: DESPLAZAMIENTO_TEMPORAL } },
    });

    for (const [indice, dia] of dias.entries()) {
      const datos = { numero: indice + 1, vinculadoADiaId: dia.vinculadoADiaId };
      const { id: dayId } = dia.id
        ? await tx.routineInstanceDay.update({
            where: { id: dia.id },
            data: datos,
            select: { id: true },
          })
        : await tx.routineInstanceDay.create({
            data: { instanceId, ...datos },
            select: { id: true },
          });
      await tx.routineInstanceExercise.deleteMany({ where: { dayId } });
      await tx.routineInstanceExercise.createMany({
        data: dia.ejercicios.map((e) => aFilaEjercicio(dayId, e)),
      });
    }
  }

  private toDetail(instance: InstanciaConDias): RoutineInstanceDetail {
    return {
      id: instance.id,
      gymId: instance.gymId,
      profesorId: instance.profesorId,
      alumnoId: instance.alumnoId,
      nombre: instance.nombre,
      vigenteDesde: instance.vigenteDesde,
      vigenteHasta: instance.vigenteHasta,
      activa: instance.activa,
      dias: instance.dias.map((dia) => ({
        id: dia.id,
        numero: dia.numero,
        vinculadoADiaId: dia.vinculadoADiaId,
        ejercicios: dia.ejercicios.map(aEjercicioItem),
      })),
    };
  }
}
```

Run: `pnpm --filter api test -- prisma-routine-instance.repository` → Expected: PASS (4 tests).

En `prisma-routines-cleanup.adapter.ts`, reemplazar los dos comentarios que mencionan `origenTemplateId` por:

- en la rama ALUMNO: `// Días y ejercicios de RoutineInstance caen por onDelete: Cascade.`
- en la rama PROFESOR: `// Sus plantillas se borran siempre (días y ejercicios por Cascade). Los días de instancia vinculados a ellas quedan con vinculadoADiaId = null (onDelete: SetNull).`
  La lógica no cambia.

- [ ] **Step 7: Lectura de la rutina vigente con días**

`apps/api/src/routines/application/resolver-dias-de-rutina.ts`:

```ts
import { ExerciseRepositoryPort } from '../../exercise-catalog/application/ports/exercise-repository.port';
import { EjercicioItem } from './ports/routine-template-repository.port';

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

export interface RutinaVigenteDiaOutput {
  numero: number;
  ejercicios: RutinaVigenteEjercicioResuelto[];
}

export interface RutinaVigenteOutput {
  id: string;
  nombre: string;
  dias: RutinaVigenteDiaOutput[];
}

/** Resuelve nombre/media de todos los días con UN solo `findByIds`. */
export async function resolverDiasDeRutina(
  exerciseRepository: ExerciseRepositoryPort,
  dias: ReadonlyArray<{ numero: number; ejercicios: EjercicioItem[] }>,
): Promise<RutinaVigenteDiaOutput[]> {
  const ids = [...new Set(dias.flatMap((d) => d.ejercicios.map((e) => e.exerciseId)))];
  const catalogados = ids.length > 0 ? await exerciseRepository.findByIds(ids) : [];
  const porId = new Map(catalogados.map((e) => [e.id, e]));

  return dias.map((dia) => ({
    numero: dia.numero,
    ejercicios: dia.ejercicios.map((e) => {
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
  }));
}
```

Reemplazar `apps/api/src/routines/application/get-mi-rutina-vigente.use-case.ts` completo:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepositoryPort,
} from '../../exercise-catalog/application/ports/exercise-repository.port';
import {
  ROUTINE_INSTANCE_REPOSITORY,
  RoutineInstanceRepositoryPort,
} from './ports/routine-instance-repository.port';
import { RutinaVigenteOutput, resolverDiasDeRutina } from './resolver-dias-de-rutina';

export interface GetMiRutinaVigenteInput {
  invocadoPor: AuthenticatedUser;
}

/** HU-08 — el ALUMNO ve siempre SU PROPIA rutina, nunca un alumnoId externo. Sin datos de vínculo. */
@Injectable()
export class GetMiRutinaVigenteUseCase {
  constructor(
    @Inject(ROUTINE_INSTANCE_REPOSITORY)
    private readonly instanceRepository: RoutineInstanceRepositoryPort,
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
  ) {}

  async execute(input: GetMiRutinaVigenteInput): Promise<RutinaVigenteOutput | null> {
    const instancia = await this.instanceRepository.findVigentePorAlumno(input.invocadoPor.id);
    if (!instancia) {
      return null;
    }
    return {
      id: instancia.id,
      nombre: instancia.nombre,
      dias: await resolverDiasDeRutina(this.exerciseRepository, instancia.dias),
    };
  }
}
```

En `get-alumno-rutina-vigente-as-profesor.use-case.ts`: eliminar las interfaces `RutinaVigenteEjercicioResuelto`, `RutinaVigenteOutput`, `RutinaVigenteConVinculacionOutput` y el método privado `resolverRutina`; agregar, después de los imports (importando `RutinaVigenteDiaOutput` y `resolverDiasDeRutina` de `./resolver-dias-de-rutina`):

```ts
export interface VinculoDiaOutput {
  /** Id del día de plantilla: el editor del profesor lo reenvía como `vinculadoADiaId` al guardar. */
  diaId: string;
  templateId: string;
  templateNombre: string;
  numero: number;
}

export interface RutinaVigenteDiaConVinculoOutput extends RutinaVigenteDiaOutput {
  id: string;
  vinculado: VinculoDiaOutput | null;
}

/** Salida exclusiva de la vista PROFESOR — el ALUMNO no recibe datos de vínculo. */
export interface RutinaVigenteConVinculacionOutput {
  id: string;
  nombre: string;
  dias: RutinaVigenteDiaConVinculoOutput[];
}
```

y reemplazar todo lo que sigue a `if (!instancia) { return null; }` dentro de `execute` por:

```ts
const diasResueltos = await resolverDiasDeRutina(this.exerciseRepository, instancia.dias);
const idsVinculados = instancia.dias.flatMap((d) => (d.vinculadoADiaId ? [d.vinculadoADiaId] : []));
const referencias = new Map(
  (await this.templateRepository.findDiasByIds(idsVinculados)).map((r) => [r.id, r]),
);

return {
  id: instancia.id,
  nombre: instancia.nombre,
  dias: instancia.dias.map((dia, indice) => {
    const referencia = dia.vinculadoADiaId ? referencias.get(dia.vinculadoADiaId) : undefined;
    return {
      id: dia.id,
      ...diasResueltos[indice],
      vinculado: referencia
        ? {
            diaId: referencia.id,
            templateId: referencia.templateId,
            templateNombre: referencia.templateNombre,
            numero: referencia.numero,
          }
        : null,
    };
  }),
};
```

El constructor no cambia (ya inyecta `ROUTINE_TEMPLATE_REPOSITORY`).

- [ ] **Step 8: Specs de lectura**

En `get-mi-rutina-vigente.use-case.spec.ts`: reemplazar el `beforeEach` que arma el mock a mano por `instanceRepository = crearInstanceRepositoryMock();` (import de `../../test-support/repositorios-routines.mock`), cambiar el fixture a la forma nueva (sin `origenTemplateId`/`vinculada`; `ejercicios: [...]` pasa a `dias: [{ id: 'iday-1', numero: 1, vinculadoADiaId: null, ejercicios: [...mismos ejercicios] }]`) y ajustar la aserción de salida para esperar `dias: [{ numero: 1, ejercicios: [...] }]`. Agregar este test:

```ts
it('resuelve los ejercicios de todos los días con un solo findByIds, sin duplicar ids', async () => {
  instanceRepository.findVigentePorAlumno.mockResolvedValue({
    ...instancia,
    dias: [
      {
        id: 'd1',
        numero: 1,
        vinculadoADiaId: null,
        ejercicios: [
          { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, peso: null, notas: null },
        ],
      },
      {
        id: 'd2',
        numero: 2,
        vinculadoADiaId: 'tday-9',
        ejercicios: [
          { exerciseId: 'ex-1', orden: 1, series: 4, repeticiones: 8, peso: null, notas: null },
        ],
      },
    ],
  });
  exerciseRepository.findByIds.mockResolvedValue([
    {
      id: 'ex-1',
      nombre: 'Sentadilla',
      imageUrl: null,
      gifUrl: null,
      parteCuerpo: 'p',
      grupoMuscular: 'g',
      equipamiento: null,
    },
  ]);

  const salida = await useCase.execute({ invocadoPor: alumno });

  expect(exerciseRepository.findByIds).toHaveBeenCalledTimes(1);
  expect(exerciseRepository.findByIds).toHaveBeenCalledWith(['ex-1']);
  expect(salida?.dias.map((d) => [d.numero, d.ejercicios[0].series])).toEqual([
    [1, 3],
    [2, 4],
  ]);
  expect(JSON.stringify(salida)).not.toContain('tday-9');
});
```

(`instancia`, `alumno`, `exerciseRepository` y `useCase` son las variables que ya declara el spec; si alguna tiene otro nombre, usar la existente.)

En `get-alumno-rutina-vigente-as-profesor.use-case.spec.ts`: usar `crearInstanceRepositoryMock()` / `crearTemplateRepositoryMock()`, pasar los fixtures a la forma nueva (`template.dias: []`), eliminar los tests que dependen de `vinculada`/`origenTemplateId`, y agregar:

```ts
it('informa por día a qué plantilla y día está vinculado, y null en los independientes', async () => {
  userRepository.findById.mockResolvedValue(alumno);
  carteraRepository.existe.mockResolvedValue(true);
  instanceRepository.findVigentePorAlumno.mockResolvedValue({
    ...instancia,
    dias: [
      { id: 'd1', numero: 1, vinculadoADiaId: 'tday-2', ejercicios: instancia.dias[0].ejercicios },
      { id: 'd2', numero: 2, vinculadoADiaId: null, ejercicios: instancia.dias[0].ejercicios },
    ],
  });
  templateRepository.findDiasByIds.mockResolvedValue([
    {
      id: 'tday-2',
      numero: 3,
      templateId: 'tpl-1',
      templateNombre: 'Piernas',
      profesorId: 'prof-1',
      gymId: 'gym-1',
      exerciseIds: ['ex-1'],
    },
  ]);
  exerciseRepository.findByIds.mockResolvedValue([ejercicioResuelto]);

  const salida = await useCase.execute({ invocadoPor: profesor, alumnoId: 'alum-1' });

  expect(templateRepository.findDiasByIds).toHaveBeenCalledWith(['tday-2']);
  expect(salida?.dias.map((d) => [d.id, d.numero, d.vinculado])).toEqual([
    ['d1', 1, { diaId: 'tday-2', templateId: 'tpl-1', templateNombre: 'Piernas', numero: 3 }],
    ['d2', 2, null],
  ]);
});
```

(con `instancia.dias = [{ id: 'd0', numero: 1, vinculadoADiaId: null, ejercicios: [<el ejercicio ex-1 del fixture actual>] }]`). En el `beforeEach`, agregar `templateRepository.findDiasByIds.mockResolvedValue([]);` para que los tests que llegan al final del caso de uso no reciban `undefined`. Mantener los tests existentes de cartera/404/rol ajustando solo fixtures.

En `create-`, `list-`, `get-`, `update-`, `delete-routine-template.use-case.spec.ts` y `update-routine-instance.use-case.spec.ts`: reemplazar los mocks armados a mano por `crearTemplateRepositoryMock()` / `crearInstanceRepositoryMock()` y los fixtures `ejercicios: []` por `dias: []` (quitando `origenTemplateId`/`vinculada` de los de instancia). Ninguna aserción de comportamiento cambia.

- [ ] **Step 9: Quitar las rutas de escritura viejas**

Borrar:

```bash
git rm apps/api/src/routines/application/replace-template-exercises.use-case.ts apps/api/src/routines/application/replace-template-exercises.use-case.spec.ts apps/api/src/routines/application/replace-instance-exercises.use-case.ts apps/api/src/routines/application/replace-instance-exercises.use-case.spec.ts apps/api/src/routines/application/merge-ejercicios-vinculados.ts apps/api/src/routines/application/merge-ejercicios-vinculados.spec.ts apps/api/src/routines/application/assign-routine-to-alumno.use-case.ts apps/api/src/routines/application/assign-routine-to-alumno.use-case.spec.ts apps/api/src/routines/application/errors/template-has-no-exercises.error.ts apps/api/src/routines/infrastructure/http/dto/replace-exercises.dto.ts apps/api/src/routines/infrastructure/http/dto/create-routine-instance.dto.ts apps/api/src/routines/infrastructure/http/routine-instances.controller.e2e.spec.ts
```

- `routine-templates.controller.ts`: quitar el endpoint `@Put(':id/exercises')`, su inyección `ReplaceTemplateExercisesUseCase` y los imports de `ReplaceExercisesDto`/`toEjercicioItems`/`Put`/`HttpCode` que queden sin uso (`HttpCode` sigue usándose en `delete`).
- `routine-instances.controller.ts`: dejar solo `@Patch(':id')` con `UpdateRoutineInstanceUseCase`; quitar `@Post()`, `@Put(':id/exercises')` e imports sin uso.
- `routines.module.ts`: quitar `ReplaceTemplateExercisesUseCase`, `ReplaceInstanceExercisesUseCase` y `AssignRoutineToAlumnoUseCase` de imports y `providers`.
- `routine-templates.controller.e2e.spec.ts`: fixture `templateBase` con `dias: []` en vez de `ejercicios: []`; `fakeTemplateRepository` agrega `findDiasByIds: jest.fn(async () => [])` y `guardarDias: jest.fn(async () => undefined)` y quita `replaceExercises`; `fakeInstanceRepository` pasa a `Pick<RoutineInstanceRepositoryPort, 'findActivasConDiasVinculadosA'>` con `findActivasConDiasVinculadosA: jest.fn(async () => [])`; quitar `ReplaceTemplateExercisesUseCase` de providers/imports; borrar el test `'rechaza más de 50 ejercicios en el replace-all (400, ValidationPipe)'` (vuelve en la Tarea 5 sobre `/dias`).
- `routines.controller.e2e.spec.ts`: los fakes devuelven `dias: []` en vez de `ejercicios: []`.

- [ ] **Step 10: Verificación y commit**

Run: `pnpm --filter api build` → Expected: OK.
Run: `pnpm --filter api test` → Expected: PASS.
Run: `grep -rn "vinculada\|origenTemplateId\|replaceExercises\|marcarDesvinculada" apps/api/src` → Expected: sin resultados.

```bash
git add -A apps/api/src
git commit -m "feat(routines): puertos y repositorios con días; lectura de rutina vigente por día"
```

---

### Task 5: Guardar días de plantilla con propagación atómica

**Files:**

- Create: `apps/api/src/routines/application/replace-template-days.use-case.ts` (+ `.spec.ts`)
- Create: `apps/api/src/routines/infrastructure/http/dto/dia.dto.ts`, `dia.mapper.ts`, `replace-template-days.dto.ts`
- Modify: `apps/api/src/routines/infrastructure/http/routine-templates.controller.ts`
- Modify: `apps/api/src/routines/routines.module.ts`
- Modify: `apps/api/src/routines/infrastructure/http/routine-templates.controller.e2e.spec.ts`

**Interfaces:**

- Consumes: `validarDias`, `mergeDiaVinculado`, `validarExerciseIdsEnCatalogo`, `RoutineDayNotFoundError` (Tarea 2); puertos (Tarea 4).
- Produces: `ReplaceTemplateDaysUseCase.execute({ invocadoPor: AuthenticatedUser; templateId: string; dias: DiaPlantillaAGuardar[] }): Promise<void>`; endpoint `PUT /routine-templates/:id/dias` (204) con body `{ dias: [{ id?: string, ejercicios: EjercicioDto[] }] }`; DTOs `DiaPlantillaDto`, `DiaInstanciaDto`, `DiaNuevoDto`; mappers `toDiasPlantilla`, `toDiasInstancia`, `toDiasNuevos` (los dos últimos los usa la Tarea 6).

- [ ] **Step 1: Spec del caso de uso (falla)**

`apps/api/src/routines/application/replace-template-days.use-case.spec.ts`:

```ts
import { Role } from '../../identity/domain/role';
import { ExerciseRepositoryPort } from '../../exercise-catalog/application/ports/exercise-repository.port';
import {
  crearInstanceRepositoryMock,
  crearTemplateRepositoryMock,
} from '../../test-support/repositorios-routines.mock';
import { ReplaceTemplateDaysUseCase } from './replace-template-days.use-case';
import { EjercicioItem, RoutineTemplateDetail } from './ports/routine-template-repository.port';
import { RoutineInstanceDetail } from './ports/routine-instance-repository.port';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';
import { RoutineDayNotFoundError } from './errors/routine-day-not-found.error';
import { EmptyDayError } from './errors/empty-day.error';
import { InvalidExerciseIdError } from './errors/invalid-exercise-id.error';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';

function ej(exerciseId: string, orden: number, series = 4): EjercicioItem {
  return { exerciseId, orden, series, repeticiones: 12, peso: 50, notas: null };
}

describe('ReplaceTemplateDaysUseCase', () => {
  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  let templateRepository: ReturnType<typeof crearTemplateRepositoryMock>;
  let instanceRepository: ReturnType<typeof crearInstanceRepositoryMock>;
  let exerciseRepository: jest.Mocked<Pick<ExerciseRepositoryPort, 'findByIds'>>;
  let useCase: ReplaceTemplateDaysUseCase;

  const plantilla: RoutineTemplateDetail = {
    id: 'tpl-1',
    gymId: 'gym-1',
    profesorId: 'prof-1',
    nombre: 'Split',
    descripcion: null,
    activa: true,
    dias: [
      { id: 'tday-1', numero: 1, ejercicios: [ej('ex-1', 1)] },
      { id: 'tday-2', numero: 2, ejercicios: [ej('ex-2', 1)] },
    ],
  };

  function instanciaCon(dias: RoutineInstanceDetail['dias']): RoutineInstanceDetail {
    return {
      id: 'inst-1',
      gymId: 'gym-1',
      profesorId: 'prof-1',
      alumnoId: 'alum-1',
      nombre: 'R',
      vigenteDesde: new Date(),
      vigenteHasta: null,
      activa: true,
      dias,
    };
  }

  beforeEach(() => {
    templateRepository = crearTemplateRepositoryMock();
    instanceRepository = crearInstanceRepositoryMock();
    exerciseRepository = {
      findByIds: jest.fn(async (ids: string[]) => ids.map((id) => ({ id }))),
    } as unknown as jest.Mocked<Pick<ExerciseRepositoryPort, 'findByIds'>>;
    templateRepository.findById.mockResolvedValue(plantilla);
    instanceRepository.findActivasConDiasVinculadosA.mockResolvedValue([]);
    useCase = new ReplaceTemplateDaysUseCase(
      templateRepository,
      instanceRepository,
      exerciseRepository as unknown as ExerciseRepositoryPort,
    );
  });

  it('solo PROFESOR', async () => {
    await expect(
      useCase.execute({
        invocadoPor: { ...profesor, role: Role.ADMIN },
        templateId: 'tpl-1',
        dias: [],
      }),
    ).rejects.toThrow(InsufficientRoleError);
  });

  it('plantilla de otro profesor → 404', async () => {
    await expect(
      useCase.execute({
        invocadoPor: { ...profesor, id: 'prof-2' },
        templateId: 'tpl-1',
        dias: [],
      }),
    ).rejects.toThrow(RoutineTemplateNotFoundError);
  });

  it('valida los días (día vacío → 400) antes de escribir', async () => {
    await expect(
      useCase.execute({ invocadoPor: profesor, templateId: 'tpl-1', dias: [{ ejercicios: [] }] }),
    ).rejects.toThrow(EmptyDayError);
    expect(templateRepository.guardarDias).not.toHaveBeenCalled();
  });

  it('un id de día que no es de esta plantilla → 404', async () => {
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        templateId: 'tpl-1',
        dias: [{ id: 'tday-ajeno', ejercicios: [ej('ex-1', 1)] }],
      }),
    ).rejects.toThrow(RoutineDayNotFoundError);
  });

  it('ejercicio inexistente en el catálogo → 400', async () => {
    exerciseRepository.findByIds.mockResolvedValue([]);
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        templateId: 'tpl-1',
        dias: [{ ejercicios: [ej('ex-x', 1)] }],
      }),
    ).rejects.toThrow(InvalidExerciseIdError);
  });

  it('propaga a los días de alumno vinculados conservando sus valores, en la misma llamada a guardarDias', async () => {
    instanceRepository.findActivasConDiasVinculadosA.mockResolvedValue([
      instanciaCon([
        { id: 'iday-1', numero: 1, vinculadoADiaId: 'tday-1', ejercicios: [ej('ex-1', 1, 3)] },
        { id: 'iday-2', numero: 2, vinculadoADiaId: 'tday-2', ejercicios: [ej('ex-2', 1, 5)] },
        { id: 'iday-3', numero: 3, vinculadoADiaId: null, ejercicios: [ej('ex-9', 1)] },
      ]),
    ]);
    const nuevosDias = [
      { id: 'tday-1', ejercicios: [ej('ex-1', 1), ej('ex-2', 2)] },
      { id: 'tday-2', ejercicios: [ej('ex-3', 1)] },
    ];

    await useCase.execute({ invocadoPor: profesor, templateId: 'tpl-1', dias: nuevosDias });

    expect(instanceRepository.findActivasConDiasVinculadosA).toHaveBeenCalledWith([
      'tday-1',
      'tday-2',
    ]);
    expect(templateRepository.guardarDias).toHaveBeenCalledTimes(1);
    const [templateId, dias, propagacion] = templateRepository.guardarDias.mock.calls[0];
    expect(templateId).toBe('tpl-1');
    expect(dias).toBe(nuevosDias);
    expect(propagacion).toEqual([
      // ex-2 pasó del Día 2 al Día 1 en la plantilla: conserva series 5 del alumno (prioridad 2)
      { diaInstanciaId: 'iday-1', ejercicios: [ej('ex-1', 1, 3), ej('ex-2', 2, 5)] },
      { diaInstanciaId: 'iday-2', ejercicios: [ej('ex-3', 1)] },
    ]);
  });

  it('no propaga a días de alumno cuyo día de plantilla se borra en este guardado (SetNull los desvincula)', async () => {
    instanceRepository.findActivasConDiasVinculadosA.mockResolvedValue([
      instanciaCon([
        { id: 'iday-2', numero: 1, vinculadoADiaId: 'tday-2', ejercicios: [ej('ex-2', 1)] },
      ]),
    ]);

    await useCase.execute({
      invocadoPor: profesor,
      templateId: 'tpl-1',
      dias: [{ id: 'tday-1', ejercicios: [ej('ex-1', 1)] }],
    });

    expect(templateRepository.guardarDias.mock.calls[0][2]).toEqual([]);
  });

  it('plantilla sin días previos no busca instancias', async () => {
    templateRepository.findById.mockResolvedValue({ ...plantilla, dias: [] });
    await useCase.execute({
      invocadoPor: profesor,
      templateId: 'tpl-1',
      dias: [{ ejercicios: [ej('ex-1', 1)] }],
    });
    expect(instanceRepository.findActivasConDiasVinculadosA).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm --filter api test -- replace-template-days` → Expected: FAIL.

- [ ] **Step 2: Implementar el caso de uso**

`apps/api/src/routines/application/replace-template-days.use-case.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../identity/domain/role';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepositoryPort,
} from '../../exercise-catalog/application/ports/exercise-repository.port';
import {
  ActualizacionDiaVinculado,
  DiaPlantillaAGuardar,
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateDetail,
  RoutineTemplateRepositoryPort,
} from './ports/routine-template-repository.port';
import {
  ROUTINE_INSTANCE_REPOSITORY,
  RoutineInstanceRepositoryPort,
} from './ports/routine-instance-repository.port';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';
import { RoutineDayNotFoundError } from './errors/routine-day-not-found.error';
import { validarDias } from './dias/validar-dias';
import { mergeDiaVinculado } from './dias/merge-dia-vinculado';
import { validarExerciseIdsEnCatalogo } from './validar-exercise-ids';

export interface ReplaceTemplateDaysInput {
  invocadoPor: AuthenticatedUser;
  templateId: string;
  dias: DiaPlantillaAGuardar[];
}

const ROLES_QUE_PUEDEN_EDITAR: Role[] = [Role.PROFESOR];

@Injectable()
export class ReplaceTemplateDaysUseCase {
  constructor(
    @Inject(ROUTINE_TEMPLATE_REPOSITORY)
    private readonly templateRepository: RoutineTemplateRepositoryPort,
    @Inject(ROUTINE_INSTANCE_REPOSITORY)
    private readonly instanceRepository: RoutineInstanceRepositoryPort,
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
  ) {}

  async execute(input: ReplaceTemplateDaysInput): Promise<void> {
    if (!ROLES_QUE_PUEDEN_EDITAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_EDITAR);
    }

    const template = await this.templateRepository.findById(input.templateId);
    if (!template || template.profesorId !== input.invocadoPor.id) {
      throw new RoutineTemplateNotFoundError(input.templateId);
    }

    validarDias(input.dias);
    const idsExistentes = new Set(template.dias.map((d) => d.id));
    for (const dia of input.dias) {
      if (dia.id && !idsExistentes.has(dia.id)) {
        throw new RoutineDayNotFoundError(dia.id);
      }
    }
    await validarExerciseIdsEnCatalogo(
      this.exerciseRepository,
      input.dias.flatMap((d) => d.ejercicios),
    );

    const propagacion = await this.calcularPropagacion(template, input.dias);
    await this.templateRepository.guardarDias(template.id, input.dias, propagacion);
  }

  private async calcularPropagacion(
    template: RoutineTemplateDetail,
    dias: DiaPlantillaAGuardar[],
  ): Promise<ActualizacionDiaVinculado[]> {
    const idsDiasPlantilla = template.dias.map((d) => d.id);
    if (idsDiasPlantilla.length === 0) return [];

    const deEstaPlantilla = new Set(idsDiasPlantilla);
    const diasNuevosPorId = new Map(dias.flatMap((d) => (d.id ? [[d.id, d] as const] : [])));
    const instancias =
      await this.instanceRepository.findActivasConDiasVinculadosA(idsDiasPlantilla);

    const actualizaciones: ActualizacionDiaVinculado[] = [];
    for (const instancia of instancias) {
      const vinculados = instancia.dias.filter(
        (d) => d.vinculadoADiaId !== null && deEstaPlantilla.has(d.vinculadoADiaId),
      );
      for (const diaInstancia of vinculados) {
        const diaPlantilla = diasNuevosPorId.get(diaInstancia.vinculadoADiaId!);
        if (!diaPlantilla) continue;
        actualizaciones.push({
          diaInstanciaId: diaInstancia.id,
          ejercicios: mergeDiaVinculado({
            ejerciciosDiaPlantilla: diaPlantilla.ejercicios,
            ejerciciosDiaInstancia: diaInstancia.ejercicios,
            ejerciciosOtrosDiasVinculados: vinculados
              .filter((otro) => otro.id !== diaInstancia.id)
              .map((otro) => otro.ejercicios),
          }),
        });
      }
    }
    return actualizaciones;
  }
}
```

Run: `pnpm --filter api test -- replace-template-days` → Expected: PASS (8 tests).

- [ ] **Step 3: DTOs y mappers**

`apps/api/src/routines/infrastructure/http/dto/dia.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { EjercicioDto } from './ejercicio.dto';

/** El mínimo de 1 ejercicio por día y el total de 50 los valida `validarDias` en el caso de uso. */
export class DiaPlantillaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  id?: string;

  @ValidateNested({ each: true })
  @Type(() => EjercicioDto)
  @ArrayMaxSize(50)
  ejercicios!: EjercicioDto[];
}

export class DiaInstanciaDto extends DiaPlantillaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  vinculadoADiaId?: string;
}

/** Días de una rutina nueva: nunca traen `id`. */
export class DiaNuevoDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  vinculadoADiaId?: string;

  @ValidateNested({ each: true })
  @Type(() => EjercicioDto)
  @ArrayMaxSize(50)
  ejercicios!: EjercicioDto[];
}
```

`apps/api/src/routines/infrastructure/http/dto/replace-template-days.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { DiaPlantillaDto } from './dia.dto';

export class ReplaceTemplateDaysDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiaPlantillaDto)
  @ArrayMaxSize(7)
  dias!: DiaPlantillaDto[];
}
```

`apps/api/src/routines/infrastructure/http/dto/dia.mapper.ts`:

```ts
import { DiaPlantillaAGuardar } from '../../../application/ports/routine-template-repository.port';
import { EjercicioItem } from '../../../application/ports/routine-template-repository.port';
import { DiaInstanciaDto, DiaNuevoDto, DiaPlantillaDto } from './dia.dto';
import { toEjercicioItems } from './ejercicio.mapper';

export function toDiasPlantilla(dtos: DiaPlantillaDto[]): DiaPlantillaAGuardar[] {
  return dtos.map((dto) => ({
    ...(dto.id ? { id: dto.id } : {}),
    ejercicios: toEjercicioItems(dto.ejercicios),
  }));
}

export interface DiaInstanciaPedido {
  id?: string;
  vinculadoADiaId?: string;
  ejercicios: EjercicioItem[];
}

export function toDiasInstancia(dtos: DiaInstanciaDto[]): DiaInstanciaPedido[] {
  return dtos.map((dto) => ({
    ...(dto.id ? { id: dto.id } : {}),
    ...(dto.vinculadoADiaId ? { vinculadoADiaId: dto.vinculadoADiaId } : {}),
    ejercicios: toEjercicioItems(dto.ejercicios),
  }));
}

export function toDiasNuevos(dtos: DiaNuevoDto[]): Omit<DiaInstanciaPedido, 'id'>[] {
  return dtos.map((dto) => ({
    ...(dto.vinculadoADiaId ? { vinculadoADiaId: dto.vinculadoADiaId } : {}),
    ejercicios: toEjercicioItems(dto.ejercicios),
  }));
}
```

- [ ] **Step 4: Endpoint, módulo y e2e**

En `routine-templates.controller.ts`: inyectar `private readonly replaceDaysUseCase: ReplaceTemplateDaysUseCase` y agregar (importando `Put`, `ReplaceTemplateDaysDto`, `toDiasPlantilla`):

```ts
  @Put(':id/dias')
  @HttpCode(204)
  async replaceDias(
    @Param('id') id: string,
    @Body() dto: ReplaceTemplateDaysDto,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    await this.replaceDaysUseCase.execute({
      invocadoPor: req.user,
      templateId: id,
      dias: toDiasPlantilla(dto.dias),
    });
  }
```

En `routines.module.ts`: importar y agregar `ReplaceTemplateDaysUseCase` a `providers`.

En `routine-templates.controller.e2e.spec.ts`: agregar `ReplaceTemplateDaysUseCase` a providers y estos tests:

```ts
it('PUT /:id/dias guarda los días (204)', async () => {
  const token = await firmarTokenPara('auth-prof');
  await request(app.getHttpServer())
    .put('/routine-templates/tpl-1/dias')
    .set('Authorization', `Bearer ${token}`)
    .send({
      dias: [{ ejercicios: [{ exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10 }] }],
    })
    .expect(204);
  expect(fakeTemplateRepository.guardarDias).toHaveBeenCalledWith(
    'tpl-1',
    [
      {
        ejercicios: [
          { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, peso: null, notas: null },
        ],
      },
    ],
    [],
  );
});

it('rechaza 8 días (400, ValidationPipe)', async () => {
  const token = await firmarTokenPara('auth-prof');
  const dia = { ejercicios: [{ exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10 }] };
  await request(app.getHttpServer())
    .put('/routine-templates/tpl-1/dias')
    .set('Authorization', `Bearer ${token}`)
    .send({ dias: Array.from({ length: 8 }, () => dia) })
    .expect(400);
});

it('rechaza un día vacío (400, EmptyDayError)', async () => {
  const token = await firmarTokenPara('auth-prof');
  const res = await request(app.getHttpServer())
    .put('/routine-templates/tpl-1/dias')
    .set('Authorization', `Bearer ${token}`)
    .send({ dias: [{ ejercicios: [] }] })
    .expect(400);
  expect(res.body.error).toBe('EmptyDayError');
});

it('rechaza campos desconocidos en un día (400, forbidNonWhitelisted)', async () => {
  const token = await firmarTokenPara('auth-prof');
  await request(app.getHttpServer())
    .put('/routine-templates/tpl-1/dias')
    .set('Authorization', `Bearer ${token}`)
    .send({
      dias: [
        { numero: 1, ejercicios: [{ exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10 }] },
      ],
    })
    .expect(400);
});
```

Run: `pnpm --filter api test -- routine-templates.controller` → Expected: PASS.

- [ ] **Step 5: Verificación y commit**

Run: `pnpm --filter api test` → PASS. Run: `pnpm --filter api build` → OK.

```bash
git add apps/api/src/routines
git commit -m "feat(routines): guardar días de plantilla con propagación atómica a alumnos vinculados"
```

---

### Task 6: Asignar rutina y editar días de la rutina del alumno

**Files:**

- Create: `apps/api/src/routines/application/dias/resolver-vinculos-pedidos.ts`
- Create: `apps/api/src/routines/application/assign-routine-to-alumno.use-case.ts` (+ spec)
- Create: `apps/api/src/routines/application/replace-instance-days.use-case.ts` (+ spec)
- Modify: `apps/api/src/routines/application/errors/invalid-routine-instance-input.error.ts`
- Create: `apps/api/src/routines/infrastructure/http/dto/create-routine-instance.dto.ts`, `replace-instance-days.dto.ts`
- Modify: `apps/api/src/routines/infrastructure/http/routine-instances.controller.ts`, `routines.module.ts`
- Create: `apps/api/src/routines/infrastructure/http/routine-instances.controller.e2e.spec.ts`

**Interfaces:**

- Consumes: `resolverVinculoDeDia`, `validarDias`, `validarExerciseIdsEnCatalogo`, `RoutineDayNotFoundError` (Tarea 2); puertos (Tarea 4); `DiaInstanciaPedido`, `toDiasInstancia`, `toDiasNuevos`, `DiaInstanciaDto`, `DiaNuevoDto` (Tarea 5).
- Produces:
  - `resolverVinculosPedidos(repo: RoutineTemplateRepositoryPort, invocadoPor: { id: string; gymId: string }, dias: Array<{ vinculadoADiaId?: string; anterior: string | null; ejercicios: EjercicioItem[] }>): Promise<{ vinculos: Array<string | null>; referencias: Map<string, DiaPlantillaReferencia> }>`
  - `AssignRoutineToAlumnoUseCase.execute({ invocadoPor; alumnoId; nombre?: string; dias: Array<{ vinculadoADiaId?: string; ejercicios: EjercicioItem[] }> }): Promise<RoutineInstanceDetail>`
  - `ReplaceInstanceDaysUseCase.execute({ invocadoPor; instanceId; dias: DiaInstanciaPedido[] }): Promise<{ diasDesvinculados: number[] }>`
  - `POST /routine-instances` (201) body `{ alumnoId, nombre?, dias: DiaNuevoDto[] }`; `PUT /routine-instances/:id/dias` (200) body `{ dias: DiaInstanciaDto[] }` → `{ diasDesvinculados: number[] }`.

- [ ] **Step 1: Resolución de vínculos pedidos (compartida por asignar y editar)**

`apps/api/src/routines/application/dias/resolver-vinculos-pedidos.ts`:

```ts
import {
  DiaPlantillaReferencia,
  EjercicioItem,
  RoutineTemplateRepositoryPort,
} from '../ports/routine-template-repository.port';
import { resolverVinculoDeDia } from './resolver-vinculo-de-dia';

export interface DiaConPedidoDeVinculo {
  vinculadoADiaId?: string;
  anterior: string | null;
  ejercicios: EjercicioItem[];
}

/** Un solo `findDiasByIds` para todos los días pedidos, y la regla de vínculo aplicada a cada uno. */
export async function resolverVinculosPedidos(
  templateRepository: RoutineTemplateRepositoryPort,
  invocadoPor: { id: string; gymId: string },
  dias: DiaConPedidoDeVinculo[],
): Promise<{ vinculos: Array<string | null>; referencias: Map<string, DiaPlantillaReferencia> }> {
  const pedidos = [...new Set(dias.flatMap((d) => (d.vinculadoADiaId ? [d.vinculadoADiaId] : [])))];
  const referencias = new Map(
    (await templateRepository.findDiasByIds(pedidos)).map((r) => [r.id, r]),
  );

  const vinculos = dias.map((dia) => {
    const referencia = dia.vinculadoADiaId ? referencias.get(dia.vinculadoADiaId) : undefined;
    return resolverVinculoDeDia({
      pedido: dia.vinculadoADiaId,
      anterior: dia.anterior,
      exerciseIdsDelDia: dia.ejercicios.map((e) => e.exerciseId),
      diaPlantilla: referencia && {
        id: referencia.id,
        exerciseIds: referencia.exerciseIds,
        esDelInvocador:
          referencia.profesorId === invocadoPor.id && referencia.gymId === invocadoPor.gymId,
      },
    });
  });

  return { vinculos, referencias };
}
```

Reemplazar el mensaje de `InvalidRoutineInstanceInputError` (el constructor queda sin parámetros):

```ts
super('Una rutina nueva necesita al menos un día con ejercicios y un nombre.');
```

- [ ] **Step 2: Spec de asignación (falla)**

`apps/api/src/routines/application/assign-routine-to-alumno.use-case.spec.ts`:

```ts
import { Role } from '../../identity/domain/role';
import { CarteraRepositoryPort } from '../../identity/application/ports/cartera-repository.port';
import {
  UserRecord,
  UserRepositoryPort,
} from '../../identity/application/ports/user-repository.port';
import { ExerciseRepositoryPort } from '../../exercise-catalog/application/ports/exercise-repository.port';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import {
  crearInstanceRepositoryMock,
  crearTemplateRepositoryMock,
} from '../../test-support/repositorios-routines.mock';
import { AssignRoutineToAlumnoUseCase } from './assign-routine-to-alumno.use-case';
import { EjercicioItem } from './ports/routine-template-repository.port';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';
import { InvalidRoutineInstanceInputError } from './errors/invalid-routine-instance-input.error';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';
import { TooManyDaysError } from './errors/too-many-days.error';

function ej(exerciseId: string, orden = 1): EjercicioItem {
  return { exerciseId, orden, series: 3, repeticiones: 10, peso: null, notas: null };
}

describe('AssignRoutineToAlumnoUseCase', () => {
  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const alumno: UserRecord = {
    id: 'alum-1',
    authUserId: 'auth-alum',
    gymId: 'gym-1',
    username: 'juan.perez',
    nombre: 'Juan',
    role: Role.ALUMNO,
    activo: true,
  };
  const refPiernas = {
    id: 'tday-1',
    numero: 1,
    templateId: 'tpl-1',
    templateNombre: 'Piernas',
    profesorId: 'prof-1',
    gymId: 'gym-1',
    exerciseIds: ['ex-1'],
  };

  let instanceRepository: ReturnType<typeof crearInstanceRepositoryMock>;
  let templateRepository: ReturnType<typeof crearTemplateRepositoryMock>;
  let carteraRepository: jest.Mocked<Pick<CarteraRepositoryPort, 'existe'>>;
  let userRepository: jest.Mocked<Pick<UserRepositoryPort, 'findById'>>;
  let exerciseRepository: jest.Mocked<Pick<ExerciseRepositoryPort, 'findByIds'>>;
  let useCase: AssignRoutineToAlumnoUseCase;

  beforeEach(() => {
    instanceRepository = crearInstanceRepositoryMock();
    templateRepository = crearTemplateRepositoryMock();
    carteraRepository = { existe: jest.fn().mockResolvedValue(true) };
    userRepository = { findById: jest.fn().mockResolvedValue(alumno) };
    exerciseRepository = {
      findByIds: jest.fn(async (ids: string[]) => ids.map((id) => ({ id }))),
    } as unknown as jest.Mocked<Pick<ExerciseRepositoryPort, 'findByIds'>>;
    templateRepository.findDiasByIds.mockResolvedValue([]);
    instanceRepository.crear.mockImplementation(async (data) => ({
      id: 'inst-nueva',
      gymId: data.gymId,
      profesorId: data.profesorId,
      alumnoId: data.alumnoId,
      nombre: data.nombre,
      vigenteDesde: new Date(),
      vigenteHasta: null,
      activa: true,
      dias: data.dias.map((d, i) => ({
        id: `d${i}`,
        numero: i + 1,
        vinculadoADiaId: d.vinculadoADiaId,
        ejercicios: d.ejercicios,
      })),
    }));
    useCase = new AssignRoutineToAlumnoUseCase(
      instanceRepository,
      templateRepository,
      carteraRepository as unknown as CarteraRepositoryPort,
      userRepository as unknown as UserRepositoryPort,
      exerciseRepository as unknown as ExerciseRepositoryPort,
    );
  });

  it('solo PROFESOR', async () => {
    await expect(
      useCase.execute({
        invocadoPor: { ...profesor, role: Role.ADMIN },
        alumnoId: 'alum-1',
        nombre: 'R',
        dias: [{ ejercicios: [ej('ex-1')] }],
      }),
    ).rejects.toThrow(InsufficientRoleError);
  });

  it('sin días → 400', async () => {
    await expect(
      useCase.execute({ invocadoPor: profesor, alumnoId: 'alum-1', nombre: 'R', dias: [] }),
    ).rejects.toThrow(InvalidRoutineInstanceInputError);
  });

  it('alumno fuera de la cartera → 403', async () => {
    carteraRepository.existe.mockResolvedValue(false);
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        alumnoId: 'alum-1',
        nombre: 'R',
        dias: [{ ejercicios: [ej('ex-1')] }],
      }),
    ).rejects.toThrow(AlumnoNotInCarteraError);
  });

  it('valida límites de días', async () => {
    const dias = Array.from({ length: 8 }, (_, i) => ({ ejercicios: [ej(`ex-${i}`)] }));
    await expect(
      useCase.execute({ invocadoPor: profesor, alumnoId: 'alum-1', nombre: 'R', dias }),
    ).rejects.toThrow(TooManyDaysError);
  });

  it('combina días vinculados y desde cero, y aplica la regla de vínculo', async () => {
    templateRepository.findDiasByIds.mockResolvedValue([refPiernas]);

    await useCase.execute({
      invocadoPor: profesor,
      alumnoId: 'alum-1',
      nombre: 'Mi split',
      dias: [
        { vinculadoADiaId: 'tday-1', ejercicios: [ej('ex-1')] },
        { vinculadoADiaId: 'tday-1', ejercicios: [ej('ex-1'), ej('ex-2', 2)] },
        { ejercicios: [ej('ex-3')] },
      ],
    });

    expect(templateRepository.findDiasByIds).toHaveBeenCalledWith(['tday-1']);
    expect(instanceRepository.crear.mock.calls[0][0].dias.map((d) => d.vinculadoADiaId)).toEqual([
      'tday-1',
      null,
      null,
    ]);
  });

  it('vincular a un día de plantilla ajena → 404', async () => {
    templateRepository.findDiasByIds.mockResolvedValue([{ ...refPiernas, profesorId: 'prof-2' }]);
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        alumnoId: 'alum-1',
        nombre: 'R',
        dias: [{ vinculadoADiaId: 'tday-1', ejercicios: [ej('ex-1')] }],
      }),
    ).rejects.toThrow(RoutineTemplateNotFoundError);
  });

  it('sin nombre y todos los días vinculados a la misma plantilla → usa el nombre de la plantilla', async () => {
    templateRepository.findDiasByIds.mockResolvedValue([refPiernas]);
    await useCase.execute({
      invocadoPor: profesor,
      alumnoId: 'alum-1',
      dias: [{ vinculadoADiaId: 'tday-1', ejercicios: [ej('ex-1')] }],
    });
    expect(instanceRepository.crear.mock.calls[0][0].nombre).toBe('Piernas');
  });

  it('sin nombre y algún día independiente → 400', async () => {
    templateRepository.findDiasByIds.mockResolvedValue([refPiernas]);
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        alumnoId: 'alum-1',
        dias: [
          { vinculadoADiaId: 'tday-1', ejercicios: [ej('ex-1')] },
          { ejercicios: [ej('ex-2')] },
        ],
      }),
    ).rejects.toThrow(InvalidRoutineInstanceInputError);
  });
});
```

Run: `pnpm --filter api test -- assign-routine-to-alumno` → Expected: FAIL.

- [ ] **Step 3: Implementar la asignación**

`apps/api/src/routines/application/assign-routine-to-alumno.use-case.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../identity/domain/role';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import {
  CARTERA_REPOSITORY,
  CarteraRepositoryPort,
} from '../../identity/application/ports/cartera-repository.port';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
} from '../../identity/application/ports/user-repository.port';
import { resolveUserInGym } from '../../identity/application/resolve-user-in-gym';
import { requireGymId } from '../../identity/application/require-gym-id';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepositoryPort,
} from '../../exercise-catalog/application/ports/exercise-repository.port';
import {
  DiaPlantillaReferencia,
  EjercicioItem,
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateRepositoryPort,
} from './ports/routine-template-repository.port';
import {
  ROUTINE_INSTANCE_REPOSITORY,
  RoutineInstanceDetail,
  RoutineInstanceRepositoryPort,
} from './ports/routine-instance-repository.port';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';
import { InvalidRoutineInstanceInputError } from './errors/invalid-routine-instance-input.error';
import { validarDias } from './dias/validar-dias';
import { resolverVinculosPedidos } from './dias/resolver-vinculos-pedidos';
import { validarExerciseIdsEnCatalogo } from './validar-exercise-ids';

export interface AssignRoutineToAlumnoInput {
  invocadoPor: AuthenticatedUser;
  alumnoId: string;
  nombre?: string;
  dias: Array<{ vinculadoADiaId?: string; ejercicios: EjercicioItem[] }>;
}

const ROLES_QUE_PUEDEN_ASIGNAR: Role[] = [Role.PROFESOR];

/**
 * HU-05. Cada día puede venir de un día de plantilla (vinculado si el
 * conjunto coincide) o armado desde cero. Autoriza contra la cartera
 * vigente del invocador.
 */
@Injectable()
export class AssignRoutineToAlumnoUseCase {
  constructor(
    @Inject(ROUTINE_INSTANCE_REPOSITORY)
    private readonly instanceRepository: RoutineInstanceRepositoryPort,
    @Inject(ROUTINE_TEMPLATE_REPOSITORY)
    private readonly templateRepository: RoutineTemplateRepositoryPort,
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
  ) {}

  async execute(input: AssignRoutineToAlumnoInput): Promise<RoutineInstanceDetail> {
    if (!ROLES_QUE_PUEDEN_ASIGNAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_ASIGNAR);
    }
    if (input.dias.length === 0) {
      throw new InvalidRoutineInstanceInputError();
    }

    const gymId = requireGymId(input.invocadoPor);
    const alumno = await resolveUserInGym(this.userRepository, input.alumnoId, gymId);
    if (alumno.role !== Role.ALUMNO) {
      throw new AlumnoNotInCarteraError(input.alumnoId);
    }
    const enCartera = await this.carteraRepository.existe(input.invocadoPor.id, input.alumnoId);
    if (!enCartera) {
      throw new AlumnoNotInCarteraError(input.alumnoId);
    }

    validarDias(input.dias);
    await validarExerciseIdsEnCatalogo(
      this.exerciseRepository,
      input.dias.flatMap((d) => d.ejercicios),
    );

    const { vinculos, referencias } = await resolverVinculosPedidos(
      this.templateRepository,
      { id: input.invocadoPor.id, gymId },
      input.dias.map((d) => ({ ...d, anterior: null })),
    );

    const nombre = input.nombre?.trim() || nombreDePlantillaComun(vinculos, referencias);
    if (!nombre) {
      throw new InvalidRoutineInstanceInputError();
    }

    return this.instanceRepository.crear({
      gymId,
      profesorId: input.invocadoPor.id,
      alumnoId: input.alumnoId,
      nombre,
      dias: input.dias.map((d, i) => ({ vinculadoADiaId: vinculos[i], ejercicios: d.ejercicios })),
    });
  }
}

function nombreDePlantillaComun(
  vinculos: Array<string | null>,
  referencias: Map<string, DiaPlantillaReferencia>,
): string | undefined {
  if (vinculos.some((v) => v === null)) return undefined;
  const plantillas = new Set(vinculos.map((v) => referencias.get(v!)!.templateId));
  if (plantillas.size !== 1) return undefined;
  return referencias.get(vinculos[0]!)!.templateNombre;
}
```

Run: `pnpm --filter api test -- assign-routine-to-alumno` → Expected: PASS (8 tests).

- [ ] **Step 4: Spec de edición de días de la instancia (falla)**

`apps/api/src/routines/application/replace-instance-days.use-case.spec.ts`:

```ts
import { Role } from '../../identity/domain/role';
import { CarteraRepositoryPort } from '../../identity/application/ports/cartera-repository.port';
import { ExerciseRepositoryPort } from '../../exercise-catalog/application/ports/exercise-repository.port';
import {
  crearInstanceRepositoryMock,
  crearTemplateRepositoryMock,
} from '../../test-support/repositorios-routines.mock';
import { ReplaceInstanceDaysUseCase } from './replace-instance-days.use-case';
import { EjercicioItem } from './ports/routine-template-repository.port';
import { RoutineInstanceDetail } from './ports/routine-instance-repository.port';
import { RoutineInstanceNotFoundError } from './errors/routine-instance-not-found.error';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';
import { RoutineDayNotFoundError } from './errors/routine-day-not-found.error';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';

function ej(exerciseId: string, orden = 1, series = 3): EjercicioItem {
  return { exerciseId, orden, series, repeticiones: 10, peso: null, notas: null };
}

describe('ReplaceInstanceDaysUseCase', () => {
  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const referencia = (id: string, exerciseIds: string[], profesorId = 'prof-1') => ({
    id,
    numero: 1,
    templateId: 'tpl-1',
    templateNombre: 'T',
    profesorId,
    gymId: 'gym-1',
    exerciseIds,
  });

  const instancia: RoutineInstanceDetail = {
    id: 'inst-1',
    gymId: 'gym-1',
    profesorId: 'prof-1',
    alumnoId: 'alum-1',
    nombre: 'R',
    vigenteDesde: new Date(),
    vigenteHasta: null,
    activa: true,
    dias: [
      { id: 'd1', numero: 1, vinculadoADiaId: 'tday-1', ejercicios: [ej('ex-1'), ej('ex-2', 2)] },
      { id: 'd2', numero: 2, vinculadoADiaId: 'tday-2', ejercicios: [ej('ex-3')] },
      { id: 'd3', numero: 3, vinculadoADiaId: null, ejercicios: [ej('ex-4')] },
    ],
  };

  let instanceRepository: ReturnType<typeof crearInstanceRepositoryMock>;
  let templateRepository: ReturnType<typeof crearTemplateRepositoryMock>;
  let carteraRepository: jest.Mocked<Pick<CarteraRepositoryPort, 'existe'>>;
  let useCase: ReplaceInstanceDaysUseCase;

  beforeEach(() => {
    instanceRepository = crearInstanceRepositoryMock();
    templateRepository = crearTemplateRepositoryMock();
    carteraRepository = { existe: jest.fn().mockResolvedValue(true) };
    instanceRepository.findById.mockResolvedValue(instancia);
    templateRepository.findDiasByIds.mockResolvedValue([
      referencia('tday-1', ['ex-1', 'ex-2']),
      referencia('tday-2', ['ex-3'], 'prof-2'),
    ]);
    const exerciseRepository = {
      findByIds: jest.fn(async (ids: string[]) => ids.map((id) => ({ id }))),
    } as unknown as ExerciseRepositoryPort;
    useCase = new ReplaceInstanceDaysUseCase(
      instanceRepository,
      templateRepository,
      carteraRepository as unknown as CarteraRepositoryPort,
      exerciseRepository,
    );
  });

  function guardado() {
    return instanceRepository.guardarDias.mock.calls[0][1];
  }

  it('instancia de otro gym → 404', async () => {
    instanceRepository.findById.mockResolvedValue({ ...instancia, gymId: 'gym-2' });
    await expect(
      useCase.execute({ invocadoPor: profesor, instanceId: 'inst-1', dias: [] }),
    ).rejects.toThrow(RoutineInstanceNotFoundError);
  });

  it('alumno fuera de la cartera → 403', async () => {
    carteraRepository.existe.mockResolvedValue(false);
    await expect(
      useCase.execute({ invocadoPor: profesor, instanceId: 'inst-1', dias: [] }),
    ).rejects.toThrow(AlumnoNotInCarteraError);
  });

  it('id de día ajeno a la instancia → 404', async () => {
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        instanceId: 'inst-1',
        dias: [{ id: 'dx', ejercicios: [ej('ex-1')] }],
      }),
    ).rejects.toThrow(RoutineDayNotFoundError);
  });

  it('cambiar series o reordenar días no desvincula nada', async () => {
    const resultado = await useCase.execute({
      invocadoPor: profesor,
      instanceId: 'inst-1',
      dias: [
        { id: 'd3', ejercicios: [ej('ex-4')] },
        { id: 'd1', vinculadoADiaId: 'tday-1', ejercicios: [ej('ex-2', 1, 9), ej('ex-1', 2)] },
        { id: 'd2', vinculadoADiaId: 'tday-2', ejercicios: [ej('ex-3')] },
      ],
    });
    expect(guardado().map((d) => [d.id, d.vinculadoADiaId])).toEqual([
      ['d3', null],
      ['d1', 'tday-1'],
      ['d2', 'tday-2'],
    ]);
    expect(resultado).toEqual({ diasDesvinculados: [] });
  });

  it('agregar un ejercicio desvincula solo ese día e informa su número nuevo', async () => {
    const resultado = await useCase.execute({
      invocadoPor: profesor,
      instanceId: 'inst-1',
      dias: [
        { id: 'd2', vinculadoADiaId: 'tday-2', ejercicios: [ej('ex-3')] },
        {
          id: 'd1',
          vinculadoADiaId: 'tday-1',
          ejercicios: [ej('ex-1'), ej('ex-2', 2), ej('ex-5', 3)],
        },
      ],
    });
    expect(guardado().map((d) => d.vinculadoADiaId)).toEqual(['tday-2', null]);
    expect(resultado).toEqual({ diasDesvinculados: [2] });
  });

  it('mover un ejercicio de día desvincula los dos días', async () => {
    const resultado = await useCase.execute({
      invocadoPor: profesor,
      instanceId: 'inst-1',
      dias: [
        { id: 'd1', vinculadoADiaId: 'tday-1', ejercicios: [ej('ex-1')] },
        { id: 'd2', vinculadoADiaId: 'tday-2', ejercicios: [ej('ex-3'), ej('ex-2', 2)] },
      ],
    });
    expect(resultado).toEqual({ diasDesvinculados: [1, 2] });
  });

  it('conserva un vínculo existente a la plantilla de otro profesor de la cartera', async () => {
    await useCase.execute({
      invocadoPor: profesor,
      instanceId: 'inst-1',
      dias: [{ id: 'd2', vinculadoADiaId: 'tday-2', ejercicios: [ej('ex-3', 1, 7)] }],
    });
    expect(guardado()[0].vinculadoADiaId).toBe('tday-2');
  });

  it('vincular un día a la plantilla de otro profesor → 404', async () => {
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        instanceId: 'inst-1',
        dias: [{ id: 'd3', vinculadoADiaId: 'tday-2', ejercicios: [ej('ex-3')] }],
      }),
    ).rejects.toThrow(RoutineTemplateNotFoundError);
  });

  it('reemplazar un día importando otro día de plantilla sin tocarlo lo vincula al nuevo', async () => {
    templateRepository.findDiasByIds.mockResolvedValue([referencia('tday-7', ['ex-6'])]);
    await useCase.execute({
      invocadoPor: profesor,
      instanceId: 'inst-1',
      dias: [{ id: 'd3', vinculadoADiaId: 'tday-7', ejercicios: [ej('ex-6')] }],
    });
    expect(guardado()[0]).toEqual({
      id: 'd3',
      vinculadoADiaId: 'tday-7',
      ejercicios: [ej('ex-6')],
    });
  });
});
```

Run: `pnpm --filter api test -- replace-instance-days` → Expected: FAIL.

- [ ] **Step 5: Implementar la edición de días**

`apps/api/src/routines/application/replace-instance-days.use-case.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import {
  CARTERA_REPOSITORY,
  CarteraRepositoryPort,
} from '../../identity/application/ports/cartera-repository.port';
import { requireGymId } from '../../identity/application/require-gym-id';
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
import { RoutineInstanceNotFoundError } from './errors/routine-instance-not-found.error';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';
import { RoutineDayNotFoundError } from './errors/routine-day-not-found.error';
import { validarDias } from './dias/validar-dias';
import { resolverVinculosPedidos } from './dias/resolver-vinculos-pedidos';
import { validarExerciseIdsEnCatalogo } from './validar-exercise-ids';

export interface ReplaceInstanceDaysInput {
  invocadoPor: AuthenticatedUser;
  instanceId: string;
  dias: Array<{ id?: string; vinculadoADiaId?: string; ejercicios: EjercicioItem[] }>;
}

export interface ReplaceInstanceDaysOutput {
  /** Números (en el orden nuevo) de los días que estaban vinculados y dejaron de estarlo. */
  diasDesvinculados: number[];
}

/**
 * HU-06. Autoriza contra la cartera vigente, nunca contra quién creó la
 * instancia. El vínculo de cada día lo decide la regla única de vínculo.
 */
@Injectable()
export class ReplaceInstanceDaysUseCase {
  constructor(
    @Inject(ROUTINE_INSTANCE_REPOSITORY)
    private readonly instanceRepository: RoutineInstanceRepositoryPort,
    @Inject(ROUTINE_TEMPLATE_REPOSITORY)
    private readonly templateRepository: RoutineTemplateRepositoryPort,
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
  ) {}

  async execute(input: ReplaceInstanceDaysInput): Promise<ReplaceInstanceDaysOutput> {
    const gymId = requireGymId(input.invocadoPor);

    const instance = await this.instanceRepository.findById(input.instanceId);
    if (!instance || instance.gymId !== gymId) {
      throw new RoutineInstanceNotFoundError(input.instanceId);
    }
    const enCartera = await this.carteraRepository.existe(input.invocadoPor.id, instance.alumnoId);
    if (!enCartera) {
      throw new AlumnoNotInCarteraError(instance.alumnoId);
    }

    validarDias(input.dias);
    const vinculoAnteriorPorId = new Map(instance.dias.map((d) => [d.id, d.vinculadoADiaId]));
    for (const dia of input.dias) {
      if (dia.id && !vinculoAnteriorPorId.has(dia.id)) {
        throw new RoutineDayNotFoundError(dia.id);
      }
    }
    await validarExerciseIdsEnCatalogo(
      this.exerciseRepository,
      input.dias.flatMap((d) => d.ejercicios),
    );

    const anteriores = input.dias.map((d) =>
      d.id ? (vinculoAnteriorPorId.get(d.id) ?? null) : null,
    );
    const { vinculos } = await resolverVinculosPedidos(
      this.templateRepository,
      { id: input.invocadoPor.id, gymId },
      input.dias.map((d, i) => ({ ...d, anterior: anteriores[i] })),
    );

    await this.instanceRepository.guardarDias(
      instance.id,
      input.dias.map((d, i) => ({
        ...(d.id ? { id: d.id } : {}),
        vinculadoADiaId: vinculos[i],
        ejercicios: d.ejercicios,
      })),
    );

    return {
      diasDesvinculados: input.dias.flatMap((_, i) =>
        anteriores[i] !== null && vinculos[i] === null ? [i + 1] : [],
      ),
    };
  }
}
```

Run: `pnpm --filter api test -- replace-instance-days` → Expected: PASS (9 tests).

- [ ] **Step 6: DTOs, controller, módulo**

`apps/api/src/routines/infrastructure/http/dto/create-routine-instance.dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DiaNuevoDto } from './dia.dto';

export class CreateRoutineInstanceDto {
  @IsString()
  @MinLength(1)
  alumnoId!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  nombre?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiaNuevoDto)
  @ArrayMaxSize(7)
  dias!: DiaNuevoDto[];
}
```

`apps/api/src/routines/infrastructure/http/dto/replace-instance-days.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { DiaInstanciaDto } from './dia.dto';

export class ReplaceInstanceDaysDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiaInstanciaDto)
  @ArrayMaxSize(7)
  dias!: DiaInstanciaDto[];
}
```

`routine-instances.controller.ts` completo:

```ts
import { Body, Controller, HttpCode, Param, Patch, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../../identity/infrastructure/decorators/roles.decorator';
import { Role } from '../../../identity/domain/role';
import { AuthenticatedUser } from '../../../identity/domain/authenticated-user';
import { AssignRoutineToAlumnoUseCase } from '../../application/assign-routine-to-alumno.use-case';
import { UpdateRoutineInstanceUseCase } from '../../application/update-routine-instance.use-case';
import { ReplaceInstanceDaysUseCase } from '../../application/replace-instance-days.use-case';
import { CreateRoutineInstanceDto } from './dto/create-routine-instance.dto';
import { UpdateRoutineInstanceDto } from './dto/update-routine-instance.dto';
import { ReplaceInstanceDaysDto } from './dto/replace-instance-days.dto';
import { toDiasInstancia, toDiasNuevos } from './dto/dia.mapper';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@Controller('routine-instances')
@Roles(Role.PROFESOR)
export class RoutineInstancesController {
  constructor(
    private readonly assignUseCase: AssignRoutineToAlumnoUseCase,
    private readonly updateUseCase: UpdateRoutineInstanceUseCase,
    private readonly replaceDaysUseCase: ReplaceInstanceDaysUseCase,
  ) {}

  @Post()
  async create(@Body() dto: CreateRoutineInstanceDto, @Req() req: RequestWithUser) {
    return this.assignUseCase.execute({
      invocadoPor: req.user,
      alumnoId: dto.alumnoId,
      nombre: dto.nombre,
      dias: toDiasNuevos(dto.dias),
    });
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRoutineInstanceDto,
    @Req() req: RequestWithUser,
  ) {
    return this.updateUseCase.execute({
      invocadoPor: req.user,
      instanceId: id,
      nombre: dto.nombre,
    });
  }

  @Put(':id/dias')
  @HttpCode(200)
  async replaceDias(
    @Param('id') id: string,
    @Body() dto: ReplaceInstanceDaysDto,
    @Req() req: RequestWithUser,
  ) {
    return this.replaceDaysUseCase.execute({
      invocadoPor: req.user,
      instanceId: id,
      dias: toDiasInstancia(dto.dias),
    });
  }
}
```

`routines.module.ts`: agregar `AssignRoutineToAlumnoUseCase` y `ReplaceInstanceDaysUseCase` a imports y `providers`.

- [ ] **Step 7: e2e de instancias**

`apps/api/src/routines/infrastructure/http/routine-instances.controller.e2e.spec.ts`: partir de la versión borrada en la Tarea 4 y aplicar los cambios de abajo. Para recuperarla:

```bash
F=apps/api/src/routines/infrastructure/http/routine-instances.controller.e2e.spec.ts
H=$(git log --diff-filter=D --format=%h -1 -- "$F")
git show "$H^:$F" > "$F"
```

Cambios:

- imports: `ReplaceInstanceDaysUseCase` en vez de `ReplaceInstanceExercisesUseCase`; providers igual.
- `instanciaBase`: sin `origenTemplateId`/`vinculada`; `ejercicios: []` → `dias: []`.
- `fakeInstanceRepository`: `crear: jest.fn(async (data) => ({ ...instanciaBase, nombre: data.nombre, dias: [] }))`, `findActivasConDiasVinculadosA: jest.fn(async () => [])`, `guardarDias: jest.fn(async () => undefined)`; quitar `findVinculadasActivasPorTemplate`, `replaceExercises`, `marcarDesvinculada`, `replaceExercisesYDesvincular`.
- `fakeTemplateRepository`: `Pick<RoutineTemplateRepositoryPort, 'findById' | 'findDiasByIds'>` con `findDiasByIds: jest.fn(async () => [])`.
- Reemplazar los tres tests por:

```ts
const unDia = { ejercicios: [{ exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10 }] };

it('PROFESOR asigna una rutina por días — 201', async () => {
  const token = await firmarToken();
  const res = await request(app.getHttpServer())
    .post('/routine-instances')
    .set('Authorization', `Bearer ${token}`)
    .send({ alumnoId: 'alum-1', nombre: 'Custom', dias: [unDia, unDia] })
    .expect(201);
  expect(res.body).toMatchObject({ nombre: 'Custom' });
});

it('rechaza el formato viejo (origenTemplateId / ejercicios planos) — 400', async () => {
  const token = await firmarToken();
  await request(app.getHttpServer())
    .post('/routine-instances')
    .set('Authorization', `Bearer ${token}`)
    .send({ alumnoId: 'alum-1', nombre: 'Custom', origenTemplateId: 'tpl-1', dias: [unDia] })
    .expect(400);
});

it('rechaza (403, AlumnoNotInCarteraError) si el alumno no está en la cartera', async () => {
  (fakeCarteraRepository.existe as jest.Mock).mockResolvedValueOnce(false);
  const token = await firmarToken();
  const res = await request(app.getHttpServer())
    .post('/routine-instances')
    .set('Authorization', `Bearer ${token}`)
    .send({ alumnoId: 'alum-1', nombre: 'Custom', dias: [unDia] })
    .expect(403);
  expect(res.body.error).toBe('AlumnoNotInCarteraError');
});

it('PUT /:id/dias responde 200 con los días desvinculados', async () => {
  const token = await firmarToken();
  const res = await request(app.getHttpServer())
    .put('/routine-instances/inst-1/dias')
    .set('Authorization', `Bearer ${token}`)
    .send({ dias: [unDia] })
    .expect(200);
  expect(res.body).toEqual({ diasDesvinculados: [] });
});
```

Run: `pnpm --filter api test -- routine-instances.controller` → Expected: PASS (4 tests).

- [ ] **Step 8: Verificación completa del backend y commit**

Run: `pnpm --filter api test` → PASS.
Run: `pnpm --filter api build` → OK.
Run: `pnpm --filter api db:verificar-migraciones` → `No difference detected.`
Run: `pnpm lint` → sin errores nuevos en `apps/api`.

```bash
git add apps/api/src/routines
git commit -m "feat(routines): asignar rutina combinando días y editar días del alumno con vínculo por día"
```

---

### Task 7: Lógica pura del editor de días (web)

**Files:**

- Modify: `apps/web/lib/routine-types.ts`
- Create: `apps/web/lib/routine-days.ts`
- Create: `apps/web/lib/routine-days.spec.ts`

**Interfaces:**

- Produces (en `routine-types.ts`): `EjercicioEnEdicion` (con `uid`, sin `orden`), `DiaEnEdicion`, `PlantillaParaImportar`, `DiaPlantillaParaImportar`, `TemplateDetailApi`, `EjercicioApi`, `aPayloadDeEjercicios(ejercicios)`.
- Produces (en `routine-days.ts`): `MAX_DIAS`, `MAX_EJERCICIOS_TOTALES`, `nuevoUid`, `crearDiaVacio`, `agregarDia`, `eliminarDia`, `moverDia`, `actualizarEjerciciosDeDia`, `moverEjercicioADia`, `totalEjercicios`, `importarDePlantilla`, `aPayloadDeDias`, `diasDePlantillaAEdicion`, `diasDeRutinaAEdicion`, `aPlantillaParaImportar`, `claveDeVersion`, `diaInicialParaAlumno`, `claveDiaAlumno` — firmas exactas en el código de abajo.

- [ ] **Step 1: Tipos**

Reemplazar `apps/web/lib/routine-types.ts` completo:

```ts
/** Un ejercicio mientras se edita; `uid` es local (el mismo ejercicio puede estar en dos días). */
export interface EjercicioEnEdicion {
  uid: string;
  exerciseId: string;
  nombre: string;
  imageUrl: string | null;
  series: number;
  repeticiones: number;
  peso: number | null;
  notas: string | null;
}

export interface DiaEnEdicion {
  uid: string;
  /** Id persistido del día; ausente en días nuevos. */
  id?: string;
  /** Vínculo vigente según el servidor. */
  vinculadoADiaId: string | null;
  /** Texto del badge "Sincronizado · …" (solo días vinculados que vienen del servidor). */
  vinculoEtiqueta: string | null;
  /** Día de plantilla del que se importó en esta sesión de edición. */
  importadoDeDiaId: string | null;
  ejercicios: EjercicioEnEdicion[];
}

export interface DiaPlantillaParaImportar {
  id: string;
  numero: number;
  ejercicios: Array<Omit<EjercicioEnEdicion, 'uid'>>;
}

export interface PlantillaParaImportar {
  id: string;
  nombre: string;
  dias: DiaPlantillaParaImportar[];
}

export interface EjercicioApi {
  exerciseId: string;
  orden: number;
  series: number;
  repeticiones: number;
  peso: number | null;
  notas: string | null;
}

export interface TemplateDetailApi {
  id: string;
  nombre: string;
  activa: boolean;
  dias: Array<{ id: string; numero: number; ejercicios: EjercicioApi[] }>;
}

export interface EjercicioPayload {
  exerciseId: string;
  orden: number;
  series: number;
  repeticiones: number;
  peso?: number;
  notas?: string;
}

export function aPayloadDeEjercicios(ejercicios: EjercicioEnEdicion[]): EjercicioPayload[] {
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

- [ ] **Step 2: Tests (fallan)**

`apps/web/lib/routine-days.spec.ts`:

```ts
import {
  MAX_DIAS,
  aPayloadDeDias,
  aPlantillaParaImportar,
  agregarDia,
  claveDeVersion,
  crearDiaVacio,
  diaInicialParaAlumno,
  diasDePlantillaAEdicion,
  diasDeRutinaAEdicion,
  eliminarDia,
  importarDePlantilla,
  moverDia,
  moverEjercicioADia,
  totalEjercicios,
} from './routine-days';
import { DiaEnEdicion, EjercicioEnEdicion, PlantillaParaImportar } from './routine-types';

function ej(exerciseId: string, uid = `u-${exerciseId}`): EjercicioEnEdicion {
  return {
    uid,
    exerciseId,
    nombre: exerciseId,
    imageUrl: null,
    series: 3,
    repeticiones: 10,
    peso: null,
    notas: null,
  };
}

function dia(
  uid: string,
  ejercicios: EjercicioEnEdicion[],
  extra: Partial<DiaEnEdicion> = {},
): DiaEnEdicion {
  return {
    uid,
    vinculadoADiaId: null,
    vinculoEtiqueta: null,
    importadoDeDiaId: null,
    ejercicios,
    ...extra,
  };
}

const plantilla: PlantillaParaImportar = {
  id: 'tpl-1',
  nombre: 'Split',
  dias: [
    {
      id: 'tday-1',
      numero: 1,
      ejercicios: [
        {
          exerciseId: 'ex-1',
          nombre: 'A',
          imageUrl: null,
          series: 4,
          repeticiones: 12,
          peso: 50,
          notas: null,
        },
      ],
    },
    {
      id: 'tday-2',
      numero: 2,
      ejercicios: [
        {
          exerciseId: 'ex-2',
          nombre: 'B',
          imageUrl: null,
          series: 3,
          repeticiones: 8,
          peso: null,
          notas: null,
        },
      ],
    },
  ],
};

describe('routine-days', () => {
  it('agregarDia agrega un día vacío y no pasa de 7', () => {
    const siete = Array.from({ length: MAX_DIAS }, (_, i) => dia(`d${i}`, []));
    expect(agregarDia([dia('d0', [])])).toHaveLength(2);
    expect(agregarDia(siete)).toBe(siete);
  });

  it('crearDiaVacio genera uids distintos', () => {
    expect(crearDiaVacio().uid).not.toBe(crearDiaVacio().uid);
  });

  it('eliminarDia y moverDia', () => {
    const dias = [dia('a', []), dia('b', []), dia('c', [])];
    expect(eliminarDia(dias, 'b').map((d) => d.uid)).toEqual(['a', 'c']);
    expect(moverDia(dias, 'b', -1).map((d) => d.uid)).toEqual(['b', 'a', 'c']);
    expect(moverDia(dias, 'c', 1)).toBe(dias);
    expect(moverDia(dias, 'a', -1)).toBe(dias);
  });

  it('moverEjercicioADia lo pasa al final del destino, y no duplica dentro de un día', () => {
    const dias = [
      dia('a', [ej('ex-1'), ej('ex-2')]),
      dia('b', [ej('ex-3')]),
      dia('c', [ej('ex-1', 'otro')]),
    ];
    const movido = moverEjercicioADia(dias, 'a', 'u-ex-2', 'b');
    expect(movido.map((d) => d.ejercicios.map((e) => e.exerciseId))).toEqual([
      ['ex-1'],
      ['ex-3', 'ex-2'],
      ['ex-1'],
    ]);
    expect(moverEjercicioADia(dias, 'a', 'u-ex-1', 'c')).toBe(dias);
  });

  it('totalEjercicios suma todos los días', () => {
    expect(totalEjercicios([dia('a', [ej('ex-1')]), dia('b', [ej('ex-2'), ej('ex-3')])])).toBe(3);
  });

  it('importar plantilla completa reemplaza todos los días y marca su origen', () => {
    const resultado = importarDePlantilla([dia('a', [ej('ex-9')])], plantilla, {
      diaId: 'todos',
      reemplazarUid: null,
    });
    expect(
      resultado.map((d) => [d.importadoDeDiaId, d.ejercicios.map((e) => e.exerciseId), d.id]),
    ).toEqual([
      ['tday-1', ['ex-1'], undefined],
      ['tday-2', ['ex-2'], undefined],
    ]);
  });

  it('importar un día como nuevo lo agrega al final', () => {
    const resultado = importarDePlantilla([dia('a', [ej('ex-9')])], plantilla, {
      diaId: 'tday-2',
      reemplazarUid: null,
    });
    expect(resultado.map((d) => d.importadoDeDiaId)).toEqual([null, 'tday-2']);
  });

  it('reemplazar un día conserva su uid e id persistido y cambia el contenido', () => {
    const existente = dia('a', [ej('ex-9')], {
      id: 'iday-1',
      vinculadoADiaId: 'tday-x',
      vinculoEtiqueta: 'X · Día 1',
    });
    const [resultado] = importarDePlantilla([existente], plantilla, {
      diaId: 'tday-1',
      reemplazarUid: 'a',
    });
    expect(resultado).toMatchObject({
      uid: 'a',
      id: 'iday-1',
      importadoDeDiaId: 'tday-1',
      vinculoEtiqueta: null,
    });
    expect(resultado.ejercicios.map((e) => e.exerciseId)).toEqual(['ex-1']);
  });

  it('aPayloadDeDias: descarta días vacíos, numera orden, y resuelve el vínculo según la casilla', () => {
    const dias = [
      dia('a', [ej('ex-1'), ej('ex-2')], { id: 'iday-1', vinculadoADiaId: 'tday-1' }),
      dia('b', []),
      dia('c', [ej('ex-3')], { importadoDeDiaId: 'tday-7' }),
    ];
    expect(aPayloadDeDias(dias, { vincular: false, incluirIds: true })).toEqual([
      {
        id: 'iday-1',
        vinculadoADiaId: 'tday-1',
        ejercicios: [
          { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10 },
          { exerciseId: 'ex-2', orden: 2, series: 3, repeticiones: 10 },
        ],
      },
      { ejercicios: [{ exerciseId: 'ex-3', orden: 1, series: 3, repeticiones: 10 }] },
    ]);
    expect(aPayloadDeDias(dias, { vincular: true, incluirIds: false })[1]).toEqual({
      vinculadoADiaId: 'tday-7',
      ejercicios: [{ exerciseId: 'ex-3', orden: 1, series: 3, repeticiones: 10 }],
    });
    expect(aPayloadDeDias(dias, { vincular: true, incluirIds: false })[0]).not.toHaveProperty('id');
  });

  it('diasDePlantillaAEdicion resuelve nombres y diasDeRutinaAEdicion arma la etiqueta del vínculo', () => {
    const [d] = diasDePlantillaAEdicion(
      [
        {
          id: 'tday-1',
          numero: 1,
          ejercicios: [
            { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, peso: null, notas: null },
          ],
        },
      ],
      new Map([['ex-1', { nombre: 'Sentadilla', imageUrl: null }]]),
    );
    expect(d).toMatchObject({ id: 'tday-1', vinculadoADiaId: null });
    expect(d.ejercicios[0].nombre).toBe('Sentadilla');

    const [r] = diasDeRutinaAEdicion([
      {
        id: 'iday-1',
        numero: 1,
        vinculado: { diaId: 'tday-2', templateId: 'tpl-1', templateNombre: 'Piernas', numero: 2 },
        ejercicios: [
          {
            exerciseId: 'ex-1',
            nombre: 'Sentadilla',
            imageUrl: null,
            orden: 1,
            series: 3,
            repeticiones: 10,
            peso: null,
            notas: null,
          },
        ],
      },
    ]);
    expect(r).toMatchObject({
      id: 'iday-1',
      vinculadoADiaId: 'tday-2',
      vinculoEtiqueta: 'Piernas · Día 2',
    });
  });

  it('aPlantillaParaImportar ordena días y resuelve nombres', () => {
    const resultado = aPlantillaParaImportar(
      {
        id: 'tpl-1',
        nombre: 'Split',
        activa: true,
        dias: [
          { id: 'b', numero: 2, ejercicios: [] },
          {
            id: 'a',
            numero: 1,
            ejercicios: [
              {
                exerciseId: 'ex-1',
                orden: 1,
                series: 3,
                repeticiones: 10,
                peso: null,
                notas: null,
              },
            ],
          },
        ],
      },
      new Map([['ex-1', { nombre: 'Remo', imageUrl: 'x' }]]),
    );
    expect(resultado.dias.map((d) => d.id)).toEqual(['a', 'b']);
    expect(resultado.dias[0].ejercicios[0]).toMatchObject({ nombre: 'Remo', imageUrl: 'x' });
  });

  it('claveDeVersion cambia cuando cambian ids, vínculos o cantidad de ejercicios', () => {
    const base = [dia('a', [ej('ex-1')], { id: 'x' })];
    expect(claveDeVersion(base)).toBe(claveDeVersion([dia('otro-uid', [ej('ex-1')], { id: 'x' })]));
    expect(claveDeVersion(base)).not.toBe(claveDeVersion([dia('a', [ej('ex-1')], { id: 'y' })]));
    expect(claveDeVersion(base)).not.toBe(
      claveDeVersion([dia('a', [ej('ex-1'), ej('ex-2')], { id: 'x' })]),
    );
  });

  it('diaInicialParaAlumno usa el guardado si es válido y si no Día 1', () => {
    expect(diaInicialParaAlumno('3', 4)).toBe(3);
    expect(diaInicialParaAlumno('5', 4)).toBe(1);
    expect(diaInicialParaAlumno(null, 4)).toBe(1);
    expect(diaInicialParaAlumno('abc', 4)).toBe(1);
    expect(diaInicialParaAlumno('0', 4)).toBe(1);
  });
});
```

Run: `pnpm --filter web test -- routine-days` → Expected: FAIL.

- [ ] **Step 3: Implementar**

`apps/web/lib/routine-days.ts`:

```ts
import {
  DiaEnEdicion,
  EjercicioApi,
  EjercicioEnEdicion,
  EjercicioPayload,
  PlantillaParaImportar,
  TemplateDetailApi,
  aPayloadDeEjercicios,
} from './routine-types';

export const MAX_DIAS = 7;
export const MAX_EJERCICIOS_TOTALES = 50;

export function nuevoUid(): string {
  return crypto.randomUUID();
}

export function crearDiaVacio(): DiaEnEdicion {
  return {
    uid: nuevoUid(),
    vinculadoADiaId: null,
    vinculoEtiqueta: null,
    importadoDeDiaId: null,
    ejercicios: [],
  };
}

export function agregarDia(dias: DiaEnEdicion[]): DiaEnEdicion[] {
  return dias.length >= MAX_DIAS ? dias : [...dias, crearDiaVacio()];
}

export function eliminarDia(dias: DiaEnEdicion[], uid: string): DiaEnEdicion[] {
  return dias.filter((d) => d.uid !== uid);
}

export function moverDia(dias: DiaEnEdicion[], uid: string, delta: -1 | 1): DiaEnEdicion[] {
  const desde = dias.findIndex((d) => d.uid === uid);
  const hasta = desde + delta;
  if (desde === -1 || hasta < 0 || hasta >= dias.length) return dias;
  const copia = [...dias];
  [copia[desde], copia[hasta]] = [copia[hasta], copia[desde]];
  return copia;
}

export function actualizarEjerciciosDeDia(
  dias: DiaEnEdicion[],
  uid: string,
  ejercicios: EjercicioEnEdicion[],
): DiaEnEdicion[] {
  return dias.map((d) => (d.uid === uid ? { ...d, ejercicios } : d));
}

export function moverEjercicioADia(
  dias: DiaEnEdicion[],
  desdeUid: string,
  ejercicioUid: string,
  haciaUid: string,
): DiaEnEdicion[] {
  const origen = dias.find((d) => d.uid === desdeUid);
  const destino = dias.find((d) => d.uid === haciaUid);
  const ejercicio = origen?.ejercicios.find((e) => e.uid === ejercicioUid);
  if (!origen || !destino || !ejercicio || origen === destino) return dias;
  if (destino.ejercicios.some((e) => e.exerciseId === ejercicio.exerciseId)) return dias;
  return dias.map((d) => {
    if (d.uid === desdeUid)
      return { ...d, ejercicios: d.ejercicios.filter((e) => e.uid !== ejercicioUid) };
    if (d.uid === haciaUid) return { ...d, ejercicios: [...d.ejercicios, ejercicio] };
    return d;
  });
}

export function totalEjercicios(dias: DiaEnEdicion[]): number {
  return dias.reduce((suma, d) => suma + d.ejercicios.length, 0);
}

export interface SeleccionImportacion {
  diaId: string | 'todos';
  /** `null` = agregar como día nuevo. Se ignora con `diaId: 'todos'`. */
  reemplazarUid: string | null;
}

export function importarDePlantilla(
  dias: DiaEnEdicion[],
  plantilla: PlantillaParaImportar,
  seleccion: SeleccionImportacion,
): DiaEnEdicion[] {
  const aEdicion = (diaPlantilla: PlantillaParaImportar['dias'][number]): EjercicioEnEdicion[] =>
    diaPlantilla.ejercicios.map((e) => ({ ...e, uid: nuevoUid() }));

  if (seleccion.diaId === 'todos') {
    return plantilla.dias.slice(0, MAX_DIAS).map((d) => ({
      ...crearDiaVacio(),
      importadoDeDiaId: d.id,
      ejercicios: aEdicion(d),
    }));
  }

  const diaPlantilla = plantilla.dias.find((d) => d.id === seleccion.diaId);
  if (!diaPlantilla) return dias;

  if (seleccion.reemplazarUid) {
    return dias.map((d) =>
      d.uid === seleccion.reemplazarUid
        ? {
            ...d,
            vinculoEtiqueta: null,
            importadoDeDiaId: diaPlantilla.id,
            ejercicios: aEdicion(diaPlantilla),
          }
        : d,
    );
  }
  if (dias.length >= MAX_DIAS) return dias;
  return [
    ...dias,
    { ...crearDiaVacio(), importadoDeDiaId: diaPlantilla.id, ejercicios: aEdicion(diaPlantilla) },
  ];
}

export interface DiaPayload {
  id?: string;
  vinculadoADiaId?: string;
  ejercicios: EjercicioPayload[];
}

export function aPayloadDeDias(
  dias: DiaEnEdicion[],
  opciones: { vincular: boolean; incluirIds: boolean },
): DiaPayload[] {
  return dias
    .filter((d) => d.ejercicios.length > 0)
    .map((d) => {
      const vinculo = d.importadoDeDiaId
        ? opciones.vincular
          ? d.importadoDeDiaId
          : null
        : d.vinculadoADiaId;
      return {
        ...(opciones.incluirIds && d.id ? { id: d.id } : {}),
        ...(vinculo ? { vinculadoADiaId: vinculo } : {}),
        ejercicios: aPayloadDeEjercicios(d.ejercicios),
      };
    });
}

type DetalleEjercicio = { nombre: string; imageUrl: string | null };

function ejercicioApiADatos(
  e: EjercicioApi,
  detalle: DetalleEjercicio | undefined,
): Omit<EjercicioEnEdicion, 'uid'> {
  return {
    exerciseId: e.exerciseId,
    nombre: detalle?.nombre ?? '(ejercicio no encontrado)',
    imageUrl: detalle?.imageUrl ?? null,
    series: e.series,
    repeticiones: e.repeticiones,
    peso: e.peso,
    notas: e.notas,
  };
}

function ejercicioApiAEdicion(
  e: EjercicioApi,
  detalle: DetalleEjercicio | undefined,
): EjercicioEnEdicion {
  return { uid: nuevoUid(), ...ejercicioApiADatos(e, detalle) };
}

export function diasDePlantillaAEdicion(
  dias: TemplateDetailApi['dias'],
  detallePorId: Map<string, DetalleEjercicio>,
): DiaEnEdicion[] {
  return [...dias]
    .sort((a, b) => a.numero - b.numero)
    .map((d) => ({
      uid: nuevoUid(),
      id: d.id,
      vinculadoADiaId: null,
      vinculoEtiqueta: null,
      importadoDeDiaId: null,
      ejercicios: d.ejercicios.map((e) => ejercicioApiAEdicion(e, detallePorId.get(e.exerciseId))),
    }));
}

export interface DiaRutinaApi {
  id: string;
  numero: number;
  vinculado: { diaId: string; templateId: string; templateNombre: string; numero: number } | null;
  ejercicios: Array<EjercicioApi & DetalleEjercicio>;
}

/** `vinculadoADiaId` se reenvía tal cual al guardar: sin él, cada guardado desvincularía el día. */
export function diasDeRutinaAEdicion(dias: DiaRutinaApi[]): DiaEnEdicion[] {
  return [...dias]
    .sort((a, b) => a.numero - b.numero)
    .map((d) => ({
      uid: nuevoUid(),
      id: d.id,
      vinculadoADiaId: d.vinculado?.diaId ?? null,
      vinculoEtiqueta: d.vinculado
        ? `${d.vinculado.templateNombre} · Día ${d.vinculado.numero}`
        : null,
      importadoDeDiaId: null,
      ejercicios: d.ejercicios.map((e) => ejercicioApiAEdicion(e, e)),
    }));
}

export function aPlantillaParaImportar(
  detalle: TemplateDetailApi,
  detallePorId: Map<string, DetalleEjercicio>,
): PlantillaParaImportar {
  return {
    id: detalle.id,
    nombre: detalle.nombre,
    dias: [...detalle.dias]
      .sort((a, b) => a.numero - b.numero)
      .map((d) => ({
        id: d.id,
        numero: d.numero,
        ejercicios: d.ejercicios.map((e) => ejercicioApiADatos(e, detallePorId.get(e.exerciseId))),
      })),
  };
}

/** Clave para remontar el editor cuando el servidor devuelve otra estructura (ids nuevos tras guardar). */
export function claveDeVersion(dias: DiaEnEdicion[]): string {
  return dias
    .map((d) => `${d.id ?? 'nuevo'}:${d.vinculadoADiaId ?? '-'}:${d.ejercicios.length}`)
    .join('|');
}

export function claveDiaAlumno(rutinaId: string): string {
  return `rutina-dia:${rutinaId}`;
}

export function diaInicialParaAlumno(guardado: string | null, cantidadDias: number): number {
  const numero = Number(guardado);
  return Number.isInteger(numero) && numero >= 1 && numero <= cantidadDias ? numero : 1;
}
```

Run: `pnpm --filter web test -- routine-days` → Expected: PASS (13 tests).

- [ ] **Step 4: Commit**

(`routine-exercises-editor.tsx`, `template-editor.tsx` e `instance-editor.tsx` todavía usan la forma vieja de `EjercicioEnEdicion`; el typecheck web queda rojo según la "Secuencia web" de Global Constraints. Jest web corre solo `*.spec.ts` y queda verde.)

```bash
git add apps/web/lib/routine-types.ts apps/web/lib/routine-days.ts apps/web/lib/routine-days.spec.ts
git commit -m "feat(web): lógica pura del editor de días de rutina"
```

---

### Task 8: Editor de días compartido + editor de plantilla

**Files:**

- Create (CLI): `apps/web/components/ui/dialog.tsx`, `apps/web/components/ui/dropdown-menu.tsx`
- Create: `apps/web/components/day-exercises-list.tsx`
- Delete: `apps/web/components/routine-exercises-editor.tsx`
- Create: `apps/web/components/routine-days-editor.tsx`
- Create: `apps/web/components/import-template-day-dialog.tsx`
- Modify: `apps/web/app/(profesor)/profesor/plantillas/[id]/page.tsx`, `template-editor.tsx`

**Interfaces:**

- Consumes: todo `lib/routine-days.ts` / `lib/routine-types.ts` (Tarea 7); `ExercisePicker` (`onAgregar(ejercicio: ExerciseCardData)`); `useConfirm()` de `@/components/confirm-dialog`; `browserApiFetch`.
- Produces:
  - `DayExercisesList({ ejercicios, onChange, destinosParaMover, onMoverADia })`
  - `RoutineDaysEditor({ diasIniciales, onGuardar, guardando, error, textoGuardar?, permiteGuardarVacio?, importacion? })` con `onGuardar(dias: DiaEnEdicion[], opciones: { vincular: boolean }): Promise<void>` e `importacion?: { plantillas: Array<{ id: string; nombre: string }>; onPlantillaCompletaImportada?: (nombre: string) => void }`
  - `ImportTemplateDayDialog({ abierto, onAbiertoChange, plantillas, diasActuales, puedeAgregar, onImportar })`

- [ ] **Step 1: Componentes shadcn**

```bash
cd apps/web && pnpm dlx shadcn@4.21.0 add dialog dropdown-menu --yes
git diff --stat -- components/ui
```

Expected: solo archivos nuevos `components/ui/dialog.tsx` y `components/ui/dropdown-menu.tsx`. Si el CLI modificó algún archivo existente de `components/ui/` (por ejemplo `button.tsx`, que tiene ajustes propios de alturas mobile), restaurarlo con `git checkout -- components/ui/<archivo>`. No editar a mano los dos archivos generados.

- [ ] **Step 2: `DayExercisesList` (reemplaza a `RoutineExercisesEditor`)**

`apps/web/components/day-exercises-list.tsx`:

```tsx
'use client';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ListPlus, MoreVertical, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { ExercisePicker } from './exercise-picker';
import { ExerciseCardData } from './exercise-card';
import { EjercicioEnEdicion } from '../lib/routine-types';
import { nuevoUid } from '../lib/routine-days';

export interface DestinoParaMover {
  uid: string;
  numero: number;
  exerciseIds: Set<string>;
}

type CampoEditable = 'series' | 'repeticiones' | 'peso';

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
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: ejercicio.uid,
  });
  const estilo = { transform: CSS.Transform.toString(transform), transition };
  const campos: Array<{
    campo: CampoEditable;
    corto: string;
    largo: string;
    min: number;
    step?: number;
  }> = [
    { campo: 'series', corto: 'Series', largo: 'Series', min: 1 },
    { campo: 'repeticiones', corto: 'Reps', largo: 'Reps', min: 1 },
    { campo: 'peso', corto: 'Peso', largo: 'Peso (kg)', min: 0, step: 0.5 },
  ];

  return (
    <li ref={setNodeRef} style={estilo}>
      <Card className="flex flex-row items-center gap-1 p-2.5! sm:gap-2 sm:p-3!">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground"
          {...attributes}
          {...listeners}
          aria-label={`Reordenar ${ejercicio.nombre}`}
        >
          <GripVertical size={20} aria-hidden />
        </Button>

        <span className="min-w-0 flex-1 break-words text-sm font-medium leading-tight text-foreground">
          {ejercicio.nombre}
        </span>

        <div className="flex shrink-0 gap-1 sm:gap-2">
          {campos.map(({ campo, corto, largo, min, step }) => (
            <div key={campo} className="flex flex-col gap-1">
              <Label
                htmlFor={`${ejercicio.uid}-${campo}`}
                className="text-xs text-muted-foreground"
              >
                <span className="sm:hidden">{corto}</span>
                <span className="hidden sm:inline">{largo}</span>
              </Label>
              <Input
                id={`${ejercicio.uid}-${campo}`}
                type="number"
                min={min}
                step={step}
                value={campo === 'peso' ? (ejercicio.peso ?? '') : ejercicio[campo]}
                placeholder={campo === 'peso' ? '—' : undefined}
                onChange={(e) => onCambiar(campo, e.target.value)}
                className="w-10 px-1 text-center sm:w-16 sm:px-2 sm:text-left"
              />
            </div>
          ))}
        </div>

        {destinos.length > 0 && (
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
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-destructive hover:text-destructive"
          onClick={onQuitar}
          aria-label={`Quitar ${ejercicio.nombre}`}
        >
          <X size={18} aria-hidden />
        </Button>
      </Card>
    </li>
  );
}

/** Lista controlada de los ejercicios de UN día: agregar, quitar, editar valores, reordenar y mover a otro día. */
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
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function agregar(ejercicio: ExerciseCardData) {
    if (ejercicios.some((e) => e.exerciseId === ejercicio.id)) return;
    onChange([
      ...ejercicios,
      {
        uid: nuevoUid(),
        exerciseId: ejercicio.id,
        nombre: ejercicio.nombre,
        imageUrl: ejercicio.imageUrl,
        series: 3,
        repeticiones: 10,
        peso: null,
        notas: null,
      },
    ]);
  }

  function cambiar(uid: string, campo: CampoEditable, valor: string) {
    onChange(
      ejercicios.map((e) => {
        if (e.uid !== uid) return e;
        if (campo === 'peso') return { ...e, peso: valor === '' ? null : Number(valor) };
        return { ...e, [campo]: Number(valor) };
      }),
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const desde = ejercicios.findIndex((e) => e.uid === active.id);
    const hasta = ejercicios.findIndex((e) => e.uid === over.id);
    onChange(arrayMove(ejercicios, desde, hasta));
  }

  return (
    <div className="flex flex-col gap-4">
      <ExercisePicker onAgregar={agregar} />

      {ejercicios.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListPlus />
            </EmptyMedia>
            <EmptyTitle>Este día todavía no tiene ejercicios</EmptyTitle>
            <EmptyDescription>Buscá uno arriba para empezar.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={ejercicios.map((e) => e.uid)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-2">
              {ejercicios.map((ejercicio) => (
                <FilaEjercicio
                  key={ejercicio.uid}
                  ejercicio={ejercicio}
                  destinos={destinosParaMover}
                  onCambiar={(campo, valor) => cambiar(ejercicio.uid, campo, valor)}
                  onQuitar={() => onChange(ejercicios.filter((e) => e.uid !== ejercicio.uid))}
                  onMover={(diaUid) => onMoverADia(ejercicio.uid, diaUid)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
```

```bash
git rm apps/web/components/routine-exercises-editor.tsx
```

- [ ] **Step 3: Diálogo "Traer de plantilla"**

`apps/web/components/import-template-day-dialog.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { browserApiFetch, BrowserApiError } from '../lib/browser-api-client';
import { PlantillaParaImportar, TemplateDetailApi } from '../lib/routine-types';
import { SeleccionImportacion, aPlantillaParaImportar } from '../lib/routine-days';

interface ExerciseSummary {
  id: string;
  nombre: string;
  imageUrl: string | null;
}

async function cargarPlantilla(id: string): Promise<PlantillaParaImportar> {
  const detalle = await browserApiFetch<TemplateDetailApi>(`routine-templates/${id}`);
  const ids = [...new Set(detalle.dias.flatMap((d) => d.ejercicios.map((e) => e.exerciseId)))];
  const resumenes =
    ids.length > 0
      ? await browserApiFetch<ExerciseSummary[]>(`exercises/by-ids?ids=${ids.join(',')}`)
      : [];
  return aPlantillaParaImportar(detalle, new Map(resumenes.map((r) => [r.id, r])));
}

const AGREGAR = 'agregar';

export function ImportTemplateDayDialog({
  abierto,
  onAbiertoChange,
  plantillas,
  diasActuales,
  puedeAgregar,
  onImportar,
}: {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  plantillas: Array<{ id: string; nombre: string }>;
  diasActuales: Array<{ uid: string; numero: number }>;
  puedeAgregar: boolean;
  onImportar: (plantilla: PlantillaParaImportar, seleccion: SeleccionImportacion) => void;
}) {
  // El padre remonta este componente cada vez que se abre (key), así que
  // el estado inicial siempre refleja los días actuales.
  const [plantillaId, setPlantillaId] = useState('');
  const [plantilla, setPlantilla] = useState<PlantillaParaImportar | null>(null);
  const [diaId, setDiaId] = useState<string>('todos');
  const [destino, setDestino] = useState<string>(() =>
    puedeAgregar ? AGREGAR : (diasActuales[0]?.uid ?? AGREGAR),
  );
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!plantillaId) {
      setPlantilla(null);
      return;
    }
    let cancelado = false;
    setCargando(true);
    setError(null);
    cargarPlantilla(plantillaId)
      .then((p) => {
        if (cancelado) return;
        setPlantilla(p);
        setDiaId(p.dias.length > 1 ? 'todos' : (p.dias[0]?.id ?? 'todos'));
      })
      .catch((err) => {
        if (!cancelado)
          setError(
            err instanceof BrowserApiError ? err.message : 'No se pudo cargar la plantilla.',
          );
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [plantillaId]);

  const diaElegido = plantilla?.dias.find((d) => d.id === diaId);
  const esCompleta = diaId === 'todos';
  const puedeConfirmar =
    Boolean(plantilla) &&
    plantilla!.dias.length > 0 &&
    (esCompleta || destino !== AGREGAR || puedeAgregar);

  function confirmar() {
    if (!plantilla) return;
    onImportar(plantilla, {
      diaId,
      reemplazarUid: esCompleta || destino === AGREGAR ? null : destino,
    });
    onAbiertoChange(false);
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Traer de plantilla</DialogTitle>
          <DialogDescription>Elegí una plantilla y qué día querés traer.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="importar-plantilla">Plantilla</FieldLabel>
            <NativeSelect
              id="importar-plantilla"
              value={plantillaId}
              onChange={(e) => setPlantillaId(e.target.value)}
            >
              <NativeSelectOption value="">Elegir plantilla...</NativeSelectOption>
              {plantillas.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.nombre}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          {cargando && <Spinner />}

          {plantilla && plantilla.dias.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Esta plantilla todavía no tiene ejercicios.
            </p>
          )}

          {plantilla && plantilla.dias.length > 0 && (
            <>
              <Field>
                <FieldLabel htmlFor="importar-dia">Qué traer</FieldLabel>
                <NativeSelect
                  id="importar-dia"
                  value={diaId}
                  onChange={(e) => setDiaId(e.target.value)}
                >
                  {plantilla.dias.length > 1 && (
                    <NativeSelectOption value="todos">
                      Plantilla completa ({plantilla.dias.length} días)
                    </NativeSelectOption>
                  )}
                  {plantilla.dias.map((d) => (
                    <NativeSelectOption key={d.id} value={d.id}>
                      Día {d.numero} ({d.ejercicios.length} ejercicios)
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>

              {diaElegido && (
                <ul className="flex flex-col gap-1 rounded-lg border border-border p-3 text-sm text-muted-foreground">
                  {diaElegido.ejercicios.map((e) => (
                    <li key={e.exerciseId}>{e.nombre}</li>
                  ))}
                </ul>
              )}

              {esCompleta ? (
                diasActuales.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Reemplaza todos los días actuales.
                  </p>
                )
              ) : (
                <Field>
                  <FieldLabel htmlFor="importar-destino">Dónde</FieldLabel>
                  <NativeSelect
                    id="importar-destino"
                    value={destino}
                    onChange={(e) => setDestino(e.target.value)}
                  >
                    {puedeAgregar && (
                      <NativeSelectOption value={AGREGAR}>
                        Agregar como día nuevo
                      </NativeSelectOption>
                    )}
                    {diasActuales.map((d) => (
                      <NativeSelectOption key={d.uid} value={d.uid}>
                        Reemplazar Día {d.numero}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              )}
            </>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)}>
            Cancelar
          </Button>
          <Button type="button" variant="brand" onClick={confirmar} disabled={!puedeConfirmar}>
            Traer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: `RoutineDaysEditor`**

`apps/web/components/routine-days-editor.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/confirm-dialog';
import { DayExercisesList } from './day-exercises-list';
import { ImportTemplateDayDialog } from './import-template-day-dialog';
import { DiaEnEdicion, PlantillaParaImportar } from '../lib/routine-types';
import {
  MAX_DIAS,
  MAX_EJERCICIOS_TOTALES,
  SeleccionImportacion,
  actualizarEjerciciosDeDia,
  agregarDia,
  crearDiaVacio,
  eliminarDia,
  importarDePlantilla,
  moverDia,
  moverEjercicioADia,
  totalEjercicios,
} from '../lib/routine-days';

export interface ImportacionDePlantillas {
  plantillas: Array<{ id: string; nombre: string }>;
  onPlantillaCompletaImportada?: (nombre: string) => void;
}

export function RoutineDaysEditor({
  diasIniciales,
  onGuardar,
  guardando,
  error,
  textoGuardar = 'Guardar',
  permiteGuardarVacio = true,
  importacion,
}: {
  diasIniciales: DiaEnEdicion[];
  onGuardar: (dias: DiaEnEdicion[], opciones: { vincular: boolean }) => Promise<void>;
  guardando: boolean;
  error: string | null;
  textoGuardar?: string;
  permiteGuardarVacio?: boolean;
  importacion?: ImportacionDePlantillas;
}) {
  const confirmar = useConfirm();
  const [dias, setDias] = useState<DiaEnEdicion[]>(() =>
    diasIniciales.length > 0 ? diasIniciales : [crearDiaVacio()],
  );
  const [activoUid, setActivoUid] = useState(() => (diasIniciales[0] ?? dias[0]).uid);
  const [vincular, setVincular] = useState(false);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);

  const indiceActivo = Math.max(
    0,
    dias.findIndex((d) => d.uid === activoUid),
  );
  const activo = dias[indiceActivo];
  const total = totalEjercicios(dias);
  const variosDias = dias.length >= 2;

  function agregar() {
    const siguientes = agregarDia(dias);
    setDias(siguientes);
    setActivoUid(siguientes[siguientes.length - 1].uid);
  }

  async function eliminarActivo() {
    if (
      activo.ejercicios.length > 0 &&
      !(await confirmar({
        titulo: `¿Eliminar el Día ${indiceActivo + 1}?`,
        descripcion: 'Se quitan sus ejercicios. Los días siguientes se renumeran.',
        confirmarLabel: 'Eliminar día',
        destructiva: true,
      }))
    ) {
      return;
    }
    const restantes = eliminarDia(dias, activo.uid);
    const siguientes = restantes.length > 0 ? restantes : [crearDiaVacio()];
    setDias(siguientes);
    setActivoUid(siguientes[Math.max(0, indiceActivo - 1)].uid);
  }

  function importar(plantilla: PlantillaParaImportar, seleccion: SeleccionImportacion) {
    const base = dias.length === 1 && dias[0].ejercicios.length === 0 && !dias[0].id ? [] : dias;
    const siguientes = importarDePlantilla(base, plantilla, seleccion);
    setDias(siguientes);
    if (seleccion.diaId === 'todos') {
      setActivoUid(siguientes[0].uid);
      importacion?.onPlantillaCompletaImportada?.(plantilla.nombre);
    } else {
      setActivoUid(seleccion.reemplazarUid ?? siguientes[siguientes.length - 1].uid);
    }
  }

  const destinosParaMover = dias
    .map((d, i) => ({
      uid: d.uid,
      numero: i + 1,
      exerciseIds: new Set(d.ejercicios.map((e) => e.exerciseId)),
    }))
    .filter((d) => d.uid !== activo.uid);

  return (
    <div className="flex flex-col gap-4">
      {variosDias && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Días de la rutina">
          {dias.map((d, i) => (
            <Button
              key={d.uid}
              type="button"
              aria-pressed={d.uid === activo.uid}
              variant={d.uid === activo.uid ? 'brand' : 'outline'}
              size="sm"
              className="shrink-0"
              onClick={() => setActivoUid(d.uid)}
            >
              Día {i + 1}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={agregar}
            disabled={dias.length >= MAX_DIAS}
            aria-label="Agregar día"
          >
            <Plus aria-hidden />
          </Button>
        </div>
      )}

      {(variosDias || activo.vinculoEtiqueta) && (
        <div className="flex flex-wrap items-center gap-2">
          {variosDias && (
            <h3 className="text-base font-semibold text-foreground">Día {indiceActivo + 1}</h3>
          )}
          {activo.vinculoEtiqueta && (
            <Badge variant="outline">Sincronizado · {activo.vinculoEtiqueta}</Badge>
          )}
          {variosDias && (
            <div className="ml-auto flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setDias(moverDia(dias, activo.uid, -1))}
                disabled={indiceActivo === 0}
                aria-label="Mover día antes"
              >
                <ChevronLeft aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setDias(moverDia(dias, activo.uid, 1))}
                disabled={indiceActivo === dias.length - 1}
                aria-label="Mover día después"
              >
                <ChevronRight aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={eliminarActivo}
                aria-label={`Eliminar Día ${indiceActivo + 1}`}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          )}
        </div>
      )}

      <DayExercisesList
        ejercicios={activo.ejercicios}
        onChange={(ejercicios) => setDias(actualizarEjerciciosDeDia(dias, activo.uid, ejercicios))}
        destinosParaMover={destinosParaMover}
        onMoverADia={(ejercicioUid, diaUid) =>
          setDias(moverEjercicioADia(dias, activo.uid, ejercicioUid, diaUid))
        }
      />

      <div className="flex flex-wrap gap-2">
        {!variosDias && (
          <Button type="button" variant="outline" size="sm" onClick={agregar}>
            <Plus data-icon="inline-start" aria-hidden />
            Agregar día
          </Button>
        )}
        {importacion && (
          <Button type="button" variant="outline" size="sm" onClick={() => setDialogoAbierto(true)}>
            <Download data-icon="inline-start" aria-hidden />
            Traer de plantilla
          </Button>
        )}
      </div>

      {importacion && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="mantener-sincronizado"
            checked={vincular}
            onCheckedChange={(valor) => setVincular(valor === true)}
          />
          <Label htmlFor="mantener-sincronizado" className="text-sm text-muted-foreground">
            Mantener sincronizado con las plantillas
          </Label>
        </div>
      )}

      <p
        className={
          total > MAX_EJERCICIOS_TOTALES
            ? 'text-sm text-destructive'
            : 'text-sm text-muted-foreground'
        }
      >
        {total}/{MAX_EJERCICIOS_TOTALES} ejercicios
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        variant="brand"
        size="sm"
        className="self-start px-6"
        onClick={() => onGuardar(dias, { vincular })}
        disabled={
          guardando || total > MAX_EJERCICIOS_TOTALES || (total === 0 && !permiteGuardarVacio)
        }
      >
        {guardando && <Spinner data-icon="inline-start" />}
        {guardando ? 'Guardando...' : textoGuardar}
      </Button>

      {importacion && (
        <ImportTemplateDayDialog
          key={dialogoAbierto ? 'abierto' : 'cerrado'}
          abierto={dialogoAbierto}
          onAbiertoChange={setDialogoAbierto}
          plantillas={importacion.plantillas}
          diasActuales={dias
            .filter((d) => d.ejercicios.length > 0 || d.id)
            .map((d) => ({ uid: d.uid, numero: dias.indexOf(d) + 1 }))}
          puedeAgregar={dias.length < MAX_DIAS}
          onImportar={importar}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Editor de plantilla**

`apps/web/app/(profesor)/profesor/plantillas/[id]/page.tsx`: reemplazar `TemplateDetailResponse` por `TemplateDetailApi` (import de `../../../../../lib/routine-types`) más `gymId`/`profesorId`/`descripcion` si se usan (no se usan: tipar la respuesta como `TemplateDetailApi`), y todo el bloque desde `const ids = …` hasta el `return` por:

```tsx
const ids = [...new Set(plantilla.dias.flatMap((d) => d.ejercicios.map((e) => e.exerciseId)))];
const detalles =
  ids.length > 0 ? await apiFetch<ExerciseSummary[]>(`/exercises/by-ids?ids=${ids.join(',')}`) : [];
const dias = diasDePlantillaAEdicion(plantilla.dias, new Map(detalles.map((d) => [d.id, d])));
```

(conservando el comentario existente sobre el llamado bulk) e importar `diasDePlantillaAEdicion` de `../../../../../lib/routine-days`. El JSX pasa `plantilla={{ id: plantilla.id, nombre: plantilla.nombre, activa: plantilla.activa, dias }}`.

`template-editor.tsx`: `TemplateDetail.ejercicios` → `dias: DiaEnEdicion[]`; reemplazar el import de `RoutineExercisesEditor`/`aPayloadDeEjercicios` por `RoutineDaysEditor` y `aPayloadDeDias`, `claveDeVersion`; la función de guardado:

```tsx
async function guardarDias(dias: DiaEnEdicion[]) {
  setGuardando(true);
  setError(null);
  try {
    await browserApiFetch(`routine-templates/${plantilla.id}/dias`, {
      method: 'PUT',
      body: JSON.stringify({ dias: aPayloadDeDias(dias, { vincular: false, incluirIds: true }) }),
    });
    router.refresh();
  } catch (err) {
    setError(err instanceof BrowserApiError ? err.message : 'No se pudo guardar.');
  } finally {
    setGuardando(false);
  }
}
```

y el render del editor:

```tsx
<RoutineDaysEditor
  key={claveDeVersion(plantilla.dias)}
  diasIniciales={plantilla.dias}
  onGuardar={guardarDias}
  guardando={guardando}
  error={error}
  textoGuardar="Guardar plantilla"
/>
```

- [ ] **Step 6: Verificación manual y commit**

Run: `pnpm --filter web exec tsc --noEmit` → Expected: los únicos errores están en `app/(profesor)/profesor/alumnos/[id]/` (Secuencia web, Global Constraints); ninguno en `components/`, `lib/` ni `plantillas/`.
Run: `pnpm --filter web test` → PASS.

Verificación en navegador (API local contra una base de desarrollo con la migración aplicada — **no Supabase de producción**; si no hay base de desarrollo disponible, reportarlo como DONE_WITH_CONCERNS con "UI no verificada en navegador"): viewport 390×844, abrir una plantilla, agregar Día 2, cargar ejercicios en ambos días, mover un ejercicio de Día 1 a Día 2 con el menú `⋯`, reordenar días con las flechas, guardar, recargar y confirmar que persiste; confirmar que "Mover a Día N" está deshabilitado cuando el destino ya tiene ese ejercicio.

```bash
git add apps/web/components "apps/web/app/(profesor)/profesor/plantillas"
git commit -m "feat(web): editor de rutina por días y plantillas con días"
```

---

### Task 9: Rutina del alumno en la vista del profesor (asignar y editar)

**Files:**

- Modify: `apps/web/app/(profesor)/profesor/alumnos/[id]/page.tsx`
- Modify: `apps/web/app/(profesor)/profesor/alumnos/[id]/instance-editor.tsx` (reescritura)
- Create: `apps/web/app/(profesor)/profesor/alumnos/[id]/new-routine-form.tsx`
- Delete: `apps/web/app/(profesor)/profesor/alumnos/[id]/assign-template-form.tsx`

**Interfaces:**

- Consumes: `RoutineDaysEditor` (Tarea 8); `diasDeRutinaAEdicion`, `DiaRutinaApi`, `aPayloadDeDias`, `claveDeVersion` (Tarea 7); `PUT /routine-instances/:id/dias` → `{ diasDesvinculados: number[] }`, `POST /routine-instances` (Tarea 6).
- Produces: `InstanceEditor({ instancia: { id: string; dias: DiaEnEdicion[] }, plantillas })`, `NewRoutineForm({ alumnoId, plantillas, reemplazaRutinaVigente })`.

- [ ] **Step 1: `InstanceEditor`**

Reemplazar `instance-editor.tsx` completo:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserApiFetch, BrowserApiError } from '../../../../../lib/browser-api-client';
import { RoutineDaysEditor } from '../../../../../components/routine-days-editor';
import { DiaEnEdicion } from '../../../../../lib/routine-types';
import { aPayloadDeDias, claveDeVersion } from '../../../../../lib/routine-days';
import { Alert, AlertDescription } from '@/components/ui/alert';

function textoDesvinculados(numeros: number[]): string {
  if (numeros.length === 1)
    return `El Día ${numeros[0]} dejó de estar sincronizado con su plantilla.`;
  const lista = `${numeros.slice(0, -1).join(', ')} y ${numeros[numeros.length - 1]}`;
  return `Los días ${lista} dejaron de estar sincronizados con su plantilla.`;
}

export function InstanceEditor({
  instancia,
  plantillas,
}: {
  instancia: { id: string; dias: DiaEnEdicion[] };
  plantillas: Array<{ id: string; nombre: string }>;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function guardar(dias: DiaEnEdicion[], { vincular }: { vincular: boolean }) {
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const { diasDesvinculados } = await browserApiFetch<{ diasDesvinculados: number[] }>(
        `routine-instances/${instancia.id}/dias`,
        {
          method: 'PUT',
          body: JSON.stringify({ dias: aPayloadDeDias(dias, { vincular, incluirIds: true }) }),
        },
      );
      if (diasDesvinculados.length > 0) setAviso(textoDesvinculados(diasDesvinculados));
      router.refresh();
    } catch (err) {
      setError(err instanceof BrowserApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {aviso && (
        <Alert>
          <AlertDescription>{aviso}</AlertDescription>
        </Alert>
      )}
      <RoutineDaysEditor
        key={claveDeVersion(instancia.dias)}
        diasIniciales={instancia.dias}
        onGuardar={guardar}
        guardando={guardando}
        error={error}
        textoGuardar="Guardar rutina"
        importacion={{ plantillas }}
      />
    </div>
  );
}
```

- [ ] **Step 2: `NewRoutineForm`**

`new-routine-form.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserApiFetch, BrowserApiError } from '../../../../../lib/browser-api-client';
import { RoutineDaysEditor } from '../../../../../components/routine-days-editor';
import { DiaEnEdicion } from '../../../../../lib/routine-types';
import { aPayloadDeDias } from '../../../../../lib/routine-days';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { useConfirm } from '@/components/confirm-dialog';

export function NewRoutineForm({
  alumnoId,
  plantillas,
  reemplazaRutinaVigente,
}: {
  alumnoId: string;
  plantillas: Array<{ id: string; nombre: string }>;
  reemplazaRutinaVigente: boolean;
}) {
  const router = useRouter();
  const confirmar = useConfirm();
  const [nombre, setNombre] = useState('');
  const [version, setVersion] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function asignar(dias: DiaEnEdicion[], { vincular }: { vincular: boolean }) {
    if (!nombre.trim()) {
      setError('Poné un nombre para la rutina.');
      return;
    }
    if (
      reemplazaRutinaVigente &&
      !(await confirmar({
        titulo: '¿Reemplazar la rutina actual?',
        descripcion: 'La rutina actual del alumno pasa al historial y queda esta como vigente.',
        confirmarLabel: 'Reemplazar',
      }))
    ) {
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await browserApiFetch('routine-instances', {
        method: 'POST',
        body: JSON.stringify({
          alumnoId,
          nombre: nombre.trim(),
          dias: aPayloadDeDias(dias, { vincular, incluirIds: false }),
        }),
      });
      setNombre('');
      setVersion((v) => v + 1);
      router.refresh();
    } catch (err) {
      setError(err instanceof BrowserApiError ? err.message : 'No se pudo asignar.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel htmlFor="nueva-rutina-nombre" className="sr-only">
          Nombre de la rutina
        </FieldLabel>
        <Input
          id="nueva-rutina-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre de la rutina"
        />
      </Field>
      <RoutineDaysEditor
        key={version}
        diasIniciales={[]}
        onGuardar={asignar}
        guardando={guardando}
        error={error}
        textoGuardar={reemplazaRutinaVigente ? 'Reemplazar rutina' : 'Asignar rutina'}
        permiteGuardarVacio={false}
        importacion={{
          plantillas,
          onPlantillaCompletaImportada: (nombrePlantilla) =>
            setNombre((actual) => (actual.trim() ? actual : nombrePlantilla)),
        }}
      />
    </div>
  );
}
```

```bash
git rm "apps/web/app/(profesor)/profesor/alumnos/[id]/assign-template-form.tsx"
```

- [ ] **Step 3: Página**

Reemplazar `apps/web/app/(profesor)/profesor/alumnos/[id]/page.tsx` completo:

```tsx
import { apiFetch, ApiError } from '../../../../../lib/api-client';
import { InstanceEditor } from './instance-editor';
import { NewRoutineForm } from './new-routine-form';
import { LogoutButton } from '../../../../../components/logout-button';
import { HomeLink } from '../../../../../components/ui/home-link';
import { DiaRutinaApi, diasDeRutinaAEdicion } from '../../../../../lib/routine-days';

interface TemplateOption {
  id: string;
  nombre: string;
  activa: boolean;
}

interface RutinaVigenteResponse {
  id: string;
  nombre: string;
  dias: DiaRutinaApi[];
}

export default async function AlumnoDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const plantillas = (await apiFetch<TemplateOption[]>('/routine-templates'))
    .filter((p) => p.activa)
    .map(({ id, nombre }) => ({ id, nombre }));

  let rutinaVigente: RutinaVigenteResponse | null = null;
  try {
    rutinaVigente = await apiFetch<RutinaVigenteResponse>(`/users/${params.id}/rutina-vigente`);
  } catch (error) {
    // 200 con body vacío si no hay vigente; este catch es para un 403/404 real.
    if (!(error instanceof ApiError)) throw error;
    rutinaVigente = null;
  }

  return (
    <main className="flex w-full flex-col gap-6 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-16">
      <div className="flex items-center justify-between">
        <HomeLink href="/profesor" />
        <LogoutButton />
      </div>

      <h1 className="text-xl font-semibold text-foreground">
        {rutinaVigente ? `Rutina de ${rutinaVigente.nombre}` : 'Sin rutina asignada'}
      </h1>

      {rutinaVigente && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Ajustar rutina</h2>
          <InstanceEditor
            instancia={{ id: rutinaVigente.id, dias: diasDeRutinaAEdicion(rutinaVigente.dias) }}
            plantillas={plantillas}
          />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {rutinaVigente ? 'Reemplazar por una rutina nueva' : 'Armar rutina'}
        </h2>
        {plantillas.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No tenés plantillas activas — podés armar la rutina desde cero o crear una en{' '}
            <a href="/profesor/plantillas" className="text-primary-soft underline">
              Mis plantillas
            </a>
            .
          </p>
        )}
        <NewRoutineForm
          alumnoId={params.id}
          plantillas={plantillas}
          reemplazaRutinaVigente={Boolean(rutinaVigente)}
        />
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Verificación y commit**

Run: `pnpm --filter web exec tsc --noEmit` → OK. Run: `pnpm --filter web test` → PASS. Run: `pnpm --filter web build` → OK. Run: `pnpm lint` → sin errores nuevos.

Verificación en navegador (mismas condiciones que la Tarea 8; 390×844): asignar a un alumno "Plantilla completa" de una plantilla de 2 días con la casilla marcada (el nombre se autocompleta); ver el badge "Sincronizado · …" en cada día; editar la plantilla (cambiar series de un ejercicio y mover un ejercicio de día) y confirmar que el alumno conserva sus series; en la rutina del alumno agregar un ejercicio al Día 1 → guardar → aparece "El Día 1 dejó de estar sincronizado…" y el badge desaparece solo en ese día; "Traer de plantilla" → "Reemplazar Día 2".

```bash
git add "apps/web/app/(profesor)/profesor/alumnos/[id]"
git commit -m "feat(web): asignar y ajustar la rutina del alumno por días, combinando plantillas"
```

---

### Task 10: Vista del alumno con selector de días

**Files:**

- Create: `apps/web/app/(alumno)/alumno/lista-ejercicios-del-dia.tsx`
- Create: `apps/web/app/(alumno)/alumno/selector-de-dias.tsx`
- Modify: `apps/web/app/(alumno)/alumno/page.tsx`

**Interfaces:**

- Consumes: `diaInicialParaAlumno`, `claveDiaAlumno` (Tarea 7); `GET /users/me/rutina-vigente` → `{ id, nombre, dias: [{ numero, ejercicios[] }] }` (Tarea 4).
- Produces: `ListaEjerciciosDelDia({ ejercicios })`, `SelectorDeDias({ rutinaId, dias })`, tipo `EjercicioDeRutina`.

- [ ] **Step 1: Lista de un día (extraída de la página actual)**

`apps/web/app/(alumno)/alumno/lista-ejercicios-del-dia.tsx`:

```tsx
import Link from 'next/link';
import Image from 'next/image';
import { Dumbbell } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GradientIcon } from '../../../components/ui/gradient-icon';

export interface EjercicioDeRutina {
  exerciseId: string;
  nombre: string;
  imageUrl: string | null;
  orden: number;
  series: number;
  repeticiones: number;
  peso: number | null;
}

export function ListaEjerciciosDelDia({ ejercicios }: { ejercicios: EjercicioDeRutina[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {[...ejercicios]
        .sort((a, b) => a.orden - b.orden)
        .map((ejercicio) => (
          <li key={ejercicio.exerciseId}>
            <Link
              href={`/catalogo/${ejercicio.exerciseId}`}
              className="block rounded-2xl focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="flex flex-row items-center gap-3 p-4 lg:p-3">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-background">
                  {ejercicio.imageUrl ? (
                    <Image
                      src={ejercicio.imageUrl}
                      alt={ejercicio.nombre}
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <GradientIcon icon={Dumbbell} size={20} />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <p className="text-sm font-medium text-foreground">{ejercicio.nombre}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline">{ejercicio.series} series</Badge>
                    <Badge variant="outline">{ejercicio.repeticiones} reps</Badge>
                    {ejercicio.peso !== null && <Badge variant="outline">{ejercicio.peso}kg</Badge>}
                  </div>
                </div>
              </Card>
            </Link>
          </li>
        ))}
    </ul>
  );
}
```

(La key por `exerciseId` es válida: dentro de un día no hay repetidos.)

- [ ] **Step 2: Selector de días**

`apps/web/app/(alumno)/alumno/selector-de-dias.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ListaEjerciciosDelDia, EjercicioDeRutina } from './lista-ejercicios-del-dia';
import { claveDiaAlumno, diaInicialParaAlumno } from '../../../lib/routine-days';

function leerDiaGuardado(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function guardarDia(clave: string, numero: number): void {
  try {
    window.localStorage.setItem(clave, String(numero));
  } catch {
    // modo privado / almacenamiento bloqueado: se sigue sin recordar el día
  }
}

export function SelectorDeDias({
  rutinaId,
  dias,
}: {
  rutinaId: string;
  dias: Array<{ numero: number; ejercicios: EjercicioDeRutina[] }>;
}) {
  const clave = claveDiaAlumno(rutinaId);
  const [numero, setNumero] = useState(1);

  useEffect(() => {
    setNumero(diaInicialParaAlumno(leerDiaGuardado(clave), dias.length));
  }, [clave, dias.length]);

  function elegir(n: number) {
    setNumero(n);
    guardarDia(clave, n);
  }

  const dia = dias.find((d) => d.numero === numero) ?? dias[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Días de tu rutina">
        {dias.map((d) => (
          <Button
            key={d.numero}
            type="button"
            aria-pressed={d.numero === dia.numero}
            variant={d.numero === dia.numero ? 'brand' : 'outline'}
            size="sm"
            className="shrink-0"
            onClick={() => elegir(d.numero)}
          >
            Día {d.numero} ({d.ejercicios.length})
          </Button>
        ))}
      </div>
      <ListaEjerciciosDelDia ejercicios={dia.ejercicios} />
    </div>
  );
}
```

- [ ] **Step 3: Página del alumno**

En `apps/web/app/(alumno)/alumno/page.tsx`:

- `RutinaVigenteResponse` pasa a `{ id: string; nombre: string; dias: Array<{ numero: number; ejercicios: EjercicioDeRutina[] }> }` (import de `./lista-ejercicios-del-dia`).
- Quitar los imports que dejan de usarse (`Link`, `Image`, `Card`, `Badge`, `GradientIcon`).
- Tratar `rutina.dias.length === 0` igual que "sin rutina" pero con el texto `Tu rutina todavía no tiene ejercicios` / `Tu profesor la está armando — volvé a revisar más tarde.` (misma estructura `Empty` que ya tiene la página).
- Reemplazar el `<ul>…</ul>` del render final por:

```tsx
{
  rutina.dias.length === 1 ? (
    <ListaEjerciciosDelDia ejercicios={rutina.dias[0].ejercicios} />
  ) : (
    <SelectorDeDias rutinaId={rutina.id} dias={rutina.dias} />
  );
}
```

- [ ] **Step 4: Verificación y commit**

Run: `pnpm --filter web exec tsc --noEmit` → OK. Run: `pnpm --filter web build` → OK.

Verificación en navegador (390×844, logueado como alumno): rutina de 1 día → sin chips, igual que antes; rutina de 3 días → chips `Día 1 (n)`; elegir Día 3, recargar → abre en Día 3; con el profesor, quitar días hasta dejar 2 → el alumno abre en Día 1; en ventana privada abre en Día 1 sin errores de consola.

```bash
git add "apps/web/app/(alumno)/alumno"
git commit -m "feat(web): el alumno elige qué día de su rutina ver y se recuerda en el teléfono"
```

---

### Task 11: Documentación (HLD + PRD)

**Files:**

- Modify: `docs/hld-mvp.md` §Routines
- Modify: `docs/prd-mvp.md` HU-04, HU-05, HU-06, HU-08

- [ ] **Step 1: HLD §Routines**

En `docs/hld-mvp.md`, dentro de `### Routines`:

- Reemplazar los bullets de `RoutineTemplate`, `RoutineTemplateExercise`, `RoutineInstance` y `RoutineInstanceExercise` por:

```markdown
- `RoutineTemplate` (id, gymId, profesorId, nombre, descripción, activa, createdAt) → `RoutineTemplateDay` (id, templateId, numero 1..7) → `RoutineTemplateExercise` (id, dayId, exerciseId, orden por día, series, repeticiones, peso nullable, notas)
- `RoutineInstance` (id, gymId, **profesorId nullable**, alumnoId, nombre, vigenteDesde, vigenteHasta nullable, activa) → `RoutineInstanceDay` (id, instanceId, numero 1..7, **vinculadoADiaId nullable** → `RoutineTemplateDay.id`, `onDelete: SetNull`) → `RoutineInstanceExercise` (id, dayId, exerciseId, orden por día, series, repeticiones, peso nullable, notas). `profesorId` nullable por la cascada de hard-delete de PROFESOR.
- **Días (spec `docs/superpowers/specs/2026-09-24-rutina-por-dias-design.md`):** hasta 7 días numerados (no días de la semana), 50 ejercicios en total, ≥ 1 ejercicio por día, sin ejercicio repetido dentro de un día. Una rutina de alumno puede combinar días de distintas plantillas. El alumno elige qué día ver; el último elegido se guarda solo en su dispositivo.
- **Vínculo por día:** "vinculado" ≡ `vinculadoADiaId` no nulo, apuntando al **id** del día de plantilla (reordenar la plantilla no mueve vínculos). Regla única, calculada en el servidor: un día queda vinculado sii el request lo pide, su conjunto de ejercicios coincide con el del día de plantilla y, si es un vínculo nuevo, la plantilla es del profesor que invoca (si no, 404). Agregar/quitar ejercicios o mover uno de día desvincula el/los días tocados; series/reps/peso/orden y reordenar días no. Borrar un día de plantilla desvincula (SetNull) sin tocar el día del alumno.
- **Propagación:** guardar una plantilla actualiza, en la misma transacción, cada día de alumno activo vinculado a uno de sus días: estructura/orden/notas de la plantilla; series/reps/peso del alumno (mismo día → otro día vinculado a la misma plantilla si aparece una sola vez → plantilla).
```

- Reemplazar el bullet "Al asignar: `RoutineTemplateExercise[]` se clona 1:1…" por: `- Al asignar, el profesor manda los días ya armados (desde plantilla completa, días sueltos de plantillas o desde cero); el servidor los persiste y decide el vínculo de cada uno con la regla de arriba.`
- Reemplazar el bullet "**Edición de ejercicios: replace-all transaccional.**…" por: `- **Edición: días por id, ejercicios replace-all.** \`PUT /routine-templates/:id/dias\` y \`PUT /routine-instances/:id/dias\` reciben todos los días en orden (la posición define el número). Los días se persisten por id (update/create/delete) porque los vínculos los referencian; la renumeración se hace en dos pasadas para no chocar con \`@@unique([…, numero])\`. Los ejercicios de cada día se reemplazan completos.`
- En el bullet de **Endpoints**, reemplazar `PUT /routine-templates/:id/exercises` por `PUT /routine-templates/:id/dias` y `PUT /routine-instances/:id/exercises` por `PUT /routine-instances/:id/dias` (responde `{ diasDesvinculados }`), y agregar que `rutina-vigente` devuelve `dias[]` (la vista PROFESOR incluye `vinculado` por día).
- En el bullet de hard-delete de plantillas, reemplazar la mención a `origenTemplateId` por `RoutineInstanceDay.vinculadoADiaId`.

- [ ] **Step 2: PRD**

En `docs/prd-mvp.md`, agregar como criterio de aceptación:

- HU-04: `- Puedo dividir la plantilla en días (Día 1…Día 7), reordenarlos y mover un ejercicio de un día a otro.`
- HU-05: `- Puedo armar la rutina del alumno combinando días de distintas plantillas (o traer una plantilla completa) y días armados desde cero. Con "Mantener sincronizado", cada día traído de plantilla queda vinculado a ese día de la plantilla.`
- HU-06: `- Puedo traer un día de plantilla a la rutina vigente (como día nuevo o reemplazando uno). Si modifico los ejercicios de un día vinculado, solo ese día se desvincula y la app me lo avisa.`
- HU-08: `- Dado que mi rutina tiene varios días, cuando entro elijo qué día hacer hoy; la app abre en el último día que elegí en ese teléfono. Con un solo día, la veo como una lista, sin selector.`
- En HU-05, reemplazar el criterio de `vinculada: true` por: `- Dado que asigno días de plantilla con "Mantener sincronizado", cuando edito esa plantilla, entonces cada día vinculado del alumno se actualiza conservando sus series/reps/peso (ver HLD §Routines).`

- [ ] **Step 3: Commit**

```bash
git add docs/hld-mvp.md docs/prd-mvp.md
git commit -m "docs: rutina dividida en días en HLD y PRD"
```

---

## Deploy (manual, lo hace el usuario después de mergear)

La migración elimina columnas que usa la API actual, y la respuesta de `rutina-vigente` cambia de formato: la ventana entre pasos es de minutos y se acepta (spec §Deploy). Orden:

1. Push de `master` → Vercel publica la web nueva (la vista del alumno falla contra la API vieja hasta el paso 3).
2. Desde `apps/api`, con el `.env` apuntando a Supabase: `npx prisma migrate deploy` (aplica `20260924120000_rutina_por_dias`).
3. **Render → Manual Deploy** de la API inmediatamente después.
4. Verificar en producción: un alumno con rutina existente la ve igual que antes (un solo día, sin selector).
