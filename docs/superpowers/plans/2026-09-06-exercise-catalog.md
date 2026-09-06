# Bloque 2: ExerciseCatalog expuesto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exponer el catálogo de 1.324 ejercicios (dataset real, media en Supabase Storage) vía `GET /exercises` / `GET /exercises/:id`, y construir la primera pantalla de producto real (`(profesor)/catalogo`) con el sistema de estilo (tema claro/oscuro, tokens, íconos) que va a heredar Bloque 3.

**Architecture:** Backend hexagonal igual que `identity` (`domain/application/infrastructure`), con un `DomainError` compartido en `shared-kernel` para que el filtro de excepciones global no dependa de importar cada clase de error de cada módulo. Frontend: catálogo como Client Component que consume `apps/api` vía el proxy same-origin `/api/proxy/*` ya existente (necesario para que Bloque 3 lo embeba en el armador de rutinas sin romper estado por navegación de URL).

**Tech Stack:** NestJS + Prisma + Postgres (Supabase) + `@supabase/supabase-js` (Storage) en el backend; Next.js App Router + Tailwind + `lucide-react` en el frontend.

## Global Constraints

- Sin scoping por `gymId` en el catálogo — es global en el MVP (`gymId: null`), cambia en Fase 2.
- El GIF animado solo se muestra en el detalle del ejercicio, nunca en el grid del listado.
- La atribución de licencia (`atribucionMedia`, © Gym Visual) tiene que ser visible y legible en el detalle, no cosmética ni escondida.
- Sin selector de acento en runtime para el usuario final — el acento del tema se define editando `app/tokens.css`.
- Sin librería de íconos de anatomía/grupo muscular (no existe ninguna utilizable) — el grupo muscular se representa con chips de color, no íconos.
- `apps/web` no tiene test runner — toda verificación de frontend es por `next build` + inspección de markup/manual, igual que en fases anteriores.
- No hacer `git commit`/`git push` salvo pedido explícito del usuario — cada task termina con los cambios en el working tree, no comiteados, salvo que el ejecutor del plan tenga instrucción distinta.

Fuente de contexto completa: `docs/superpowers/specs/2026-09-06-exercise-catalog-design.md` (leer antes de ejecutar si algo de este plan no cierra con lo que ahí se explica).

---

### Task 1: Migración de schema — `parteCuerpo`/`pasos`, elimina `ExerciseCategory`

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_exercise_catalog_real_shape/migration.sql`

**Interfaces:**

- Produce: el modelo `Exercise` con `parteCuerpo: String`, `pasos: String[]`, sin `categoria` ni el enum `ExerciseCategory`. Todas las tasks siguientes asumen este schema.

- [ ] **Step 1: Confirmar el estado actual de la tabla antes de tocar nada**

Run: `cd apps/api && node_modules/.bin/tsx -e "import('./src/shared-kernel/prisma.service').then(async ({PrismaService}) => { const p = new PrismaService(); console.log('filas en Exercise:', await p.exercise.count()); await p.\$disconnect(); })"`

Expected: `filas en Exercise: 2` (las 2 filas de fixture cargadas por error contra Supabase real en una sesión anterior — ver spec, sección "Contexto").

Si el conteo es distinto de 2, PARAR y avisar al usuario antes de seguir — el `DELETE FROM "Exercise"` del Step 3 asume que son solo esas 2 filas de fixture, no datos reales que alguien haya cargado a mano.

- [ ] **Step 2: Editar `schema.prisma`** — reemplazar el modelo `Exercise` completo y borrar el enum `ExerciseCategory`

Bloque actual a reemplazar:

```prisma
enum ExerciseCategory {
  STRENGTH
  CARDIO
  STRETCHING
  PLYOMETRICS
  OTHER
}
```

Se borra por completo (ninguna otra parte del schema ni del código lo referencia — confirmado por grep).

Modelo `Exercise` actual a reemplazar por:

```prisma
model Exercise {
  id                          String   @id @default(uuid())
  externalId                  String?  @unique
  gymId                       String?
  nombre                      String
  parteCuerpo                 String
  grupoMuscular               String
  gruposMuscularesSecundarios String[] @default([])
  equipamiento                String?
  imageUrl                    String?
  gifUrl                      String?
  instrucciones               String?
  pasos                       String[] @default([])
  fuente                      ExerciseSource @default(CATALOG)
  licenciaMedia               String?
  atribucionMedia             String?
  createdAt                   DateTime @default(now())
  updatedAt                   DateTime @updatedAt

  ejerciciosDeTemplate RoutineTemplateExercise[]
  ejerciciosDeInstance RoutineInstanceExercise[]

  @@index([gymId])
  @@index([parteCuerpo])
  @@index([equipamiento])
}
```

- [ ] **Step 3: Generar el SQL de la migración sin aplicarlo**

Run: `cd apps/api && node_modules/.bin/prisma migrate diff --from-url "$(grep DIRECT_URL .env | cut -d '=' -f2- | tr -d '"')" --to-schema-datamodel prisma/schema.prisma --script`

Expected (nombres de índice confirmados contra la migración `20260904201402_refine_exercise_catalog` ya aplicada, que los creó con estos mismos nombres):

```sql
-- DropIndex
DROP INDEX "Exercise_categoria_idx";

-- DropIndex
DROP INDEX "Exercise_grupoMuscular_idx";

-- AlterTable
ALTER TABLE "Exercise" DROP COLUMN "categoria",
ADD COLUMN     "parteCuerpo" TEXT NOT NULL,
ADD COLUMN     "pasos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- DropEnum
DROP TYPE "ExerciseCategory";

-- CreateIndex
CREATE INDEX "Exercise_parteCuerpo_idx" ON "Exercise"("parteCuerpo");

-- CreateIndex
CREATE INDEX "Exercise_equipamiento_idx" ON "Exercise"("equipamiento");
```

Si el output real difiere en nombres exactos, usar el output real de Prisma en el Step 4, no lo de acá.

- [ ] **Step 4: Materializar la migración con el `DELETE` primero**

Crear `apps/api/prisma/migrations/<timestamp-UTC-actual>_exercise_catalog_real_shape/migration.sql` con este contenido — el `DELETE` va PRIMERO, antes del `ALTER TABLE`, porque `parteCuerpo TEXT NOT NULL` sin default falla si hay filas existentes sin ese valor (mismo criterio ya usado en la migración `user_email_to_username`):

```sql
-- Se truncan las 2 filas de fixture cargadas por error contra Supabase real
-- en una sesión anterior (su externalId no matchea el dataset real de
-- exercises-dataset, así que un upsert no las iba a pisar — quedarían
-- huérfanas y con columnas rotas tras este ALTER). Ver
-- docs/superpowers/specs/2026-09-06-exercise-catalog-design.md, sección
-- "Contexto y hallazgos previos al diseño".
DELETE FROM "Exercise";

-- DropIndex
DROP INDEX "Exercise_categoria_idx";

-- DropIndex
DROP INDEX "Exercise_grupoMuscular_idx";

-- AlterTable
ALTER TABLE "Exercise" DROP COLUMN "categoria",
ADD COLUMN     "parteCuerpo" TEXT NOT NULL,
ADD COLUMN     "pasos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- DropEnum
DROP TYPE "ExerciseCategory";

-- CreateIndex
CREATE INDEX "Exercise_parteCuerpo_idx" ON "Exercise"("parteCuerpo");

-- CreateIndex
CREATE INDEX "Exercise_equipamiento_idx" ON "Exercise"("equipamiento");
```

(usar el timestamp real del momento de ejecución, formato `YYYYMMDDHHMMSS`, posterior a `20260905114223`, el último existente).

- [ ] **Step 5: Aplicar contra Supabase**

Run: `cd apps/api && node_modules/.bin/prisma migrate deploy`
Expected: `All migrations have been successfully applied.`

- [ ] **Step 6: Regenerar el client y validar**

Run: `cd apps/api && node_modules/.bin/prisma generate && node_modules/.bin/prisma validate`
Expected: `Generated Prisma Client` + `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 7: Confirmar que la tabla quedó en 0 filas (evidencia del DELETE)**

Run: `cd apps/api && node_modules/.bin/tsx -e "import('./src/shared-kernel/prisma.service').then(async ({PrismaService}) => { const p = new PrismaService(); console.log('filas en Exercise tras migración:', await p.exercise.count()); await p.\$disconnect(); })"`

Expected: `filas en Exercise tras migración: 0`

- [ ] **Step 8: Correr la suite completa (nada de esto debería tocar tests, es solo schema)**

Run: `cd apps/api && node_modules/.bin/jest`
Expected: mismo conteo de tests que antes de este task, todos en verde (ningún test referencia `categoria`/`ExerciseCategory`, confirmado por grep antes de este plan).

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(exercise-catalog): migrar Exercise a la forma real del dataset (parteCuerpo/pasos, sin categoria)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `DomainError` compartido — relocalizar el filtro de excepciones

**Files:**

- Create: `apps/api/src/shared-kernel/domain-error.ts`
- Create: `apps/api/src/shared-kernel/domain-exception.filter.ts`
- Create: `apps/api/src/shared-kernel/domain-exception.filter.spec.ts`
- Delete: `apps/api/src/identity/infrastructure/filters/domain-exception.filter.ts`
- Delete: `apps/api/src/identity/infrastructure/filters/domain-exception.filter.spec.ts`
- Modify: `apps/api/src/identity/application/errors/duplicate-username.error.ts`
- Modify: `apps/api/src/identity/application/errors/role-hierarchy.error.ts`
- Modify: `apps/api/src/identity/application/errors/insufficient-role.error.ts`
- Modify: `apps/api/src/identity/application/errors/invalid-credentials.error.ts`
- Modify: `apps/api/src/identity/application/errors/user-not-found.error.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/src/identity/infrastructure/login-flow.e2e.spec.ts`

**Interfaces:**

- Produce: `DomainError` (abstract, `readonly httpStatus: number`) en `shared-kernel/domain-error.ts` — Task 5 lo usa para `ExerciseNotFoundError`.
- Produce: `DomainExceptionFilter` en `shared-kernel/domain-exception.filter.ts`, `@Catch(DomainError)` — cualquier módulo futuro queda cubierto sin tocar este archivo.

- [ ] **Step 1: Crear la clase base**

`apps/api/src/shared-kernel/domain-error.ts`:

```typescript
/**
 * Base de todos los errores de dominio de la app — cada bounded context
 * declara los suyos extendiendo esta clase con su propio `httpStatus`.
 * `DomainExceptionFilter` (global, registrado en main.ts) captura
 * cualquier `DomainError` sin necesidad de importar cada clase concreta:
 * un módulo nuevo agrega sus errores sin tocar el filtro.
 *
 * Sin dependencias de framework (ni siquiera el enum `HttpStatus` de
 * Nest) — `httpStatus` es un número plano, la capa de dominio no conoce
 * NestJS.
 */
export abstract class DomainError extends Error {
  abstract readonly httpStatus: number;
}
```

- [ ] **Step 2: Actualizar los 5 errores de `identity` para extender `DomainError`**

`apps/api/src/identity/application/errors/duplicate-username.error.ts`:

```typescript
import { DomainError } from '../../../shared-kernel/domain-error';

export class DuplicateUsernameError extends DomainError {
  readonly httpStatus = 409;

  constructor(username: string, gymId: string) {
    super(`Ya existe un usuario con username '${username}' en el gym '${gymId}'.`);
    this.name = 'DuplicateUsernameError';
  }
}
```

`apps/api/src/identity/application/errors/role-hierarchy.error.ts`:

```typescript
import { DomainError } from '../../../shared-kernel/domain-error';

export class RoleHierarchyError extends DomainError {
  readonly httpStatus = 403;

  constructor(rolInvocador: string, rolSolicitado: string) {
    super(`El rol '${rolInvocador}' no puede crear usuarios con rol '${rolSolicitado}'.`);
    this.name = 'RoleHierarchyError';
  }
}
```

`apps/api/src/identity/application/errors/insufficient-role.error.ts`:

```typescript
import { DomainError } from '../../../shared-kernel/domain-error';

export class InsufficientRoleError extends DomainError {
  readonly httpStatus = 403;

  constructor(rolActual: string, rolesRequeridos: string[]) {
    super(
      `El rol '${rolActual}' no está autorizado. Se requiere uno de: ${rolesRequeridos.join(', ')}.`,
    );
    this.name = 'InsufficientRoleError';
  }
}
```

`apps/api/src/identity/application/errors/invalid-credentials.error.ts`:

```typescript
import { DomainError } from '../../../shared-kernel/domain-error';

export class InvalidCredentialsError extends DomainError {
  readonly httpStatus = 401;

  constructor() {
    super('Usuario o contraseña incorrectos.');
    this.name = 'InvalidCredentialsError';
  }
}
```

`apps/api/src/identity/application/errors/user-not-found.error.ts`:

```typescript
import { DomainError } from '../../../shared-kernel/domain-error';

export class UserNotFoundError extends DomainError {
  readonly httpStatus = 404;

  constructor(userId: string) {
    super(`No existe un usuario con id '${userId}' en tu gym.`);
    this.name = 'UserNotFoundError';
  }
}
```

- [ ] **Step 3: Crear el filtro relocalizado**

`apps/api/src/shared-kernel/domain-exception.filter.ts`:

```typescript
import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from './domain-error';

/**
 * Traduce cualquier `DomainError` (de cualquier módulo) a HTTP status en
 * el borde de la app — los casos de uso y los controllers no conocen
 * códigos HTTP. Nunca deja pasar un stack trace crudo: si la excepción no
 * es un `DomainError`, no la captura (el exception filter default de
 * Nest la maneja).
 */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(exception.httpStatus).json({
      statusCode: exception.httpStatus,
      error: exception.name,
      message: exception.message,
    });
  }
}
```

- [ ] **Step 4: Escribir el spec relocalizado (con regresión de los 5 errores reales)**

`apps/api/src/shared-kernel/domain-exception.filter.spec.ts`:

```typescript
import { ArgumentsHost } from '@nestjs/common';
import { DomainExceptionFilter } from './domain-exception.filter';
import { DomainError } from './domain-error';
import { DuplicateUsernameError } from '../identity/application/errors/duplicate-username.error';
import { RoleHierarchyError } from '../identity/application/errors/role-hierarchy.error';
import { InsufficientRoleError } from '../identity/application/errors/insufficient-role.error';
import { InvalidCredentialsError } from '../identity/application/errors/invalid-credentials.error';
import { UserNotFoundError } from '../identity/application/errors/user-not-found.error';

class ErrorDePrueba extends DomainError {
  readonly httpStatus = 418;
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDePrueba';
  }
}

function buildHost(): { host: ArgumentsHost; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, json, status };
}

describe('DomainExceptionFilter', () => {
  const filter = new DomainExceptionFilter();

  it('mapea cualquier DomainError a su httpStatus propio, sin conocer la clase concreta', () => {
    const { host, status, json } = buildHost();
    const error = new ErrorDePrueba('mensaje de prueba');

    filter.catch(error, host);

    expect(status).toHaveBeenCalledWith(418);
    expect(json).toHaveBeenCalledWith({
      statusCode: 418,
      error: 'ErrorDePrueba',
      message: 'mensaje de prueba',
    });
  });

  it.each([
    [new DuplicateUsernameError('juan.perez', 'gym-1'), 409, 'DuplicateUsernameError'],
    [new RoleHierarchyError('PROFESOR', 'PROFESOR'), 403, 'RoleHierarchyError'],
    [new InsufficientRoleError('PROFESOR', ['ADMIN']), 403, 'InsufficientRoleError'],
    [new InvalidCredentialsError(), 401, 'InvalidCredentialsError'],
    [new UserNotFoundError('user-x'), 404, 'UserNotFoundError'],
  ])(
    'errores reales de identity: mapea %p al status %i (regresión post-refactor)',
    (error, statusEsperado, nombreEsperado) => {
      const { host, status, json } = buildHost();

      filter.catch(error as DomainError, host);

      expect(status).toHaveBeenCalledWith(statusEsperado);
      expect(json).toHaveBeenCalledWith({
        statusCode: statusEsperado,
        error: nombreEsperado,
        message: (error as Error).message,
      });
    },
  );
});
```

- [ ] **Step 5: Borrar los archivos viejos**

Run: `git rm apps/api/src/identity/infrastructure/filters/domain-exception.filter.ts apps/api/src/identity/infrastructure/filters/domain-exception.filter.spec.ts`

- [ ] **Step 6: Actualizar el import en `main.ts`**

En `apps/api/src/main.ts`, cambiar:

```typescript
import { DomainExceptionFilter } from './identity/infrastructure/filters/domain-exception.filter';
```

por:

```typescript
import { DomainExceptionFilter } from './shared-kernel/domain-exception.filter';
```

- [ ] **Step 7: Actualizar el import en `login-flow.e2e.spec.ts`**

En `apps/api/src/identity/infrastructure/login-flow.e2e.spec.ts`, cambiar:

```typescript
import { DomainExceptionFilter } from './filters/domain-exception.filter';
```

por:

```typescript
import { DomainExceptionFilter } from '../../shared-kernel/domain-exception.filter';
```

- [ ] **Step 8: Correr la suite completa**

Run: `cd apps/api && node_modules/.bin/jest`
Expected: mismo conteo total de tests que antes (una spec se borró con 5 casos `it.each`, la nueva tiene 1 + 5 = 6 `it`/`it.each` cases — verificar que el total no bajó respecto al de antes de este task) — todos en verde.

- [ ] **Step 9: Typecheck y build**

Run: `cd apps/api && node_modules/.bin/tsc --noEmit -p tsconfig.json && node_modules/.bin/nest build`
Expected: sin errores.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/shared-kernel/domain-error.ts apps/api/src/shared-kernel/domain-exception.filter.ts apps/api/src/shared-kernel/domain-exception.filter.spec.ts apps/api/src/identity/application/errors/ apps/api/src/main.ts apps/api/src/identity/infrastructure/login-flow.e2e.spec.ts
git commit -m "refactor(shared-kernel): DomainError base + relocalizar DomainExceptionFilter

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Reescribir el mapeo del dataset (forma real) + fixture

**Files:**

- Create: `apps/api/src/exercise-catalog/infrastructure/seed/dataset-mapper.ts`
- Create: `apps/api/src/exercise-catalog/infrastructure/seed/dataset-mapper.spec.ts`
- Create: `apps/api/prisma/exercise-media-bucket.ts`
- Modify: `apps/api/prisma/seed-exercises.ts`
- Modify: `apps/api/prisma/seed-exercises.fixture.json`
- Modify: `apps/api/.env.example`
- Modify: `apps/api/package.json`

**Interfaces:**

- Consume: nada de tasks anteriores.
- Produce: `mapExerciseFields(item, resolverUrlMedia)` y `validarDatasetExercise(item, index)`, usados por `prisma/seed-exercises.ts` (este task) y ningún otro consumidor. `EXERCISE_MEDIA_BUCKET` (string), usado por Task 4.

**Nota:** las funciones puras de mapeo viven en `src/exercise-catalog/infrastructure/seed/` (no en `prisma/`) porque `jest.config.js` tiene `rootDir: 'src'` — un `.spec.ts` en `prisma/` nunca sería descubierto por el test runner.

- [ ] **Step 1: Escribir el test de mapeo (falla porque el archivo no existe)**

`apps/api/src/exercise-catalog/infrastructure/seed/dataset-mapper.spec.ts`:

```typescript
import {
  mapExerciseFields,
  validarDatasetExercise,
  DatasetExercise,
  LICENCIA_MEDIA,
} from './dataset-mapper';

const itemCompleto: DatasetExercise = {
  id: '0001',
  name: '3/4 sit-up',
  body_part: 'waist',
  target: 'abs',
  secondary_muscles: ['hip flexors', 'lower back'],
  equipment: 'body weight',
  image: 'images/0001-2gPfomN.jpg',
  gif_url: 'videos/0001-2gPfomN.gif',
  instructions: { es: 'Instrucción en español.', en: 'English instruction.' },
  instruction_steps: { es: ['Paso 1', 'Paso 2'], en: ['Step 1', 'Step 2'] },
  attribution: '© Gym visual — https://gymvisual.com/',
};

describe('mapExerciseFields', () => {
  it('mapea todos los campos desde el item completo del dataset', () => {
    const resolver = jest.fn((ruta: string | null) =>
      ruta ? `https://cdn.example.com/${ruta}` : null,
    );

    const resultado = mapExerciseFields(itemCompleto, resolver);

    expect(resultado).toEqual({
      nombre: '3/4 sit-up',
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
  });

  it('usa el español de instructions/instruction_steps, no otro idioma', () => {
    const resultado = mapExerciseFields(itemCompleto, () => null);
    expect(resultado.instrucciones).toBe('Instrucción en español.');
    expect(resultado.pasos).toEqual(['Paso 1', 'Paso 2']);
  });

  it('resuelve equipment/image/gif_url null a null, sin romper (defensivo, el dataset real no tiene huecos hoy pero el schema los permite)', () => {
    const itemSinMedia: DatasetExercise = {
      ...itemCompleto,
      equipment: null,
      image: null,
      gif_url: null,
    };
    const resolver = jest.fn(() => 'no debería llamarse con ruta null');

    const resultado = mapExerciseFields(itemSinMedia, resolver);

    expect(resultado.equipamiento).toBeNull();
    expect(resultado.imageUrl).toBeNull();
    expect(resultado.gifUrl).toBeNull();
  });

  it('usa el fallback de atribución si el dataset no trae el campo attribution', () => {
    const { attribution, ...itemSinAtribucion } = itemCompleto;
    const resultado = mapExerciseFields(itemSinAtribucion as DatasetExercise, () => null);
    expect(resultado.atribucionMedia).toBe('© Gym visual — https://gymvisual.com/');
  });

  it('gruposMuscularesSecundarios vacío si el dataset no trae secondary_muscles', () => {
    const { secondary_muscles, ...resto } = itemCompleto;
    const itemSinSecundarios = {
      ...resto,
      secondary_muscles: undefined,
    } as unknown as DatasetExercise;

    const resultado = mapExerciseFields(itemSinSecundarios, () => null);

    expect(resultado.gruposMuscularesSecundarios).toEqual([]);
  });
});

describe('validarDatasetExercise', () => {
  it('no lanza con un item válido', () => {
    expect(() => validarDatasetExercise(itemCompleto, 0)).not.toThrow();
  });

  it('lanza si falta id, mencionando el índice', () => {
    const { id, ...resto } = itemCompleto;
    expect(() => validarDatasetExercise(resto as DatasetExercise, 5)).toThrow(/índice 5/);
  });

  it('lanza si falta name, mencionando el id', () => {
    const { name, ...resto } = itemCompleto;
    expect(() => validarDatasetExercise({ ...resto, id: '0099' } as DatasetExercise, 0)).toThrow(
      /0099/,
    );
  });

  it('lanza si falta body_part', () => {
    const { body_part, ...resto } = itemCompleto;
    expect(() => validarDatasetExercise({ ...resto, id: '0099' } as DatasetExercise, 0)).toThrow(
      /body_part/,
    );
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `cd apps/api && node_modules/.bin/jest dataset-mapper --no-coverage`
Expected: FAIL — `Cannot find module './dataset-mapper'`

- [ ] **Step 3: Implementar `dataset-mapper.ts`**

`apps/api/src/exercise-catalog/infrastructure/seed/dataset-mapper.ts`:

```typescript
/**
 * Forma real del dataset (verificada contra un checkout de
 * https://github.com/hasaneyldrm/exercises-dataset, rama main, 1.324
 * items) — la interfaz anterior de `seed-exercises.ts` estaba inferida de
 * la documentación pública y NO coincidía con el dataset real. Ver
 * docs/superpowers/specs/2026-09-06-exercise-catalog-design.md.
 */
export interface DatasetExercise {
  id: string;
  name: string;
  body_part: string;
  target: string;
  secondary_muscles: string[];
  equipment: string | null;
  image: string | null;
  gif_url: string | null;
  instructions?: Record<string, string>;
  instruction_steps?: Record<string, string[]>;
  attribution?: string;
}

const ATRIBUCION_MEDIA_FALLBACK = '© Gym visual — https://gymvisual.com/';
export const LICENCIA_MEDIA = 'Gym Visual - uso comercial requiere licencia propia';

export function validarDatasetExercise(item: DatasetExercise, index: number): void {
  const identificador =
    item?.id && String(item.id).trim().length > 0 ? item.id : `<sin id, índice ${index}>`;

  if (!item?.id || String(item.id).trim().length === 0) {
    throw new Error(
      `seed-exercises: item en índice ${index} no tiene 'id' (o está vacío). No se puede importar sin id.`,
    );
  }
  if (!item?.name || String(item.name).trim().length === 0) {
    throw new Error(
      `seed-exercises: item con id="${identificador}" no tiene 'name' (o está vacío). Campo requerido en el schema.`,
    );
  }
  if (!item?.body_part || String(item.body_part).trim().length === 0) {
    throw new Error(
      `seed-exercises: item con id="${identificador}" no tiene 'body_part' (o está vacío). Campo requerido en el schema.`,
    );
  }
}

export interface ExerciseFields {
  nombre: string;
  parteCuerpo: string;
  grupoMuscular: string;
  gruposMuscularesSecundarios: string[];
  equipamiento: string | null;
  imageUrl: string | null;
  gifUrl: string | null;
  instrucciones: string | null;
  pasos: string[];
  licenciaMedia: string;
  atribucionMedia: string;
}

/**
 * Mapea un item del dataset a los campos de `Exercise` — pura, sin I/O.
 * `resolverUrlMedia` resuelve la ruta relativa del dataset (ej.
 * "images/0001-x.jpg") a la URL pública final (Supabase Storage en
 * producción); se inyecta para poder testear el mapeo sin red.
 */
export function mapExerciseFields(
  item: DatasetExercise,
  resolverUrlMedia: (rutaRelativa: string | null) => string | null,
): ExerciseFields {
  return {
    nombre: item.name,
    parteCuerpo: item.body_part,
    grupoMuscular: item.target,
    gruposMuscularesSecundarios: item.secondary_muscles ?? [],
    equipamiento: item.equipment ?? null,
    imageUrl: resolverUrlMedia(item.image ?? null),
    gifUrl: resolverUrlMedia(item.gif_url ?? null),
    instrucciones: item.instructions?.es ?? null,
    pasos: item.instruction_steps?.es ?? [],
    licenciaMedia: LICENCIA_MEDIA,
    atribucionMedia: item.attribution ?? ATRIBUCION_MEDIA_FALLBACK,
  };
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `cd apps/api && node_modules/.bin/jest dataset-mapper --no-coverage`
Expected: PASS, 9 tests.

- [ ] **Step 5: Constante de bucket compartida**

`apps/api/prisma/exercise-media-bucket.ts`:

```typescript
/** Nombre del bucket público de Supabase Storage con la media del catálogo.
 * Compartido entre `upload-exercise-media.ts` (Task 4, sube los archivos)
 * y `seed-exercises.ts` (este archivo, resuelve la URL pública final) —
 * una sola fuente de verdad para que no puedan divergir. */
export const EXERCISE_MEDIA_BUCKET = 'exercise-media';
```

- [ ] **Step 6: Reescribir `seed-exercises.ts`**

`apps/api/prisma/seed-exercises.ts` (reemplaza el archivo completo):

```typescript
import 'dotenv/config';
import { Prisma, PrismaClient, ExerciseSource } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXERCISE_MEDIA_BUCKET } from './exercise-media-bucket';
import {
  DatasetExercise,
  mapExerciseFields,
  validarDatasetExercise,
} from '../src/exercise-catalog/infrastructure/seed/dataset-mapper';

const prisma = new PrismaClient();
const TAMANO_LOTE = 100;

function cargarDataset(rutaJson: string): DatasetExercise[] {
  const contenido = readFileSync(rutaJson, 'utf-8');
  return JSON.parse(contenido) as DatasetExercise[];
}

function partirEnLotes<T>(items: T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) {
    lotes.push(items.slice(i, i + tamano));
  }
  return lotes;
}

function buildUpsert(
  item: DatasetExercise,
  index: number,
  resolverUrlMedia: (rutaRelativa: string | null) => string | null,
) {
  validarDatasetExercise(item, index);
  const campos = mapExerciseFields(item, resolverUrlMedia);

  return prisma.exercise.upsert({
    where: { externalId: item.id },
    create: {
      externalId: item.id,
      gymId: null,
      fuente: ExerciseSource.CATALOG,
      ...campos,
    },
    update: campos,
  });
}

async function main(): Promise<void> {
  const rutaDataset = process.env.EXERCISES_DATASET_PATH
    ? join(process.env.EXERCISES_DATASET_PATH, 'data', 'exercises.json')
    : join(__dirname, 'seed-exercises.fixture.json');

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridos');
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const resolverUrlMedia = (rutaRelativa: string | null): string | null => {
    if (!rutaRelativa) return null;
    return supabase.storage.from(EXERCISE_MEDIA_BUCKET).getPublicUrl(rutaRelativa).data.publicUrl;
  };

  const ejercicios = cargarDataset(rutaDataset);
  console.log(`Importando ${ejercicios.length} ejercicios desde ${rutaDataset}...`);

  const lotes = partirEnLotes(ejercicios, TAMANO_LOTE);
  let procesados = 0;

  for (const lote of lotes) {
    const upserts = lote.map((item, indiceEnLote) =>
      buildUpsert(item, procesados + indiceEnLote, resolverUrlMedia),
    );
    await prisma.$transaction(upserts as Prisma.PrismaPromise<unknown>[]);
    procesados += lote.length;
  }

  console.log(`Listo: ${ejercicios.length} ejercicios importados/actualizados (fuente: CATALOG).`);
}

main()
  .catch((error) => {
    console.error('Error corriendo el seed de ejercicios:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 7: Reescribir el fixture con la forma real (2 items reales del dataset)**

`apps/api/prisma/seed-exercises.fixture.json` (reemplaza el archivo completo):

```json
[
  {
    "id": "0001",
    "name": "3/4 sit-up",
    "body_part": "waist",
    "target": "abs",
    "secondary_muscles": ["hip flexors", "lower back"],
    "equipment": "body weight",
    "image": "images/0001-2gPfomN.jpg",
    "gif_url": "videos/0001-2gPfomN.gif",
    "instructions": {
      "es": "Túmbate sobre tu espalda con las rodillas flexionadas y los pies apoyados en el suelo. Coloca las manos detrás de la cabeza con los codos apuntando hacia afuera. Activando el abdomen, levanta lentamente la parte superior del cuerpo del suelo, curvándote hacia adelante hasta que tu torso forme un ángulo de 45 grados. Haz una pausa por un momento en la parte superior, luego baja lentamente la parte superior del cuerpo de vuelta a la posición inicial. Repite el número de repeticiones deseado."
    },
    "instruction_steps": {
      "es": [
        "Túmbate sobre tu espalda con las rodillas flexionadas y los pies apoyados en el suelo.",
        "Coloca las manos detrás de la cabeza con los codos apuntando hacia afuera.",
        "Activando el abdomen, levanta lentamente la parte superior del cuerpo del suelo, curvándote hacia adelante hasta que tu torso forme un ángulo de 45 grados.",
        "Haz una pausa por un momento en la parte superior, luego baja lentamente la parte superior del cuerpo de vuelta a la posición inicial.",
        "Repite el número de repeticiones deseado."
      ]
    },
    "attribution": "© Gym visual — https://gymvisual.com/"
  },
  {
    "id": "0002",
    "name": "45° side bend",
    "body_part": "waist",
    "target": "abs",
    "secondary_muscles": ["obliques"],
    "equipment": "body weight",
    "image": "images/0002-Hy9D21L.jpg",
    "gif_url": "videos/0002-Hy9D21L.gif",
    "instructions": {
      "es": "Ponte de pie con los pies separados a la altura de los hombros y los brazos extendidos hacia abajo a los lados. Manteniendo la espalda recta y el core activado, flexiona lentamente el torso hacia un lado, bajando la mano hacia la rodilla. Haz una pausa por un momento en la parte inferior, luego regresa lentamente a la posición inicial. Repite del otro lado. Continúa alternando lados durante el número de repeticiones deseado."
    },
    "instruction_steps": {
      "es": [
        "Ponte de pie con los pies separados a la altura de los hombros y los brazos extendidos hacia abajo a los lados.",
        "Manteniendo la espalda recta y el core activado, flexiona lentamente el torso hacia un lado, bajando la mano hacia la rodilla.",
        "Haz una pausa por un momento en la parte inferior, luego regresa lentamente a la posición inicial.",
        "Repite del otro lado.",
        "Continúa alternando lados durante el número de repeticiones deseado."
      ]
    },
    "attribution": "© Gym visual — https://gymvisual.com/"
  }
]
```

- [ ] **Step 8: Documentar `EXERCISES_DATASET_PATH` en `.env.example`**

Agregar al final de `apps/api/.env.example`:

```
# Opcional — checkout local de https://github.com/hasaneyldrm/exercises-dataset,
# usado por `pnpm seed:exercises` y `pnpm upload-exercise-media` para cargar
# el catálogo real (1.324 ejercicios). Sin esto, seed:exercises usa el
# fixture de 2 items (apps/api/prisma/seed-exercises.fixture.json).
EXERCISES_DATASET_PATH="/ruta/a/tu/checkout/exercises-dataset"
```

- [ ] **Step 9: Agregar el script de `upload-exercise-media` a `package.json`** (el archivo lo crea Task 4, acá solo se reserva el nombre del script)

En `apps/api/package.json`, dentro de `"scripts"`, agregar después de `"seed:exercises"`:

```json
"upload-exercise-media": "tsx prisma/upload-exercise-media.ts",
```

- [ ] **Step 10: Correr el seed contra el fixture (sanity check, no contra el dataset real todavía)**

Run: `cd apps/api && node_modules/.bin/tsx prisma/seed-exercises.ts`
Expected: `Importando 2 ejercicios desde .../seed-exercises.fixture.json...` seguido de `Listo: 2 ejercicios importados/actualizados (fuente: CATALOG).` — esto SÍ pega contra la Supabase real configurada en `.env` (mismo criterio que el resto del proyecto: los scripts de seed corren contra la DB real, no hay DB de test separada), así que va a dejar 2 filas reales de prueba en la tabla. Task 4 las va a reemplazar por las 1.324 reales.

- [ ] **Step 11: Correr la suite completa**

Run: `cd apps/api && node_modules/.bin/jest`
Expected: todos los tests anteriores en verde + los 9 nuevos de `dataset-mapper.spec.ts`.

- [ ] **Step 12: Typecheck**

Run: `cd apps/api && node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/exercise-catalog/infrastructure/seed/ apps/api/prisma/exercise-media-bucket.ts apps/api/prisma/seed-exercises.ts apps/api/prisma/seed-exercises.fixture.json apps/api/.env.example apps/api/package.json
git commit -m "feat(exercise-catalog): reescribir seed-exercises.ts contra la forma real del dataset

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Media a Supabase Storage + carga real del catálogo

**Files:**

- Create: `apps/api/prisma/upload-exercise-media.ts`

**Interfaces:**

- Consume: `EXERCISE_MEDIA_BUCKET` (Task 3, `prisma/exercise-media-bucket.ts`).
- Produce: 1.324 filas reales en `Exercise` (Postgres) + ~2.648 archivos en el bucket `exercise-media` de Supabase Storage — todas las tasks de backend siguientes (5, 6) y de frontend (9, 10) asumen que esto ya corrió.

Este task es mayormente operacional (clonar el dataset, correr dos scripts contra infraestructura real) — no hay TDD posible sobre I/O de red/filesystem masivo; se verifica con evidencia real (conteos, muestras de URLs), mismo criterio ya usado en este proyecto para scripts de seed/migración contra Supabase real.

- [ ] **Step 1: Clonar el dataset localmente** (fuera del repo, no se comitea)

Run: `git clone --depth 1 https://github.com/hasaneyldrm/exercises-dataset /tmp/exercises-dataset-checkout`
Expected: clon exitoso, `/tmp/exercises-dataset-checkout/data/exercises.json` existe.

Run: `ls /tmp/exercises-dataset-checkout/data/exercises.json /tmp/exercises-dataset-checkout/images | head -3 && ls /tmp/exercises-dataset-checkout/videos | head -3`
Expected: el JSON existe, y las carpetas `images/`/`videos/` tienen archivos.

- [ ] **Step 2: Escribir el script de subida**

`apps/api/prisma/upload-exercise-media.ts`:

```typescript
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXERCISE_MEDIA_BUCKET } from './exercise-media-bucket';

interface DatasetExerciseMedia {
  image: string | null;
  gif_url: string | null;
}

function contentTypeFor(rutaRelativa: string): string {
  return rutaRelativa.endsWith('.gif') ? 'image/gif' : 'image/jpeg';
}

/**
 * Sube a Supabase Storage solo los archivos de media EFECTIVAMENTE
 * referenciados por data/exercises.json (no todo lo que haya en el
 * checkout) — evita subir basura si el repo tiene archivos huérfanos.
 * Idempotente: si un archivo ya existe en el bucket, lo cuenta como
 * "salteado" en vez de fallar o volver a subirlo. Secuencial a propósito
 * (no paralelo) — es un script de una sola corrida, no un hot path;
 * confiabilidad ante flakiness de red importa más que velocidad acá.
 */
async function main(): Promise<void> {
  const datasetPath = process.env.EXERCISES_DATASET_PATH;
  if (!datasetPath) {
    throw new Error(
      'EXERCISES_DATASET_PATH no está configurado — apuntá a un checkout local de https://github.com/hasaneyldrm/exercises-dataset',
    );
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridos');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { error: errorBucket } = await supabase.storage.createBucket(EXERCISE_MEDIA_BUCKET, {
    public: true,
  });
  if (errorBucket && !errorBucket.message.includes('already exists')) {
    throw new Error(`No se pudo crear el bucket: ${errorBucket.message}`);
  }

  const rutaJson = join(datasetPath, 'data', 'exercises.json');
  const ejercicios = JSON.parse(readFileSync(rutaJson, 'utf-8')) as DatasetExerciseMedia[];

  const rutasUnicas = new Set<string>();
  for (const item of ejercicios) {
    if (item.image) rutasUnicas.add(item.image);
    if (item.gif_url) rutasUnicas.add(item.gif_url);
  }

  console.log(
    `Subiendo ${rutasUnicas.size} archivos de media al bucket '${EXERCISE_MEDIA_BUCKET}'...`,
  );

  let subidos = 0;
  let saltados = 0;
  let fallidos = 0;

  for (const rutaRelativa of rutasUnicas) {
    const rutaLocal = join(datasetPath, rutaRelativa);
    let buffer: Buffer;
    try {
      buffer = readFileSync(rutaLocal);
    } catch {
      console.error(`No se encontró el archivo local: ${rutaLocal}`);
      fallidos += 1;
      continue;
    }

    const { error } = await supabase.storage
      .from(EXERCISE_MEDIA_BUCKET)
      .upload(rutaRelativa, buffer, { contentType: contentTypeFor(rutaRelativa), upsert: false });

    if (error) {
      if (error.message.includes('already exists')) {
        saltados += 1;
      } else {
        console.error(`Falló la subida de ${rutaRelativa}: ${error.message}`);
        fallidos += 1;
      }
      continue;
    }

    subidos += 1;
  }

  console.log(`Listo: ${subidos} subidos, ${saltados} ya existían, ${fallidos} fallidos.`);
  if (fallidos > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Error corriendo la subida de media:', error);
  process.exitCode = 1;
});
```

- [ ] **Step 3: Correr la subida real**

Run: `cd apps/api && EXERCISES_DATASET_PATH=/tmp/exercises-dataset-checkout node_modules/.bin/tsx prisma/upload-exercise-media.ts`
Expected: `Subiendo 2648 archivos de media al bucket 'exercise-media'...` (1.324 imágenes + 1.324 GIFs, salvo que el dataset tenga menos únicos por algún item sin media) seguido de `Listo: 2648 subidos, 0 ya existían, 0 fallidos.` en la primera corrida. Si `fallidos > 0`, PARAR y revisar los errores impresos antes de seguir.

- [ ] **Step 4: Confirmar idempotencia — correr de nuevo**

Run: `cd apps/api && EXERCISES_DATASET_PATH=/tmp/exercises-dataset-checkout node_modules/.bin/tsx prisma/upload-exercise-media.ts`
Expected: `Listo: 0 subidos, 2648 ya existían, 0 fallidos.`

- [ ] **Step 5: Correr el seed real (reemplaza las 2 filas de fixture por las 1.324 reales)**

Run: `cd apps/api && EXERCISES_DATASET_PATH=/tmp/exercises-dataset-checkout node_modules/.bin/tsx prisma/seed-exercises.ts`
Expected: `Importando 1324 ejercicios desde /tmp/exercises-dataset-checkout/data/exercises.json...` seguido de `Listo: 1324 ejercicios importados/actualizados (fuente: CATALOG).`

Nota: las 2 filas de fixture (`externalId: "0001"`/`"0002"` del Step 10 de Task 3) tienen el MISMO `externalId` que los primeros 2 items reales del dataset — el `upsert` las actualiza in-place con los datos reales (con URLs de Storage en vez del fixture), no quedan duplicadas.

- [ ] **Step 6: Verificar el resultado contra la DB real**

Run: `cd apps/api && node_modules/.bin/tsx -e "
import('./src/shared-kernel/prisma.service').then(async ({PrismaService}) => {
  const p = new PrismaService();
  const total = await p.exercise.count();
  const conMedia = await p.exercise.count({ where: { AND: [{ imageUrl: { not: null } }, { gifUrl: { not: null } }] } });
  const muestra = await p.exercise.findFirst({ where: { externalId: '0001' } });
  console.log(JSON.stringify({ total, conMedia, muestra }, null, 2));
  await p.\$disconnect();
});
"`
Expected: `total: 1324`, `conMedia: 1324` (el dataset real no tiene huecos de media, confirmado al analizar el JSON antes de este plan), y `muestra.imageUrl`/`muestra.gifUrl` con el formato `https://<proyecto>.supabase.co/storage/v1/object/public/exercise-media/images/0001-....jpg` (URL pública real, no una ruta relativa).

- [ ] **Step 7: Verificar que una URL de imagen carga de verdad**

Run: `curl -s -o /dev/null -w "HTTP_STATUS:%{http_code}\n" "<la URL de imageUrl que imprimió el Step 6>"`
Expected: `HTTP_STATUS:200`

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma/upload-exercise-media.ts
git commit -m "feat(exercise-catalog): script de subida de media + carga real del catálogo (1.324 ejercicios)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Application layer — puerto, errores, casos de uso

**Files:**

- Create: `apps/api/src/exercise-catalog/application/ports/exercise-repository.port.ts`
- Create: `apps/api/src/exercise-catalog/application/errors/exercise-not-found.error.ts`
- Create: `apps/api/src/exercise-catalog/application/list-exercises.use-case.ts`
- Create: `apps/api/src/exercise-catalog/application/list-exercises.use-case.spec.ts`
- Create: `apps/api/src/exercise-catalog/application/get-exercise.use-case.ts`
- Create: `apps/api/src/exercise-catalog/application/get-exercise.use-case.spec.ts`

**Interfaces:**

- Consume: `DomainError` (Task 2, `shared-kernel/domain-error.ts`).
- Produce: `EXERCISE_REPOSITORY` (Symbol), `ExerciseRepositoryPort`, `ExerciseSummary`, `ExerciseDetail`, `ListExercisesFilter`, `ListExercisesResult` — Task 6 los implementa/consume. `ListExercisesUseCase.execute(input): Promise<{items, page, limit, total, totalPages}>` y `GetExerciseUseCase.execute(id): Promise<ExerciseDetail>` — Task 6 los inyecta en el controller.

- [ ] **Step 1: Puerto del repositorio**

`apps/api/src/exercise-catalog/application/ports/exercise-repository.port.ts`:

```typescript
export const EXERCISE_REPOSITORY = Symbol('EXERCISE_REPOSITORY');

export interface ExerciseSummary {
  id: string;
  nombre: string;
  imageUrl: string | null;
  gifUrl: string | null;
  parteCuerpo: string;
  grupoMuscular: string;
  equipamiento: string | null;
}

export interface ExerciseDetail extends ExerciseSummary {
  gruposMuscularesSecundarios: string[];
  instrucciones: string | null;
  pasos: string[];
  atribucionMedia: string | null;
}

export interface ListExercisesFilter {
  search?: string;
  parteCuerpo?: string;
  equipamiento?: string;
  page: number;
  limit: number;
}

export interface ListExercisesResult {
  items: ExerciseSummary[];
  total: number;
}

/**
 * Catálogo global de solo lectura en el MVP (sin scoping por gymId — ver
 * Global Constraints del plan). `findMany` filtra/pagina; `findById`
 * devuelve el detalle completo o null si no existe.
 */
export interface ExerciseRepositoryPort {
  findMany(filter: ListExercisesFilter): Promise<ListExercisesResult>;
  findById(id: string): Promise<ExerciseDetail | null>;
}
```

- [ ] **Step 2: Error de dominio**

`apps/api/src/exercise-catalog/application/errors/exercise-not-found.error.ts`:

```typescript
import { DomainError } from '../../../shared-kernel/domain-error';

export class ExerciseNotFoundError extends DomainError {
  readonly httpStatus = 404;

  constructor(id: string) {
    super(`No existe un ejercicio con id '${id}'.`);
    this.name = 'ExerciseNotFoundError';
  }
}
```

- [ ] **Step 3: Escribir el test de `ListExercisesUseCase` (falla, no existe el archivo)**

`apps/api/src/exercise-catalog/application/list-exercises.use-case.spec.ts`:

```typescript
import { ListExercisesUseCase } from './list-exercises.use-case';
import { ExerciseRepositoryPort, ExerciseSummary } from './ports/exercise-repository.port';

describe('ListExercisesUseCase', () => {
  let repo: jest.Mocked<ExerciseRepositoryPort>;
  let useCase: ListExercisesUseCase;

  const ejercicio: ExerciseSummary = {
    id: 'ex-1',
    nombre: '3/4 Sit-Up',
    imageUrl: 'https://example.com/img.jpg',
    gifUrl: null,
    parteCuerpo: 'waist',
    grupoMuscular: 'abs',
    equipamiento: 'body weight',
  };

  beforeEach(() => {
    repo = { findMany: jest.fn(), findById: jest.fn() };
    useCase = new ListExercisesUseCase(repo);
  });

  it('devuelve items + metadata de paginación calculada', async () => {
    repo.findMany.mockResolvedValue({ items: [ejercicio], total: 50 });

    const resultado = await useCase.execute({ page: 2, limit: 24 });

    expect(repo.findMany).toHaveBeenCalledWith({ page: 2, limit: 24 });
    expect(resultado).toEqual({
      items: [ejercicio],
      page: 2,
      limit: 24,
      total: 50,
      totalPages: 3,
    });
  });

  it('pasa los filtros de búsqueda/parteCuerpo/equipamiento tal cual al repositorio', async () => {
    repo.findMany.mockResolvedValue({ items: [], total: 0 });

    await useCase.execute({
      search: 'sit',
      parteCuerpo: 'waist',
      equipamiento: 'body weight',
      page: 1,
      limit: 24,
    });

    expect(repo.findMany).toHaveBeenCalledWith({
      search: 'sit',
      parteCuerpo: 'waist',
      equipamiento: 'body weight',
      page: 1,
      limit: 24,
    });
  });

  it('totalPages es 1 (no 0) cuando total es 0', async () => {
    repo.findMany.mockResolvedValue({ items: [], total: 0 });

    const resultado = await useCase.execute({ page: 1, limit: 24 });

    expect(resultado.totalPages).toBe(1);
  });
});
```

- [ ] **Step 4: Correr y confirmar que falla**

Run: `cd apps/api && node_modules/.bin/jest list-exercises.use-case --no-coverage`
Expected: FAIL — `Cannot find module './list-exercises.use-case'`

- [ ] **Step 5: Implementar `ListExercisesUseCase`**

`apps/api/src/exercise-catalog/application/list-exercises.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepositoryPort,
  ExerciseSummary,
} from './ports/exercise-repository.port';

export interface ListExercisesInput {
  search?: string;
  parteCuerpo?: string;
  equipamiento?: string;
  page: number;
  limit: number;
}

export interface ListExercisesOutput {
  items: ExerciseSummary[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class ListExercisesUseCase {
  constructor(
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
  ) {}

  async execute(input: ListExercisesInput): Promise<ListExercisesOutput> {
    const { items, total } = await this.exerciseRepository.findMany({
      search: input.search,
      parteCuerpo: input.parteCuerpo,
      equipamiento: input.equipamiento,
      page: input.page,
      limit: input.limit,
    });

    return {
      items,
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.limit)),
    };
  }
}
```

- [ ] **Step 6: Correr y confirmar que pasa**

Run: `cd apps/api && node_modules/.bin/jest list-exercises.use-case --no-coverage`
Expected: PASS, 3 tests.

- [ ] **Step 7: Escribir el test de `GetExerciseUseCase` (falla, no existe el archivo)**

`apps/api/src/exercise-catalog/application/get-exercise.use-case.spec.ts`:

```typescript
import { GetExerciseUseCase } from './get-exercise.use-case';
import { ExerciseRepositoryPort, ExerciseDetail } from './ports/exercise-repository.port';
import { ExerciseNotFoundError } from './errors/exercise-not-found.error';

describe('GetExerciseUseCase', () => {
  let repo: jest.Mocked<ExerciseRepositoryPort>;
  let useCase: GetExerciseUseCase;

  const detalle: ExerciseDetail = {
    id: 'ex-1',
    nombre: '3/4 Sit-Up',
    imageUrl: null,
    gifUrl: null,
    parteCuerpo: 'waist',
    grupoMuscular: 'abs',
    equipamiento: 'body weight',
    gruposMuscularesSecundarios: ['hip flexors'],
    instrucciones: 'Texto',
    pasos: ['Paso 1', 'Paso 2'],
    atribucionMedia: '© Gym visual — https://gymvisual.com/',
  };

  beforeEach(() => {
    repo = { findMany: jest.fn(), findById: jest.fn() };
    useCase = new GetExerciseUseCase(repo);
  });

  it('devuelve el detalle si existe', async () => {
    repo.findById.mockResolvedValue(detalle);

    const resultado = await useCase.execute('ex-1');

    expect(repo.findById).toHaveBeenCalledWith('ex-1');
    expect(resultado).toEqual(detalle);
  });

  it('lanza ExerciseNotFoundError si no existe', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(useCase.execute('no-existe')).rejects.toThrow(ExerciseNotFoundError);
  });
});
```

- [ ] **Step 8: Correr y confirmar que falla**

Run: `cd apps/api && node_modules/.bin/jest get-exercise.use-case --no-coverage`
Expected: FAIL — `Cannot find module './get-exercise.use-case'`

- [ ] **Step 9: Implementar `GetExerciseUseCase`**

`apps/api/src/exercise-catalog/application/get-exercise.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import {
  EXERCISE_REPOSITORY,
  ExerciseDetail,
  ExerciseRepositoryPort,
} from './ports/exercise-repository.port';
import { ExerciseNotFoundError } from './errors/exercise-not-found.error';

@Injectable()
export class GetExerciseUseCase {
  constructor(
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
  ) {}

  async execute(id: string): Promise<ExerciseDetail> {
    const exercise = await this.exerciseRepository.findById(id);
    if (!exercise) {
      throw new ExerciseNotFoundError(id);
    }
    return exercise;
  }
}
```

- [ ] **Step 10: Correr y confirmar que pasa**

Run: `cd apps/api && node_modules/.bin/jest get-exercise.use-case --no-coverage`
Expected: PASS, 2 tests.

- [ ] **Step 11: Suite completa + typecheck**

Run: `cd apps/api && node_modules/.bin/jest && node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: todos los tests en verde, sin errores de tipos.

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/exercise-catalog/application/
git commit -m "feat(exercise-catalog): application layer — puerto + ListExercisesUseCase + GetExerciseUseCase

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Infraestructura HTTP — repositorio, DTO, controller, módulo

**Files:**

- Create: `apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise.repository.ts`
- Create: `apps/api/src/exercise-catalog/infrastructure/http/dto/list-exercises.dto.ts`
- Create: `apps/api/src/exercise-catalog/infrastructure/http/exercises.controller.ts`
- Create: `apps/api/src/exercise-catalog/infrastructure/http/exercises.e2e.spec.ts`
- Modify: `apps/api/src/exercise-catalog/exercise-catalog.module.ts`

**Interfaces:**

- Consume: `ExerciseRepositoryPort`/`EXERCISE_REPOSITORY`/`ExerciseSummary`/`ExerciseDetail` (Task 5), `ListExercisesUseCase`/`GetExerciseUseCase` (Task 5), `DomainExceptionFilter` (Task 2), `JwtAuthGuard`/`RolesGuard`/`GymScopeGuard`/`buildTestJwtKeys`/`signTestToken` (ya existentes en `identity`).
- Produce: `GET /exercises` y `GET /exercises/:id` funcionando end-to-end contra el módulo compuesto — sin providers nuevos que otras tasks necesiten.

**Nota sobre roles:** ningún handler lleva `@Roles(...)`. Verificado en `RolesGuard`: sin metadata de roles en la ruta, el guard devuelve `true` sin restricción (mismo patrón que `GET /users/me`). `JwtAuthGuard`/`RolesGuard`/`GymScopeGuard` están registrados como `APP_GUARD` (global) dentro de `IdentityModule` — por el mecanismo de tokens globales de Nest (`APP_GUARD`/`APP_FILTER`), protegen TODA la app automáticamente, incluido este controller, sin que `ExerciseCatalogModule` tenga que registrar nada.

- [ ] **Step 1: DTO de query**

`apps/api/src/exercise-catalog/infrastructure/http/dto/list-exercises.dto.ts`:

```typescript
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListExercisesDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  parteCuerpo?: string;

  @IsOptional()
  @IsString()
  equipamiento?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  limit: number = 24;
}
```

- [ ] **Step 2: Repositorio Prisma**

`apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise.repository.ts`:

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

const SELECT_SUMMARY = {
  id: true,
  nombre: true,
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

@Injectable()
export class PrismaExerciseRepository implements ExerciseRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(filter: ListExercisesFilter): Promise<ListExercisesResult> {
    const where: Prisma.ExerciseWhereInput = {
      ...(filter.search ? { nombre: { contains: filter.search, mode: 'insensitive' } } : {}),
      ...(filter.parteCuerpo ? { parteCuerpo: filter.parteCuerpo } : {}),
      ...(filter.equipamiento ? { equipamiento: filter.equipamiento } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.exercise.findMany({
        where,
        orderBy: { nombre: 'asc' },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        select: SELECT_SUMMARY,
      }),
      this.prisma.exercise.count({ where }),
    ]);

    return { items: items as ExerciseSummary[], total };
  }

  async findById(id: string): Promise<ExerciseDetail | null> {
    const exercise = await this.prisma.exercise.findUnique({
      where: { id },
      select: SELECT_DETAIL,
    });
    return exercise as ExerciseDetail | null;
  }
}
```

- [ ] **Step 3: Controller**

`apps/api/src/exercise-catalog/infrastructure/http/exercises.controller.ts`:

```typescript
import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ListExercisesUseCase,
  ListExercisesOutput,
} from '../../application/list-exercises.use-case';
import { GetExerciseUseCase } from '../../application/get-exercise.use-case';
import { ExerciseDetail } from '../../application/ports/exercise-repository.port';
import { ListExercisesDto } from './dto/list-exercises.dto';

@Controller('exercises')
export class ExercisesController {
  constructor(
    private readonly listExercisesUseCase: ListExercisesUseCase,
    private readonly getExerciseUseCase: GetExerciseUseCase,
  ) {}

  @Get()
  async list(@Query() dto: ListExercisesDto): Promise<ListExercisesOutput> {
    return this.listExercisesUseCase.execute(dto);
  }

  @Get(':id')
  async detail(@Param('id') id: string): Promise<ExerciseDetail> {
    return this.getExerciseUseCase.execute(id);
  }
}
```

- [ ] **Step 4: Módulo**

`apps/api/src/exercise-catalog/exercise-catalog.module.ts` (reemplaza el archivo completo):

```typescript
import { Module } from '@nestjs/common';
import { EXERCISE_REPOSITORY } from './application/ports/exercise-repository.port';
import { ListExercisesUseCase } from './application/list-exercises.use-case';
import { GetExerciseUseCase } from './application/get-exercise.use-case';
import { PrismaExerciseRepository } from './infrastructure/persistence/prisma-exercise.repository';
import { ExercisesController } from './infrastructure/http/exercises.controller';

@Module({
  imports: [],
  controllers: [ExercisesController],
  providers: [
    { provide: EXERCISE_REPOSITORY, useClass: PrismaExerciseRepository },
    ListExercisesUseCase,
    GetExerciseUseCase,
  ],
})
export class ExerciseCatalogModule {}
```

- [ ] **Step 5: Escribir el e2e (falla — el controller/módulo recién se cablearon, confirmar primero que compila y corre con fakes antes de dar por bueno el resultado)**

`apps/api/src/exercise-catalog/infrastructure/http/exercises.e2e.spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { ExercisesController } from './exercises.controller';
import { ListExercisesUseCase } from '../../application/list-exercises.use-case';
import { GetExerciseUseCase } from '../../application/get-exercise.use-case';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepositoryPort,
} from '../../application/ports/exercise-repository.port';
import { JwtAuthGuard } from '../../../identity/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../../identity/infrastructure/guards/roles.guard';
import { GymScopeGuard } from '../../../identity/infrastructure/guards/gym-scope.guard';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
  UserRecord,
} from '../../../identity/application/ports/user-repository.port';
import { Role } from '../../../identity/domain/role';
import { DomainExceptionFilter } from '../../../shared-kernel/domain-exception.filter';
import {
  buildTestJwtKeys,
  signTestToken,
  TestJwtKeys,
} from '../../../identity/infrastructure/guards/testing/jwt-test-support';

const TEST_SUPABASE_URL = 'https://e2e-test.supabase.co';

// Ver la misma nota en jwt-auth.guard.spec.ts — mockeado para resolver
// contra un JWKS local de prueba, sin red.
jest.mock('jose', () => {
  const actual = jest.requireActual('jose');
  return { ...actual, createRemoteJWKSet: jest.fn() };
});

const { createRemoteJWKSet: mockCreateRemoteJWKSet } = jest.requireMock('jose') as {
  createRemoteJWKSet: jest.Mock;
};

describe('/exercises (e2e)', () => {
  let app: INestApplication;
  let claves: TestJwtKeys;

  const ejercicioResumen = {
    id: 'ex-1',
    nombre: '3/4 Sit-Up',
    imageUrl: null,
    gifUrl: null,
    parteCuerpo: 'waist',
    grupoMuscular: 'abs',
    equipamiento: 'body weight',
  };

  const fakeExerciseRepository: ExerciseRepositoryPort = {
    findMany: jest.fn(async () => ({ items: [ejercicioResumen], total: 1 })),
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
  };

  const usuarioAlumno: UserRecord = {
    id: 'user-1',
    authUserId: 'auth-1',
    gymId: 'gym-A',
    username: 'juan.perez',
    nombre: 'Juan',
    role: Role.ALUMNO,
    activo: true,
  };

  const fakeUserRepository: Pick<UserRepositoryPort, 'findByAuthUserId'> = {
    findByAuthUserId: async (authUserId: string) =>
      authUserId === 'auth-1' ? usuarioAlumno : null,
  };

  function firmarToken(): Promise<string> {
    return signTestToken(claves.privateKey, {
      issuer: `${TEST_SUPABASE_URL}/auth/v1`,
      sub: 'auth-1',
    });
  }

  beforeAll(async () => {
    process.env.SUPABASE_URL = TEST_SUPABASE_URL;
    claves = await buildTestJwtKeys();
    mockCreateRemoteJWKSet.mockReturnValue(claves.jwks);

    const moduleRef = await Test.createTestingModule({
      controllers: [ExercisesController],
      providers: [
        ListExercisesUseCase,
        GetExerciseUseCase,
        { provide: EXERCISE_REPOSITORY, useValue: fakeExerciseRepository },
        { provide: USER_REPOSITORY, useValue: fakeUserRepository },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: GymScopeGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rechaza sin token (401)', async () => {
    await request(app.getHttpServer()).get('/exercises').expect(401);
  });

  it('un ALUMNO autenticado puede listar — sin @Roles(), cualquier rol pasa', async () => {
    const token = await firmarToken();
    const res = await request(app.getHttpServer())
      .get('/exercises')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual({
      items: [ejercicioResumen],
      page: 1,
      limit: 24,
      total: 1,
      totalPages: 1,
    });
  });

  it('acepta query params de filtro/paginación y los pasa tal cual al repositorio', async () => {
    const token = await firmarToken();
    await request(app.getHttpServer())
      .get('/exercises?search=sit&parteCuerpo=waist&page=2&limit=10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(fakeExerciseRepository.findMany).toHaveBeenCalledWith({
      search: 'sit',
      parteCuerpo: 'waist',
      page: 2,
      limit: 10,
    });
  });

  it('detalle existente devuelve 200 con el detalle completo', async () => {
    const token = await firmarToken();
    const res = await request(app.getHttpServer())
      .get('/exercises/ex-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.atribucionMedia).toBe('© Gym visual — https://gymvisual.com/');
  });

  it('detalle inexistente devuelve 404 vía el filtro de dominio', async () => {
    const token = await firmarToken();
    const res = await request(app.getHttpServer())
      .get('/exercises/no-existe')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    expect(res.body.error).toBe('ExerciseNotFoundError');
  });
});
```

- [ ] **Step 6: Correr el e2e**

Run: `cd apps/api && node_modules/.bin/jest exercises.e2e --no-coverage`
Expected: PASS, 5 tests.

- [ ] **Step 7: Suite completa + typecheck + build**

Run: `cd apps/api && node_modules/.bin/jest && node_modules/.bin/tsc --noEmit -p tsconfig.json && node_modules/.bin/nest build`
Expected: todos los tests en verde, sin errores de tipos, build limpio.

- [ ] **Step 8: Verificación manual contra el server real** (requiere que Task 4 ya haya corrido — datos reales en la DB)

Levantar el server: `cd apps/api && node_modules/.bin/nest start &` (esperar a que loguee `Nest application successfully started`), después:

Run: `curl -s "http://localhost:3001/exercises?limit=2" | python3 -m json.tool`
Expected: 401 (sin token) — confirma que el guard global también protege esta ruta en la app REAL compuesta (`AppModule`), no solo en el módulo de test aislado del Step 5.

Con un token real de un usuario ya existente (cualquiera, generado vía `/auth/login`):
Run: `curl -s "http://localhost:3001/exercises?limit=2" -H "Authorization: Bearer <token>" | python3 -m json.tool`
Expected: `200`, `items` con 2 ejercicios reales, `total: 1324`.

Run: `curl -s "http://localhost:3001/exercises/<id de uno de esos items>" -H "Authorization: Bearer <token>" | python3 -m json.tool`
Expected: `200`, con `pasos` (array no vacío), `instrucciones`, `atribucionMedia`.

Bajar el server: `kill %1` (o el PID correspondiente).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/exercise-catalog/
git commit -m "feat(exercise-catalog): GET /exercises + GET /exercises/:id

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Frontend — sistema de estilo (tokens, dark mode, íconos)

**Files:**

- Create: `apps/web/app/tokens.css`
- Create: `apps/web/components/theme-toggle.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/tailwind.config.ts`
- Modify: `apps/web/package.json`

**Interfaces:**

- Produce: clases Tailwind `bg-surface`, `bg-surface-alt`, `text-text`, `text-text-muted`, `border-border`, `bg-accent`, `text-accent-fg` — Tasks 8/9/10 las usan. `<ThemeToggle />` importable desde `../components/theme-toggle` (ajustar la profundidad relativa según desde dónde se importe).

- [ ] **Step 1: Instalar `lucide-react`**

Run: `corepack pnpm --filter web add lucide-react`
Expected: se agrega a `apps/web/package.json` bajo `dependencies`, lockfile actualizado.

- [ ] **Step 2: Tokens de color**

`apps/web/app/tokens.css`:

```css
:root {
  --color-surface: 255 255 255;
  --color-surface-alt: 245 245 244;
  --color-text: 23 23 23;
  --color-text-muted: 115 115 115;
  --color-border: 229 229 229;
  --color-accent: 23 23 23;
  --color-accent-fg: 255 255 255;

  --color-region-chest: 220 38 38;
  --color-region-back: 37 99 235;
  --color-region-shoulders: 217 119 6;
  --color-region-upper-arms: 124 58 237;
  --color-region-lower-arms: 168 85 247;
  --color-region-waist: 5 150 105;
  --color-region-upper-legs: 8 145 178;
  --color-region-lower-legs: 13 148 136;
  --color-region-cardio: 219 39 119;
  --color-region-neck: 120 113 108;
}

.dark {
  --color-surface: 23 23 23;
  --color-surface-alt: 38 38 38;
  --color-text: 245 245 244;
  --color-text-muted: 163 163 163;
  --color-border: 64 64 64;
  --color-accent: 245 245 244;
  --color-accent-fg: 23 23 23;
}
```

- [ ] **Step 3: Importar tokens en `globals.css`**

`apps/web/app/globals.css` (reemplaza el archivo completo):

```css
@import './tokens.css';

@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: `darkMode: 'class'` + colores en Tailwind**

`apps/web/tailwind.config.ts` (reemplaza el archivo completo):

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-alt': 'rgb(var(--color-surface-alt) / <alpha-value>)',
        text: 'rgb(var(--color-text) / <alpha-value>)',
        'text-muted': 'rgb(var(--color-text-muted) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        'accent-fg': 'rgb(var(--color-accent-fg) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: Toggle claro/oscuro**

`apps/web/components/theme-toggle.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const STORAGE_KEY = 'app-gimnasio-theme';

export function ThemeToggle() {
  const [oscuro, setOscuro] = useState(false);

  useEffect(() => {
    setOscuro(document.documentElement.classList.contains('dark'));
  }, []);

  function alternar() {
    const nuevoOscuro = !oscuro;
    setOscuro(nuevoOscuro);
    document.documentElement.classList.toggle('dark', nuevoOscuro);
    try {
      localStorage.setItem(STORAGE_KEY, nuevoOscuro ? 'dark' : 'light');
    } catch {
      // localStorage puede fallar (modo privado del navegador) — el
      // toggle sigue funcionando en memoria para esta sesión, solo no
      // persiste entre recargas.
    }
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={oscuro ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-text active:bg-surface-alt"
    >
      {oscuro ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
```

- [ ] **Step 6: Root layout — script anti-flash + toggle global**

`apps/web/app/layout.tsx` (reemplaza el archivo completo):

```tsx
import './globals.css';
import type { ReactNode } from 'react';
import { ThemeToggle } from '../components/theme-toggle';

export const metadata = {
  title: 'App Gimnasio',
  description: 'Gestión de rutinas de gimnasio',
};

// Corre antes de hidratar React — evita el flash de tema incorrecto
// (aplicar la clase 'dark' recién en un useEffect se vería después del
// primer paint). Patrón estándar de Next.js para esto.
const SCRIPT_TEMA = `
(function () {
  try {
    var guardado = localStorage.getItem('app-gimnasio-theme');
    var oscuro = guardado
      ? guardado === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', oscuro);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="bg-surface text-text">
        <div className="flex justify-end p-3">
          <ThemeToggle />
        </div>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Build**

Run: `cd apps/web && rm -rf .next && node_modules/.bin/next build`
Expected: build exitoso, sin errores de Tailwind/TypeScript.

- [ ] **Step 8: Verificación manual del toggle**

Run: `cd apps/web && node_modules/.bin/next dev &` (esperar `Ready in`), después:
Run: `curl -s http://localhost:3000/login | grep -o 'class="dark"\|SCRIPT_TEMA\|matchMedia' | head -5`
Expected: el script inline aparece en el HTML servido (contiene `matchMedia`).
Bajar el server: `kill %1`.

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/tokens.css apps/web/app/globals.css apps/web/app/layout.tsx apps/web/tailwind.config.ts apps/web/components/theme-toggle.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): sistema de estilo — tokens CSS + toggle claro/oscuro + lucide-react

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Frontend — colores de región, equipamiento, `ExerciseCard`

**Files:**

- Create: `apps/web/lib/region-colors.ts`
- Create: `apps/web/lib/equipment-options.ts`
- Create: `apps/web/components/exercise-card.tsx`

**Interfaces:**

- Consume: tokens/clases de Task 7.
- Produce: `PARTES_CUERPO: string[]` (10 valores), `regionColorVar(parteCuerpo): string`, `EQUIPAMIENTOS: string[]` (28 valores), `<ExerciseCard ejercicio={...} />` con prop type `ExerciseCardData` — Task 9 los consume.

- [ ] **Step 1: Colores de región**

`apps/web/lib/region-colors.ts`:

```typescript
/**
 * Las 10 regiones (`body_part` del dataset) son un universo cerrado y
 * conocido de antemano — se hardcodean acá en vez de pedirle al backend
 * los valores distintos (no hace falta un round-trip para una lista que
 * no cambia). Mapeadas a un slug sin espacios porque los nombres de CSS
 * custom properties no pueden tener espacios.
 */
const REGION_A_SLUG: Record<string, string> = {
  chest: 'chest',
  back: 'back',
  shoulders: 'shoulders',
  'upper arms': 'upper-arms',
  'lower arms': 'lower-arms',
  waist: 'waist',
  'upper legs': 'upper-legs',
  'lower legs': 'lower-legs',
  cardio: 'cardio',
  neck: 'neck',
};

export const PARTES_CUERPO = Object.keys(REGION_A_SLUG);

export function regionColorVar(parteCuerpo: string): string {
  const slug = REGION_A_SLUG[parteCuerpo] ?? 'waist';
  return `rgb(var(--color-region-${slug}) / 1)`;
}
```

- [ ] **Step 2: Opciones de equipamiento**

`apps/web/lib/equipment-options.ts`:

```typescript
/**
 * Los 28 valores reales de `equipment` en el dataset (verificados contra
 * data/exercises.json antes de este plan) — universo cerrado, se
 * hardcodea igual que PARTES_CUERPO.
 */
export const EQUIPAMIENTOS = [
  'assisted',
  'band',
  'barbell',
  'body weight',
  'bosu ball',
  'cable',
  'elliptical machine',
  'ez barbell',
  'hammer',
  'kettlebell',
  'leverage machine',
  'medicine ball',
  'olympic barbell',
  'resistance band',
  'roller',
  'rope',
  'skierg machine',
  'sled machine',
  'smith machine',
  'stability ball',
  'stationary bike',
  'stepmill machine',
  'tire',
  'trap bar',
  'upper body ergometer',
  'weighted',
  'wheel roller',
].sort();
```

- [ ] **Step 3: `ExerciseCard`**

`apps/web/components/exercise-card.tsx`:

```tsx
import Image from 'next/image';
import { Dumbbell } from 'lucide-react';
import { regionColorVar } from '../lib/region-colors';

export interface ExerciseCardData {
  id: string;
  nombre: string;
  imageUrl: string | null;
  parteCuerpo: string;
  equipamiento: string | null;
}

/**
 * La imagen es el elemento visual central de la card (HU-09 / pedido
 * explícito) — nunca un espacio roto: si imageUrl viene null, ícono
 * genérico de fallback. Sin GIF acá a propósito (ver Global Constraints
 * del plan) — el GIF es exclusivo del detalle.
 */
export function ExerciseCard({ ejercicio }: { ejercicio: ExerciseCardData }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <div className="relative aspect-square w-full bg-surface-alt">
        {ejercicio.imageUrl ? (
          <Image
            src={ejercicio.imageUrl}
            alt={ejercicio.nombre}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Dumbbell className="text-text-muted" size={40} aria-hidden />
          </div>
        )}
        <span
          className="absolute left-2 top-2 rounded-full px-2 py-1 text-xs font-medium capitalize text-white"
          style={{ backgroundColor: regionColorVar(ejercicio.parteCuerpo) }}
        >
          {ejercicio.parteCuerpo}
        </span>
      </div>
      <div className="flex flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-medium text-text">{ejercicio.nombre}</h3>
        {ejercicio.equipamiento && (
          <p className="text-xs capitalize text-text-muted">{ejercicio.equipamiento}</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build**

Run: `cd apps/web && node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: sin errores. Este componente todavía no lo consume ninguna página — el build de Next completo se valida recién en Task 9 cuando tenga un consumidor real.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/region-colors.ts apps/web/lib/equipment-options.ts apps/web/components/exercise-card.tsx
git commit -m "feat(web): ExerciseCard reusable + colores de región + opciones de equipamiento

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Frontend — fix del proxy, guard de `(profesor)`, pantalla de catálogo

**Files:**

- Modify: `apps/web/app/api/proxy/[...path]/route.ts`
- Modify: `apps/web/app/(profesor)/layout.tsx`
- Create: `apps/web/app/(profesor)/catalogo/page.tsx`

**Interfaces:**

- Consume: `browserApiFetch`/`BrowserApiError` (ya existentes), `ExerciseCard`/`ExerciseCardData` (Task 8), `PARTES_CUERPO` (Task 8), `EQUIPAMIENTOS` (Task 8).
- Produce: `/catalogo` navegable — Task 10 agrega el detalle que esta pantalla enlaza.

**Hallazgo a corregir en este task:** el proxy (`app/api/proxy/[...path]/route.ts`) arma la URL de destino con `path.join('/')` pero NUNCA reenvía el query string de la request original — hoy es invisible porque ningún consumidor lo usaba, pero rompería `/exercises?search=...` de plano.

- [ ] **Step 1: Arreglar el proxy para reenviar el query string**

En `apps/web/app/api/proxy/[...path]/route.ts`, cambiar la función `forward` de:

```typescript
async function forward(
  path: string[],
  method: string,
  accessToken: string | null,
  body: string | undefined,
): Promise<Response> {
  return fetch(`${API_BASE_URL}/${path.join('/')}`, {
```

a:

```typescript
async function forward(
  path: string[],
  method: string,
  accessToken: string | null,
  body: string | undefined,
  search: string,
): Promise<Response> {
  return fetch(`${API_BASE_URL}/${path.join('/')}${search}`, {
```

Y en la función `handler`, agregar la lectura del search y pasarlo en ambas llamadas a `forward`:

```typescript
async function handler(
  request: NextRequest,
  { params }: { params: { path: string[] } },
): Promise<NextResponse> {
  const session = await getStoredSession();
  if (!session) {
    return NextResponse.json({ message: 'No hay sesión activa' }, { status: 401 });
  }

  const search = request.nextUrl.search;
  const body = METODOS_CON_BODY.has(request.method) ? await request.text() : undefined;

  let upstream = await forward(params.path, request.method, session.accessToken, body, search);

  if (upstream.status === 401) {
    const refreshed = await refreshSession(session.refreshToken);
    if (refreshed) {
      upstream = await forward(params.path, request.method, refreshed.accessToken, body, search);
    }
  }

  const cuerpo = await upstream.text();
  return new NextResponse(cuerpo, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  });
}
```

- [ ] **Step 2: Guard de autenticación en `(profesor)/layout.tsx`**

`apps/web/app/(profesor)/layout.tsx` (reemplaza el archivo completo):

```tsx
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api-client';

/**
 * Valida server-side que hay una sesión autenticada — el catálogo es
 * legible por ADMIN/PROFESOR/ALUMNO por igual (a diferencia de
 * (admin)/layout.tsx, que usa GET /users porque esa sección SÍ es
 * ADMIN-only). Por eso acá se usa /users/me, que no exige ningún rol
 * específico — usar /users rompería el acceso de PROFESOR/ALUMNO a esta
 * sección con un 403.
 */
export default async function ProfesorLayout({ children }: { children: ReactNode }) {
  try {
    await apiFetch('/users/me');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  return <>{children}</>;
}
```

- [ ] **Step 3: Pantalla de catálogo**

`apps/web/app/(profesor)/catalogo/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { browserApiFetch, BrowserApiError } from '../../../lib/browser-api-client';
import { ExerciseCard, ExerciseCardData } from '../../../components/exercise-card';
import { PARTES_CUERPO } from '../../../lib/region-colors';
import { EQUIPAMIENTOS } from '../../../lib/equipment-options';

interface ListExercisesResponse {
  items: ExerciseCardData[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const LIMITE_POR_PAGINA = 24;

export default function CatalogoPage() {
  const [busqueda, setBusqueda] = useState('');
  const [parteCuerpo, setParteCuerpo] = useState<string | null>(null);
  const [equipamiento, setEquipamiento] = useState('');
  const [pagina, setPagina] = useState(1);
  const [items, setItems] = useState<ExerciseCardData[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(
    async (paginaActual: number, reemplazar: boolean) => {
      setCargando(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (busqueda) params.set('search', busqueda);
        if (parteCuerpo) params.set('parteCuerpo', parteCuerpo);
        if (equipamiento) params.set('equipamiento', equipamiento);
        params.set('page', String(paginaActual));
        params.set('limit', String(LIMITE_POR_PAGINA));

        const respuesta = await browserApiFetch<ListExercisesResponse>(
          `/exercises?${params.toString()}`,
        );
        setItems((anteriores) =>
          reemplazar ? respuesta.items : [...anteriores, ...respuesta.items],
        );
        setTotalPages(respuesta.totalPages);
        setPagina(paginaActual);
      } catch (err) {
        setError(err instanceof BrowserApiError ? err.message : 'No se pudo cargar el catálogo.');
      } finally {
        setCargando(false);
      }
    },
    [busqueda, parteCuerpo, equipamiento],
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      cargar(1, true);
    }, 300);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, parteCuerpo, equipamiento]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold text-text">Catálogo de ejercicios</h1>

      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3">
        <Search size={18} className="text-text-muted" aria-hidden />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar ejercicio..."
          className="min-h-11 w-full bg-transparent text-base text-text outline-none placeholder:text-text-muted"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setParteCuerpo(null)}
          className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium ${
            parteCuerpo === null
              ? 'border-accent bg-accent text-accent-fg'
              : 'border-border bg-surface text-text'
          }`}
        >
          Todos
        </button>
        {PARTES_CUERPO.map((parte) => (
          <button
            key={parte}
            type="button"
            onClick={() => setParteCuerpo(parte)}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium capitalize ${
              parteCuerpo === parte
                ? 'border-accent bg-accent text-accent-fg'
                : 'border-border bg-surface text-text'
            }`}
          >
            {parte}
          </button>
        ))}
      </div>

      <select
        value={equipamiento}
        onChange={(e) => setEquipamiento(e.target.value)}
        className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base capitalize text-text"
      >
        <option value="">Cualquier equipamiento</option>
        {EQUIPAMIENTOS.map((eq) => (
          <option key={eq} value={eq} className="capitalize">
            {eq}
          </option>
        ))}
      </select>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((ejercicio) => (
          <Link key={ejercicio.id} href={`/catalogo/${ejercicio.id}`}>
            <ExerciseCard ejercicio={ejercicio} />
          </Link>
        ))}
      </div>

      {items.length === 0 && !cargando && (
        <p className="py-8 text-center text-sm text-text-muted">
          No se encontraron ejercicios con esos filtros.
        </p>
      )}

      {pagina < totalPages && (
        <button
          type="button"
          onClick={() => cargar(pagina + 1, false)}
          disabled={cargando}
          className="min-h-11 self-center rounded-lg border border-border px-6 text-sm font-medium text-text disabled:opacity-50"
        >
          {cargando ? 'Cargando...' : 'Cargar más'}
        </button>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Build**

Run: `cd apps/web && rm -rf .next && node_modules/.bin/next build`
Expected: build exitoso, `/catalogo` listada entre las rutas generadas, sin errores de tipos.

- [ ] **Step 5: Verificación manual contra el server real** (requiere `apps/api` corriendo con datos reales de Task 4, y sesión válida — usar el flujo de login ya verificado en la fase anterior)

Levantar ambos servers (`apps/api` en :3001, `apps/web` en :3000), loguearse como el ADMIN de prueba (`fer`/`gym-fer`, o el que corresponda), y con la cookie de sesión:
Run: `curl -s -b <cookies> "http://localhost:3000/catalogo" -o /tmp/catalogo.html && grep -c 'exercise-card\|Catálogo de ejercicios' /tmp/catalogo.html`

Nota: como la pantalla es Client Component, el HTML server-rendered inicial no va a traer los ejercicios (se cargan client-side vía `useEffect` + `browserApiFetch`) — esta verificación confirma que la página carga y el shell (buscador, chips, título) está presente; la carga real de datos hay que verla en un navegador real o inspeccionando que `curl -b <cookies> "http://localhost:3000/api/proxy/exercises?limit=2"` devuelva 200 con ejercicios reales.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/api/proxy/[...path]/route.ts" "apps/web/app/(profesor)/layout.tsx" "apps/web/app/(profesor)/catalogo/page.tsx"
git commit -m "feat(web): pantalla de catálogo — grid + búsqueda + filtros + paginación

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Frontend — detalle del ejercicio + `next.config.mjs`

**Files:**

- Create: `apps/web/app/(profesor)/catalogo/[id]/page.tsx`
- Modify: `apps/web/next.config.mjs`

**Interfaces:**

- Consume: `browserApiFetch`/`BrowserApiError` (existentes).
- Produce: `/catalogo/[id]` navegable desde el link de `ExerciseCard` en `/catalogo` (Task 9).

- [ ] **Step 1: `remotePatterns` para las imágenes de Supabase Storage**

`apps/web/next.config.mjs` (reemplaza el archivo completo):

```javascript
/** @type {import('next').NextConfig} */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : undefined;

const nextConfig = {
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: 'https',
            hostname: supabaseHostname,
            pathname: '/storage/v1/object/public/exercise-media/**',
          },
        ]
      : [],
  },
};

export default nextConfig;
```

- [ ] **Step 2: Página de detalle**

`apps/web/app/(profesor)/catalogo/[id]/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Dumbbell } from 'lucide-react';
import { browserApiFetch, BrowserApiError } from '../../../../lib/browser-api-client';

interface ExerciseDetailResponse {
  id: string;
  nombre: string;
  imageUrl: string | null;
  gifUrl: string | null;
  parteCuerpo: string;
  grupoMuscular: string;
  gruposMuscularesSecundarios: string[];
  equipamiento: string | null;
  instrucciones: string | null;
  pasos: string[];
  atribucionMedia: string | null;
}

export default function DetalleEjercicioPage({ params }: { params: { id: string } }) {
  const [ejercicio, setEjercicio] = useState<ExerciseDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      try {
        const respuesta = await browserApiFetch<ExerciseDetailResponse>(`/exercises/${params.id}`);
        if (!cancelado) setEjercicio(respuesta);
      } catch (err) {
        if (cancelado) return;
        setError(err instanceof BrowserApiError ? err.message : 'No se pudo cargar el ejercicio.');
      } finally {
        if (!cancelado) setCargando(false);
      }
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [params.id]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <Link
        href="/catalogo"
        className="flex min-h-11 w-fit items-center gap-2 text-sm text-text-muted"
      >
        <ArrowLeft size={18} aria-hidden />
        Volver al catálogo
      </Link>

      {cargando && <p className="text-sm text-text-muted">Cargando...</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {ejercicio && (
        <>
          <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-surface-alt">
            {ejercicio.gifUrl || ejercicio.imageUrl ? (
              <Image
                src={ejercicio.gifUrl ?? ejercicio.imageUrl!}
                alt={ejercicio.nombre}
                fill
                unoptimized={Boolean(ejercicio.gifUrl)}
                sizes="(max-width: 640px) 100vw, 640px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Dumbbell className="text-text-muted" size={64} aria-hidden />
              </div>
            )}
          </div>

          <h1 className="text-xl font-semibold text-text">{ejercicio.nombre}</h1>

          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-text-muted">Región</dt>
              <dd className="capitalize text-text">{ejercicio.parteCuerpo}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Músculo</dt>
              <dd className="capitalize text-text">{ejercicio.grupoMuscular}</dd>
            </div>
            {ejercicio.equipamiento && (
              <div>
                <dt className="text-text-muted">Equipamiento</dt>
                <dd className="capitalize text-text">{ejercicio.equipamiento}</dd>
              </div>
            )}
            {ejercicio.gruposMuscularesSecundarios.length > 0 && (
              <div>
                <dt className="text-text-muted">Músculos secundarios</dt>
                <dd className="capitalize text-text">
                  {ejercicio.gruposMuscularesSecundarios.join(', ')}
                </dd>
              </div>
            )}
          </dl>

          {ejercicio.pasos.length > 0 ? (
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-text">
              {ejercicio.pasos.map((paso, indice) => (
                <li key={indice}>{paso}</li>
              ))}
            </ol>
          ) : (
            ejercicio.instrucciones && (
              <p className="text-sm text-text">{ejercicio.instrucciones}</p>
            )
          )}

          {ejercicio.atribucionMedia && (
            <p className="border-t border-border pt-3 text-xs text-text-muted">
              {ejercicio.atribucionMedia}
            </p>
          )}
        </>
      )}
    </main>
  );
}
```

Nota sobre `unoptimized={Boolean(ejercicio.gifUrl)}`: el optimizador de imágenes de `next/image` no anima GIFs (los reduce a su primer frame) — sin esta prop el GIF del detalle se vería como una foto estática, rompiendo el requisito explícito de que el GIF sea la demostración animada del movimiento.

- [ ] **Step 3: Build**

Run: `cd apps/web && rm -rf .next && node_modules/.bin/next build`
Expected: build exitoso, `/catalogo/[id]` listada, sin errores.

- [ ] **Step 4: Verificación manual del detalle**

Con ambos servers corriendo y sesión válida (mismo criterio que Task 9 Step 5):
Run: `curl -s -b <cookies> "http://localhost:3000/api/proxy/exercises/<id real>" | python3 -m json.tool`
Expected: `200`, con `pasos` no vacío y `atribucionMedia` presente.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(profesor)/catalogo/[id]" apps/web/next.config.mjs
git commit -m "feat(web): detalle de ejercicio — GIF, pasos numerados, atribución de licencia

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Verificación final de todo el bloque

**Files:** ninguno nuevo — task de verificación pura.

- [ ] **Step 1: Suite completa de `apps/api`**

Run: `cd apps/api && node_modules/.bin/jest`
Expected: todos los tests en verde (backend: Tasks 2, 3, 5, 6 sumaron tests nuevos respecto al conteo de antes de este bloque).

- [ ] **Step 2: Typecheck + build de `apps/api`**

Run: `cd apps/api && node_modules/.bin/tsc --noEmit -p tsconfig.json && node_modules/.bin/nest build && node_modules/.bin/prisma validate`
Expected: sin errores, schema válido.

- [ ] **Step 3: Build de `apps/web`**

Run: `cd apps/web && rm -rf .next && node_modules/.bin/next build`
Expected: build exitoso, incluye `/catalogo`, `/catalogo/[id]`, sin errores de tipos.

- [ ] **Step 4: Grep de encapsulamiento — `categoria`/`ExerciseCategory` no debe quedar en ningún lado**

Run: `grep -rn "ExerciseCategory\|\.categoria\b" apps/api/src apps/api/prisma apps/web --include="*.ts" --include="*.tsx" --include="*.prisma" 2>/dev/null`
Expected: sin resultados (0 líneas).

- [ ] **Step 5: Grep — ningún error de dominio por fuera de `DomainError`**

Run: `grep -rln "extends Error" apps/api/src/identity/application/errors apps/api/src/exercise-catalog/application/errors 2>/dev/null`
Expected: sin resultados (todos deberían extender `DomainError`, no `Error` directo).

- [ ] **Step 6: Conteo final de la tabla `Exercise` contra Supabase real**

Run: `cd apps/api && node_modules/.bin/tsx -e "
import('./src/shared-kernel/prisma.service').then(async ({PrismaService}) => {
  const p = new PrismaService();
  console.log('Exercise total:', await p.exercise.count());
  await p.\$disconnect();
});
"`
Expected: `Exercise total: 1324`

- [ ] **Step 7: Resumen para el usuario**

No hay código en este step — es el cierre del bloque. Componer un resumen verbatim con los resultados reales de los Steps 1-6 (no "quedó hecho" sin evidencia), incluyendo:

- Conteo de tests antes/después de este bloque.
- Confirmación de los 1.324 ejercicios reales cargados (Task 4).
- Aclarar explícitamente qué quedó fuera de alcance (ver "Fuera de alcance" en el spec): scoping por gymId, subida de ejercicios custom, selector de acento en runtime, guard de rol PROFESOR, integración con el armador de rutinas de Bloque 3.
- Recordar que nada de este bloque se comiteó a menos que el usuario lo haya pedido explícitamente en cada task (si se ejecutó con `subagent-driven-development` y cada task comiteó por su cuenta, aclarar que sigue pendiente el push).
