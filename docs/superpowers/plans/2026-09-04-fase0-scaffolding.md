# Fase 0 — Scaffolding Monorepo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levantar el esqueleto del monorepo (pnpm workspaces) con `apps/api` (NestJS, capas domain/application/infrastructure por bounded context) y `apps/web` (Next.js App Router), más el schema de Prisma con las entidades de Identity/ExerciseCatalog/Routines definidas en `docs/hld-mvp.md` §3.

**Architecture:** Monolito modular NestJS con 3 bounded contexts (`identity`, `exercise-catalog`, `routines`) + `shared-kernel`, cada uno con `domain/application/infrastructure` vacíos pero cableados a un módulo Nest real. Next.js con route groups `(admin)/(profesor)/(alumno)`. Prisma vive en `apps/api/prisma/schema.prisma` (única app que toca la DB).

**Tech Stack:** pnpm workspaces, NestJS 10, Next.js 14 (App Router) + Tailwind, Prisma 5, TypeScript 5, Node 20.

## Global Constraints

- No usar `nest new` / `create-next-app` interactivos — todo el contenido de archivos se escribe explícito en este plan (reproducible, revisable en diff).
- No crear entidad `Gym` ni tabla de tenants — el HLD (§3, §4) solo define `gymId: string` como discriminador escalar en cada entidad, no un modelo `Gym`. No inventar lo que no está.
- No incluir setup de Supabase en este plan — queda fuera del pedido explícito del usuario.
- **Adenda 2026-09-04:** el usuario pidió incorporar el seed del catálogo de ejercicios, con cambio de fuente de datos: se usa [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) (MIT, 1.324 ejercicios, imagen+GIF+instrucciones es) en vez de Free Exercise DB. La media (imagen/GIF) es © Gym Visual — redistribución permitida, uso comercial requiere licencia propia; no bloquea el MVP de un gym pero sí antes de vender la app a otros gyms (Fase 3). Ver Tasks 8-9 y `docs/hld-mvp.md` §1/§3, `docs/prd-mvp.md` §6 regla 6 (ya actualizados).
- `domain/` sin dependencias de framework (ni `@nestjs/*` ni Prisma) — ver HLD §2.
- Scoping por `gymId` es una convención de dato (columna + índice), no lógica de autorización — eso es Fase 1.
- No commit — el usuario revisa antes de commitear (instrucción explícita).

---

### Task 1: Workspace root (pnpm + tooling base)

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `tsconfig.base.json`

**Interfaces:**
- Produces: workspace glob `apps/*` que `apps/api` y `apps/web` (Task 2/6) deben satisfacer con su propio `package.json`.

- [ ] **Step 1: Crear `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
```

- [ ] **Step 2: Crear `package.json` raíz**

```json
{
  "name": "app-gimnasio",
  "private": true,
  "version": "0.0.0",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "dev:api": "pnpm --filter api start:dev",
    "dev:web": "pnpm --filter web dev",
    "build": "pnpm -r --filter ./apps/* build",
    "prisma:generate": "pnpm --filter api prisma:generate",
    "prisma:validate": "pnpm --filter api prisma:validate"
  },
  "packageManager": "pnpm@9.0.0"
}
```

- [ ] **Step 3: Crear `.nvmrc`**

```
20
```

- [ ] **Step 4: Crear `.gitignore`**

```
node_modules/
dist/
.next/
out/
*.log
.env
.env.local
.DS_Store
```

- [ ] **Step 5: Crear `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true
  }
}
```

- [ ] **Step 6: Verificar**

Run: `test -f pnpm-workspace.yaml && test -f package.json && echo OK`
Expected: `OK`

---

### Task 2: `apps/api` — bootstrap NestJS + shared-kernel

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/tsconfig.build.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/shared-kernel/gym-id.value-object.ts`
- Create: `apps/api/src/shared-kernel/user-id.value-object.ts`

**Interfaces:**
- Produces: clase `GymId` y `UserId` (`shared-kernel/*.value-object.ts`), cada una con `static create(value: string): GymId|UserId` y getter `.value: string` — usadas por los domain de identity/routines/exercise-catalog (Tasks 3-5) para tipar sus entidades.
- Produces: `AppModule` (raíz) — Tasks 3-5 lo importan para registrar `IdentityModule`, `RoutinesModule`, `ExerciseCatalogModule`.

- [ ] **Step 1: `apps/api/package.json`**

```json
{
  "name": "api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "prisma:generate": "prisma generate",
    "prisma:validate": "prisma validate"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/platform-express": "^10.4.0",
    "@prisma/client": "^5.20.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.5",
    "@types/node": "^20.14.0",
    "prisma": "^5.20.0",
    "typescript": "^5.5.4"
  }
}
```

- [ ] **Step 2: `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

- [ ] **Step 3: `apps/api/tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "**/*spec.ts"]
}
```

- [ ] **Step 4: `apps/api/nest-cli.json`**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

- [ ] **Step 5: `apps/api/src/main.ts`**

```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
```

- [ ] **Step 6: `apps/api/src/shared-kernel/gym-id.value-object.ts`**

```typescript
export class GymId {
  private constructor(private readonly _value: string) {}

  static create(value: string): GymId {
    if (!value || value.trim().length === 0) {
      throw new Error('GymId no puede estar vacío');
    }
    return new GymId(value);
  }

  get value(): string {
    return this._value;
  }

  equals(other: GymId): boolean {
    return this._value === other._value;
  }
}
```

- [ ] **Step 7: `apps/api/src/shared-kernel/user-id.value-object.ts`**

```typescript
export class UserId {
  private constructor(private readonly _value: string) {}

  static create(value: string): UserId {
    if (!value || value.trim().length === 0) {
      throw new Error('UserId no puede estar vacío');
    }
    return new UserId(value);
  }

  get value(): string {
    return this._value;
  }

  equals(other: UserId): boolean {
    return this._value === other._value;
  }
}
```

- [ ] **Step 8: `apps/api/src/app.module.ts` (placeholder, se completa en Task 5)**

```typescript
import { Module } from '@nestjs/common';

@Module({
  imports: [],
})
export class AppModule {}
```

- [ ] **Step 9: Verificar estructura**

Run: `test -f apps/api/src/main.ts && test -f apps/api/src/shared-kernel/gym-id.value-object.ts && echo OK`
Expected: `OK`

---

### Task 3: `apps/api` — bounded context `identity`

**Files:**
- Create: `apps/api/src/identity/domain/.gitkeep`
- Create: `apps/api/src/identity/application/.gitkeep`
- Create: `apps/api/src/identity/infrastructure/.gitkeep`
- Create: `apps/api/src/identity/identity.module.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores (módulo vacío, se llena en Fase 1).
- Produces: `IdentityModule` — consumido por `AppModule` en Task 5.

- [ ] **Step 1: Crear carpetas vacías con `.gitkeep`**

`apps/api/src/identity/domain/.gitkeep`:
```
```

`apps/api/src/identity/application/.gitkeep`:
```
```

`apps/api/src/identity/infrastructure/.gitkeep`:
```
```

- [ ] **Step 2: `apps/api/src/identity/identity.module.ts`**

```typescript
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class IdentityModule {}
```

- [ ] **Step 3: Verificar**

Run: `test -d apps/api/src/identity/domain && test -d apps/api/src/identity/application && test -d apps/api/src/identity/infrastructure && test -f apps/api/src/identity/identity.module.ts && echo OK`
Expected: `OK`

---

### Task 4: `apps/api` — bounded context `exercise-catalog`

**Files:**
- Create: `apps/api/src/exercise-catalog/domain/.gitkeep`
- Create: `apps/api/src/exercise-catalog/application/.gitkeep`
- Create: `apps/api/src/exercise-catalog/infrastructure/.gitkeep`
- Create: `apps/api/src/exercise-catalog/exercise-catalog.module.ts`

**Interfaces:**
- Produces: `ExerciseCatalogModule` — consumido por `AppModule` en Task 5.

- [ ] **Step 1: Crear carpetas vacías con `.gitkeep`** (mismo patrón que Task 3, rutas bajo `exercise-catalog/`)

- [ ] **Step 2: `apps/api/src/exercise-catalog/exercise-catalog.module.ts`**

```typescript
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class ExerciseCatalogModule {}
```

- [ ] **Step 3: Verificar**

Run: `test -d apps/api/src/exercise-catalog/domain && test -f apps/api/src/exercise-catalog/exercise-catalog.module.ts && echo OK`
Expected: `OK`

---

### Task 5: `apps/api` — bounded context `routines` + wiring de `AppModule`

**Files:**
- Create: `apps/api/src/routines/domain/.gitkeep`
- Create: `apps/api/src/routines/application/.gitkeep`
- Create: `apps/api/src/routines/infrastructure/.gitkeep`
- Create: `apps/api/src/routines/routines.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `IdentityModule` (Task 3), `ExerciseCatalogModule` (Task 4).
- Produces: `RoutinesModule`; `AppModule` final con los 3 módulos importados.

- [ ] **Step 1: Crear carpetas vacías con `.gitkeep`** (mismo patrón, bajo `routines/`)

- [ ] **Step 2: `apps/api/src/routines/routines.module.ts`**

```typescript
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class RoutinesModule {}
```

- [ ] **Step 3: Actualizar `apps/api/src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { IdentityModule } from './identity/identity.module';
import { ExerciseCatalogModule } from './exercise-catalog/exercise-catalog.module';
import { RoutinesModule } from './routines/routines.module';

@Module({
  imports: [IdentityModule, ExerciseCatalogModule, RoutinesModule],
})
export class AppModule {}
```

- [ ] **Step 4: Instalar dependencias y compilar**

Run: `cd apps/api && pnpm install --no-frozen-lockfile && pnpm exec nest build`
Expected: build sin errores, genera `apps/api/dist/main.js`

---

### Task 6: Prisma schema — entidades Identity/ExerciseCatalog/Routines

**Files:**
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/.env.example`

**Interfaces:**
- Produces: modelos `User`, `Exercise`, `RoutineTemplate`, `RoutineTemplateExercise`, `RoutineInstance`, `RoutineInstanceExercise` y enums `Role`, `ExerciseSource` — usados por la capa `infrastructure` de cada bounded context en Fase 1 (repos Prisma).

- [ ] **Step 1: `apps/api/.env.example`**

```
DATABASE_URL="postgresql://user:password@localhost:5432/app_gimnasio?schema=public"
```

- [ ] **Step 2: `apps/api/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  ADMIN
  PROFESOR
  ALUMNO
}

enum ExerciseSource {
  CATALOG
  CUSTOM
}

// Identity (HLD §3)
model User {
  id        String   @id @default(uuid())
  gymId     String
  email     String
  nombre    String
  role      Role
  activo    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  templatesComoProfesor  RoutineTemplate[] @relation("ProfesorTemplates")
  instanciasComoProfesor RoutineInstance[] @relation("ProfesorInstances")
  instanciasComoAlumno   RoutineInstance[] @relation("AlumnoInstances")

  @@unique([gymId, email])
  @@index([gymId])
}

// ExerciseCatalog (HLD §3)
model Exercise {
  id            String         @id @default(uuid())
  gymId         String?
  nombre        String
  grupoMuscular String
  equipamiento  String?
  mediaUrl      String?
  iconUrl       String?
  fuente        ExerciseSource @default(CATALOG)
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  ejerciciosDeTemplate RoutineTemplateExercise[]
  ejerciciosDeInstance RoutineInstanceExercise[]

  @@index([gymId])
}

// Routines — modelo plantilla -> clon al asignar (HLD §3 / PRD §3)
model RoutineTemplate {
  id          String   @id @default(uuid())
  gymId       String
  profesorId  String
  nombre      String
  descripcion String?
  activa      Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  profesor         User                      @relation("ProfesorTemplates", fields: [profesorId], references: [id])
  ejercicios       RoutineTemplateExercise[]
  instanciasOrigen RoutineInstance[]         @relation("OrigenTemplate")

  @@index([gymId])
  @@index([profesorId])
}

model RoutineTemplateExercise {
  id           String  @id @default(uuid())
  templateId   String
  exerciseId   String
  orden        Int
  series       Int
  repeticiones Int
  descanso     Int
  notas        String?

  template RoutineTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  exercise Exercise        @relation(fields: [exerciseId], references: [id])

  @@unique([templateId, orden])
  @@index([exerciseId])
}

model RoutineInstance {
  id               String    @id @default(uuid())
  gymId            String
  profesorId       String
  alumnoId         String
  nombre           String
  origenTemplateId String?
  vigenteDesde     DateTime  @default(now())
  vigenteHasta     DateTime?
  activa           Boolean   @default(true)
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  profesor       User                      @relation("ProfesorInstances", fields: [profesorId], references: [id])
  alumno         User                      @relation("AlumnoInstances", fields: [alumnoId], references: [id])
  origenTemplate RoutineTemplate?          @relation("OrigenTemplate", fields: [origenTemplateId], references: [id])
  ejercicios     RoutineInstanceExercise[]

  @@index([gymId])
  @@index([alumnoId])
  @@index([profesorId])
}

model RoutineInstanceExercise {
  id           String  @id @default(uuid())
  instanceId   String
  exerciseId   String
  orden        Int
  series       Int
  repeticiones Int
  descanso     Int
  notas        String?

  instance RoutineInstance @relation(fields: [instanceId], references: [id], onDelete: Cascade)
  exercise Exercise        @relation(fields: [exerciseId], references: [id])

  @@unique([instanceId, orden])
  @@index([exerciseId])
}
```

- [ ] **Step 3: Validar el schema**

Run: `cd apps/api && cp .env.example .env && pnpm exec prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: Generar el client (sin necesitar DB corriendo)**

Run: `cd apps/api && pnpm exec prisma generate`
Expected: `Generated Prisma Client` sin errores

---

### Task 7: `apps/web` — bootstrap Next.js App Router + Tailwind + route groups

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.js`
- Create: `apps/web/app/globals.css`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/app/(admin)/admin/page.tsx`
- Create: `apps/web/app/(profesor)/profesor/page.tsx`
- Create: `apps/web/app/(alumno)/alumno/page.tsx`

**Interfaces:**
- Produces: nada consumido por otras tasks — es la app `web` final del workspace.

**Nota (encontrada en ejecución, no en el diseño original):** los route groups `(admin)/(profesor)/(alumno)` de Next.js App Router NO agregan segmento a la URL — un `page.tsx` en cada uno de esos 3 grupos más el de la raíz colisionan, las 4 resuelven a `/`. Por eso cada dashboard de rol vive en `(grupo)/segmento/page.tsx` (p.ej. `(admin)/admin/page.tsx` → `/admin`): el grupo sigue sirviendo para agrupar layout/guards compartidos por rol (HLD §2), el segmento le da una URL propia.

- [ ] **Step 1: `apps/web/package.json`**

```json
{
  "name": "web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.5.4"
  }
}
```

- [ ] **Step 2: `apps/web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: `apps/web/next.config.mjs`**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
```

- [ ] **Step 4: `apps/web/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: `apps/web/postcss.config.js`**

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 6: `apps/web/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 7: `apps/web/app/layout.tsx`**

```tsx
import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'App Gimnasio',
  description: 'Gestión de rutinas de gimnasio',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: `apps/web/app/page.tsx`**

```tsx
export default function HomePage() {
  return <main>App Gimnasio</main>;
}
```

- [ ] **Step 9: `apps/web/app/(admin)/admin/page.tsx`**

```tsx
export default function AdminPage() {
  return <main>Panel Admin</main>;
}
```

- [ ] **Step 10: `apps/web/app/(profesor)/profesor/page.tsx`**

```tsx
export default function ProfesorPage() {
  return <main>Panel Profesor</main>;
}
```

- [ ] **Step 11: `apps/web/app/(alumno)/alumno/page.tsx`**

```tsx
export default function AlumnoPage() {
  return <main>Mi rutina</main>;
}
```

- [ ] **Step 12: Instalar dependencias y compilar**

Run: `cd apps/web && pnpm install --no-frozen-lockfile && pnpm exec next build`
Expected: build sin errores (rutas `/`, `/admin`, `/profesor`, `/alumno` listadas en el output)

---

### Task 8: Prisma schema — actualizar `Exercise` para exercises-dataset

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Consumes: modelo `Exercise` creado en Task 6 (a modificar in-place).
- Produces: `Exercise` con el shape que Task 9 (seed script) necesita.

**Contexto:** el usuario cambió la fuente del catálogo de Free Exercise DB a [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) (MIT, 1.324 ejercicios, imagen + GIF + instrucciones en español). La media (imagen/GIF) es © Gym Visual — ver gate de licencia en `docs/hld-mvp.md` §1 y `docs/prd-mvp.md` §6 regla 6.

- [ ] **Step 1: Reemplazar el modelo `Exercise` en `apps/api/prisma/schema.prisma`** (mismo archivo de Task 6, solo cambia este modelo — el resto del schema queda igual)

```prisma
enum ExerciseCategory {
  STRENGTH
  CARDIO
  STRETCHING
  PLYOMETRICS
  OTHER
}

model Exercise {
  id                          String           @id @default(uuid())
  gymId                       String?
  nombre                      String
  categoria                   ExerciseCategory @default(OTHER)
  grupoMuscular                String
  gruposMuscularesSecundarios String[]         @default([])
  equipamiento                String?
  imageUrl                    String?
  gifUrl                      String?
  instrucciones                String?
  fuente                      ExerciseSource   @default(CATALOG)
  licenciaMedia               String?
  atribucionMedia              String?
  createdAt                   DateTime         @default(now())
  updatedAt                   DateTime         @updatedAt

  ejerciciosDeTemplate RoutineTemplateExercise[]
  ejerciciosDeInstance RoutineInstanceExercise[]

  @@index([gymId])
}
```

Notas de mapeo respecto al Task 6 original: `mediaUrl`/`iconUrl` se reemplazan por `imageUrl`/`gifUrl` (el dataset trae ambos por separado); se agregan `categoria` (enum, default `OTHER` para no romper filas existentes), `gruposMuscularesSecundarios` (array), `instrucciones` (texto largo, nullable — no todo ejercicio del dataset trae instrucciones en `es`), `licenciaMedia` y `atribucionMedia` (nullable — solo se completan para ejercicios de catálogo vía el seed; un ejercicio custom subido por un profesor en Fase 2 no las necesita).

- [ ] **Step 2: Validar y regenerar el client**

Run: `cd apps/api && pnpm exec prisma validate && pnpm exec prisma generate`
Expected: `The schema at prisma/schema.prisma is valid 🚀` seguido de `Generated Prisma Client` sin errores. Si `pnpm` no está en PATH en el sandbox, usar `npx --yes prisma@5.20.0` (mismo patrón que Task 6/5).

---

### Task 9: Seed script del catálogo de ejercicios (exercises-dataset)

**Files:**
- Create: `apps/api/prisma/seed-exercises.ts`
- Modify: `apps/api/package.json` (agregar script `seed:exercises` y dependencia dev `tsx` para correr TS directo)

**Interfaces:**
- Consumes: `Exercise` de Task 8 (`prisma.exercise` del client generado), enums `ExerciseCategory`/`ExerciseSource`.
- Produces: comando `pnpm --filter api seed:exercises` — idempotente, no se ejecuta como parte de ninguna migración automática (HLD §6/§7).

**Contexto:** el dataset se clona/descarga aparte (no vive en este repo — demasiado grande y con licencia de media distinta a la del código). El script asume que ya existe un checkout local del dataset (ver `EXERCISES_DATASET_PATH` abajo) con una carpeta `data/` de JSON y carpetas `images/`/`videos` para la media; en este Fase 0 el script debe funcionar contra un JSON de ejemplo (no requiere red ni el dataset real clonado) para poder probarlo, y quedar listo para apuntarlo al dataset real después.

- [ ] **Step 1: Agregar dependencia `tsx` y script en `apps/api/package.json`**

Agregar a `devDependencies`: `"tsx": "^4.19.0"`. Agregar a `scripts`: `"seed:exercises": "tsx prisma/seed-exercises.ts"`.

- [ ] **Step 2: Crear fixture de prueba `apps/api/prisma/seed-exercises.fixture.json`** (representa el shape real del dataset, minimizado a 2 ejercicios para poder correr el seed sin la red ni el dataset clonado)

```json
[
  {
    "id": "3_4_Sit-Up",
    "name": "3/4 Sit-Up",
    "category": "strength",
    "muscle_group": "abdominals",
    "secondary_muscles": ["hip flexors"],
    "equipment": "body only",
    "image": "images/3_4_Sit-Up/0.jpg",
    "gif_url": "images/3_4_Sit-Up/0.gif",
    "instructions": {
      "es": "Acostate boca arriba con las rodillas flexionadas. Cruzá los brazos sobre el pecho y subí el torso 3/4 del recorrido de una sentadilla abdominal completa."
    }
  },
  {
    "id": "Adductor",
    "name": "Adductor",
    "category": "strength",
    "muscle_group": "adductors",
    "secondary_muscles": [],
    "equipment": "machine",
    "image": "images/Adductor/0.jpg",
    "gif_url": "images/Adductor/0.gif",
    "instructions": {
      "es": "Sentate en la máquina de aductores con las piernas separadas apoyadas en los cojines. Juntá las piernas contra la resistencia de forma controlada."
    }
  }
]
```

- [ ] **Step 3: Crear `apps/api/prisma/seed-exercises.ts`**

```typescript
import { PrismaClient, ExerciseCategory, ExerciseSource } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const prisma = new PrismaClient();

const LICENCIA_MEDIA = 'Gym Visual - uso comercial requiere licencia propia';
const ATRIBUCION_MEDIA = '© Gym Visual - https://gymvisual.com/';

interface DatasetExercise {
  id: string;
  name: string;
  category: string;
  muscle_group: string;
  secondary_muscles: string[];
  equipment: string | null;
  image: string | null;
  gif_url: string | null;
  instructions?: { es?: string };
}

function mapCategoria(raw: string): ExerciseCategory {
  const normalizado = raw.trim().toLowerCase();
  switch (normalizado) {
    case 'strength':
      return ExerciseCategory.STRENGTH;
    case 'cardio':
      return ExerciseCategory.CARDIO;
    case 'stretching':
      return ExerciseCategory.STRETCHING;
    case 'plyometrics':
      return ExerciseCategory.PLYOMETRICS;
    default:
      return ExerciseCategory.OTHER;
  }
}

function cargarDataset(rutaJson: string): DatasetExercise[] {
  const contenido = readFileSync(rutaJson, 'utf-8');
  return JSON.parse(contenido) as DatasetExercise[];
}

async function seedExercise(item: DatasetExercise): Promise<void> {
  await prisma.exercise.upsert({
    where: { id: item.id },
    create: {
      id: item.id,
      gymId: null,
      nombre: item.name,
      categoria: mapCategoria(item.category),
      grupoMuscular: item.muscle_group,
      gruposMuscularesSecundarios: item.secondary_muscles ?? [],
      equipamiento: item.equipment ?? null,
      imageUrl: item.image ?? null,
      gifUrl: item.gif_url ?? null,
      instrucciones: item.instructions?.es ?? null,
      fuente: ExerciseSource.CATALOG,
      licenciaMedia: LICENCIA_MEDIA,
      atribucionMedia: ATRIBUCION_MEDIA,
    },
    update: {
      nombre: item.name,
      categoria: mapCategoria(item.category),
      grupoMuscular: item.muscle_group,
      gruposMuscularesSecundarios: item.secondary_muscles ?? [],
      equipamiento: item.equipment ?? null,
      imageUrl: item.image ?? null,
      gifUrl: item.gif_url ?? null,
      instrucciones: item.instructions?.es ?? null,
      licenciaMedia: LICENCIA_MEDIA,
      atribucionMedia: ATRIBUCION_MEDIA,
    },
  });
}

async function main(): Promise<void> {
  const rutaDataset = process.env.EXERCISES_DATASET_PATH
    ? join(process.env.EXERCISES_DATASET_PATH, 'data', 'exercises.json')
    : join(__dirname, 'seed-exercises.fixture.json');

  const ejercicios = cargarDataset(rutaDataset);
  console.log(`Importando ${ejercicios.length} ejercicios desde ${rutaDataset}...`);

  for (const item of ejercicios) {
    await seedExercise(item);
  }

  console.log(`Listo: ${ejercicios.length} ejercicios importados/actualizados (fuente: CATALOG, ${ATRIBUCION_MEDIA}).`);
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

- [ ] **Step 4: Correr el seed contra el fixture (requiere una DB Postgres accesible vía `DATABASE_URL`; si no hay una disponible en este entorno, correr `prisma migrate dev` o levantar Postgres queda fuera de esta task — reportar como concern, no como bloqueo)**

Run: `cd apps/api && pnpm exec tsx prisma/seed-exercises.ts` (o `npx --yes tsx prisma/seed-exercises.ts` si `pnpm` no está en PATH)
Expected (con DB accesible): `Importando 2 ejercicios desde .../seed-exercises.fixture.json...` seguido de `Listo: 2 ejercicios importados/actualizados...`. Sin DB accesible: reportar el error de conexión tal cual — no es un fallo del script, es un prerequisito de infra fuera de este plan (Supabase/Postgres local).

- [ ] **Step 5: Verificar idempotencia (solo si Step 4 corrió contra una DB real)**

Run: correr el mismo comando del Step 4 una segunda vez.
Expected: mismo output, sin errores de constraint (el `upsert` por `id` lo garantiza), y sin filas duplicadas.

---

### Task 10: Verificación integral del monorepo

**Files:** ninguno (solo comandos)

- [ ] **Step 1: Install completo desde la raíz**

Run: `pnpm install --no-frozen-lockfile`
Expected: resuelve `apps/api` y `apps/web` sin conflictos de lockfile

- [ ] **Step 2: Build de `api`**

Run: `pnpm --filter api build`
Expected: exit 0, `apps/api/dist/main.js` existe

- [ ] **Step 3: Validar Prisma**

Run: `pnpm --filter api prisma:validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: Build de `web`**

Run: `pnpm --filter web build`
Expected: exit 0

- [ ] **Step 5: Confirmar que el seed script existe y compila (sin ejecutarlo si no hay DB)**

Run: `cd apps/api && pnpm exec tsc --noEmit prisma/seed-exercises.ts`
Expected: sin errores de tipos (confirma que el script matchea el client de Prisma generado en Task 8, aunque no haya DB para correrlo de punta a punta)

- [ ] **Step 6: Reportar al usuario**

No hacer commit. Informar que Fase 0 (scaffolding pedido, incluyendo el cambio de catálogo a exercises-dataset) está lista para revisión manual (`git status`, `git diff`) antes de commitear. Recordar el gate de licencia de media (Gym Visual) documentado en HLD/PRD.
