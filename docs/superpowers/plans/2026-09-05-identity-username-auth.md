# Identity — auth por username (sin email) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el flujo de alta por email/invitación (Fase 1) por un esquema 100% username-based: `CreateUserUseCase` (PROFESOR con password real, ALUMNO con username+password autogenerados), `LoginUseCase` ramificado por presencia de `password`, jerarquía de quién-crea-a-quién validada en el caso de uso, rate limit de login, y la UI de admin correspondiente. Ningún email real en ningún lado del sistema.

**Architecture:** Todo dentro de `identity`. El email sintético y la derivación HMAC de la password del alumno quedan 100% confinados a `identity/infrastructure/auth/` — el resto del sistema (casos de uso, controllers, frontend) solo conoce `username`. `AuthProviderPort` expone 4 métodos de alto nivel (`createStaffUser`, `createAlumnoUser`, `signInStaff`, `signInAlumno`) que ya reciben/devuelven credenciales resueltas — la aplicación nunca ve un email ni una password derivada.

**Tech Stack:** `@supabase/supabase-js` (ya instalado), `node:crypto` (HMAC-SHA256, sin dependencia nueva), Jest (TDD en todo lo nuevo), `@supabase/ssr` en `apps/web` (ya en el plan anterior, este plan lo retoma).

## Global Constraints

- **Cero email real.** Nada de `inviteUserByEmail`, magic links, ni notificaciones por mail. El único email que existe es sintético, interno, nunca expuesto (`identity/infrastructure/auth/synthetic-credentials.ts`).
- **Jerarquía de creación** (interpretación explícita, confirmar si no es la intención): ADMIN puede crear `PROFESOR` o `ALUMNO`; PROFESOR solo `ALUMNO`. Nadie crea otro `ADMIN` a través de esta app — no es una capacidad de este plan (se lee así de la instrucción "ADMIN puede crear PROFESOR o ALUMNO"). Esto se valida en `CreateUserUseCase`, no solo en `@Roles()` del endpoint.
- **`AUTH_DERIVE_SECRET`** es una env var nueva, propia, distinta de `SUPABASE_JWT_SECRET` — se agrega a `apps/api/.env.example` sin valor real. La password derivada del alumno (`HMAC-SHA256(AUTH_DERIVE_SECRET, "{gymId}:{username}")`) nunca se persiste — se recalcula en cada alta y cada login.
- **Login sin enumeración:** nunca se hace un lookup previo de "¿este username es de un alumno o de un staff?" antes de autenticar. Se intenta la rama que indica la presencia/ausencia de `password` en el request; la rama equivocada simplemente falla con el mismo error genérico que una password mal tipeada.
- **`gymId` en `CreateUserUseCase`/`ListUsersUseCase`/`DeactivateUserUseCase` sale siempre de `invocadoPor.gymId`** (el usuario autenticado que invoca), nunca de un campo del body/query del cliente — mismo principio de Fase 1.
- **Login SÍ necesita `gymId` en el body** (no hay sesión todavía para derivarlo de ningún lado) — la UI lo resuelve con `NEXT_PUBLIC_GYM_ID` (env var nueva en `apps/web`), asumiendo single-gym MVP (HLD: "un solo gimnasio, el de Fer"). Documentado como TODO de Fase 3 (multi-gym) reemplazar esto por resolución real (subdominio/slug).
- **`SUPABASE_SERVICE_ROLE_KEY` y `AUTH_DERIVE_SECRET`** siguen confinadas a `apps/api` — nunca en `apps/web` ni en `NEXT_PUBLIC_*`.
- **Decisión de UI de login** (pedida explícitamente al usuario, con justificación): un solo formulario con `username` + `password` **opcional**. Si se deja vacío, el submit no manda el campo `password` (rama alumno); si se completa, lo manda (rama staff). Se descarta el selector "soy alumno/soy staff" porque agregaría un paso sin necesidad real: el contrato del backend ya es "con o sin password", así que el form solo tiene que respetar esa forma — cero lógica extra, y no insinúa de antemano a qué rol pertenece un username (ni siquiera visualmente).
- No commit — el usuario revisa antes de commitear.
- Este plan reemplaza por completo cualquier trabajo pendiente basado en `InviteUserUseCase`/email de una sesión anterior — no queda nada de ese enfoque en el código final.

---

### Task 1: Prisma — `User.email` → `username`

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_user_email_to_username/migration.sql`

**Interfaces:**

- Produces: `User.username` (String, único por gym) reemplazando `User.email`.

**Contexto:** verificado con `prisma.user.count()` contra la Supabase real — 0 filas. La columna puede recrearse `NOT NULL` sin backfill.

- [ ] **Step 1: Modificar `model User` en `apps/api/prisma/schema.prisma`** (reemplazar el campo `email` por `username` y el `@@unique` — el resto del modelo, relaciones incluidas, queda igual)

```prisma
model User {
  id         String   @id @default(uuid())
  authUserId String   @unique
  gymId      String
  username   String
  nombre     String
  role       Role
  activo     Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  templatesComoProfesor  RoutineTemplate[] @relation("ProfesorTemplates")
  instanciasComoProfesor RoutineInstance[] @relation("ProfesorInstances")
  instanciasComoAlumno   RoutineInstance[] @relation("AlumnoInstances")

  @@unique([gymId, username])
  @@index([gymId])
}
```

- [ ] **Step 2: Generar el SQL de la migración sin aplicarlo**

Run: `cd apps/api && node_modules/.bin/prisma migrate diff --from-url "$(grep DIRECT_URL .env | cut -d '=' -f2- | tr -d '"')" --to-schema-datamodel prisma/schema.prisma --script`
Expected: un `DROP COLUMN "email"` + `ADD COLUMN "username"` (o el equivalente que Prisma genere) + el `DROP INDEX`/`CREATE UNIQUE INDEX` correspondiente al cambio de `gymId_email` a `gymId_username`.

- [ ] **Step 3: Materializar la migración** con ese SQL exacto en `apps/api/prisma/migrations/<timestamp-UTC-actual>_user_email_to_username/migration.sql` (timestamp posterior al último existente)

- [ ] **Step 4: Aplicar contra Supabase**

Run: `cd apps/api && node_modules/.bin/prisma migrate deploy`
Expected: `All migrations have been successfully applied.`

- [ ] **Step 5: Regenerar el client y validar**

Run: `cd apps/api && node_modules/.bin/prisma generate && node_modules/.bin/prisma validate`
Expected: `Generated Prisma Client` + `The schema at prisma/schema.prisma is valid 🚀`

---

### Task 2: Errores de dominio + reescritura de puertos

**Files:**

- Modify: `apps/api/src/identity/application/errors/duplicate-email.error.ts` → renombrar archivo y clase a `duplicate-username.error.ts`/`DuplicateUsernameError`
- Create: `apps/api/src/identity/application/errors/role-hierarchy.error.ts`
- Create: `apps/api/src/identity/application/errors/invalid-credentials.error.ts`
- Modify: `apps/api/src/identity/application/ports/user-repository.port.ts`
- Modify: `apps/api/src/identity/application/ports/auth-provider.port.ts`

**Interfaces:**

- Produces: `DuplicateUsernameError`, `RoleHierarchyError`, `InvalidCredentialsError` — usados por Tasks 5-6 y el filter (Task 10).
- Produces: `UserRepositoryPort` (username-based), `AuthProviderPort` (`createStaffUser`/`createAlumnoUser`/`signInStaff`/`signInAlumno`) — usados por Tasks 3-8.

- [ ] **Step 1: Borrar `apps/api/src/identity/application/errors/duplicate-email.error.ts` y crear `apps/api/src/identity/application/errors/duplicate-username.error.ts`**

```typescript
export class DuplicateUsernameError extends Error {
  constructor(username: string, gymId: string) {
    super(`Ya existe un usuario con username '${username}' en el gym '${gymId}'.`);
    this.name = 'DuplicateUsernameError';
  }
}
```

- [ ] **Step 2: `apps/api/src/identity/application/errors/role-hierarchy.error.ts`**

```typescript
export class RoleHierarchyError extends Error {
  constructor(rolInvocador: string, rolSolicitado: string) {
    super(`El rol '${rolInvocador}' no puede crear usuarios con rol '${rolSolicitado}'.`);
    this.name = 'RoleHierarchyError';
  }
}
```

- [ ] **Step 3: `apps/api/src/identity/application/errors/invalid-credentials.error.ts`**

```typescript
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Usuario o contraseña incorrectos.');
    this.name = 'InvalidCredentialsError';
  }
}
```

- [ ] **Step 4: Reescribir `apps/api/src/identity/application/ports/user-repository.port.ts`**

```typescript
import { Role } from '../../domain/role';

export interface UserRecord {
  id: string;
  authUserId: string;
  gymId: string;
  username: string;
  nombre: string;
  role: Role;
  activo: boolean;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepositoryPort {
  findByAuthUserId(authUserId: string): Promise<UserRecord | null>;
  findByGymIdAndUsername(gymId: string, username: string): Promise<UserRecord | null>;
  findByGymId(gymId: string, role?: Role): Promise<UserRecord[]>;
  findById(id: string): Promise<UserRecord | null>;
  deactivate(id: string): Promise<UserRecord>;
  create(data: {
    gymId: string;
    authUserId: string;
    username: string;
    nombre: string;
    role: Role;
  }): Promise<UserRecord>;
}
```

- [ ] **Step 5: Reescribir `apps/api/src/identity/application/ports/auth-provider.port.ts`**

```typescript
export const AUTH_PROVIDER = Symbol('AUTH_PROVIDER');

export interface AuthUserRef {
  authUserId: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
}

/**
 * La aplicación nunca ve un email ni una password derivada — estos 4
 * métodos ya reciben/devuelven credenciales resueltas. El mapeo a email
 * sintético y la derivación de password del alumno son detalles 100%
 * confinados al adaptador (identity/infrastructure/auth/).
 */
export interface AuthProviderPort {
  createStaffUser(gymId: string, username: string, password: string): Promise<AuthUserRef>;
  createAlumnoUser(gymId: string, username: string): Promise<AuthUserRef>;
  signInStaff(gymId: string, username: string, password: string): Promise<AuthSession>;
  signInAlumno(gymId: string, username: string): Promise<AuthSession>;
}
```

- [ ] **Step 6: Verificar que compila** (va a fallar porque `PrismaUserRepository`/`SupabaseAdminAuthProvider`/`InviteUserUseCase` todavía implementan las interfaces viejas — eso es esperado, se arregla en Tasks 3-5)

Run: `cd apps/api && node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: FAIL con errores de tipo en `prisma-user.repository.ts`, `supabase-admin-auth.provider.ts` e `invite-user.use-case.ts` — anotar que esto es RED esperado para las tasks siguientes, no un bug de este task.

---

### Task 3: Reescribir `PrismaUserRepository`

**Files:**

- Modify: `apps/api/src/identity/infrastructure/persistence/prisma-user.repository.ts`

**Interfaces:**

- Consumes: `UserRepositoryPort` (Task 2), `DuplicateUsernameError` (Task 2).

- [ ] **Step 1: Reescribir el archivo completo**

```typescript
import { Injectable } from '@nestjs/common';
import { Prisma, Role as PrismaRole } from '@prisma/client';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import { UserRecord, UserRepositoryPort } from '../../application/ports/user-repository.port';
import { Role } from '../../domain/role';
import { DuplicateUsernameError } from '../../application/errors/duplicate-username.error';

interface PrismaUserRow {
  id: string;
  authUserId: string;
  gymId: string;
  username: string;
  nombre: string;
  role: PrismaRole;
  activo: boolean;
}

@Injectable()
export class PrismaUserRepository implements UserRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByAuthUserId(authUserId: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { authUserId } });
    return user ? this.toRecord(user) : null;
  }

  async findByGymIdAndUsername(gymId: string, username: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { gymId_username: { gymId, username } },
    });
    return user ? this.toRecord(user) : null;
  }

  async findByGymId(gymId: string, role?: Role): Promise<UserRecord[]> {
    const users = await this.prisma.user.findMany({
      where: { gymId, ...(role ? { role: role as unknown as PrismaRole } : {}) },
      orderBy: { nombre: 'asc' },
    });
    return users.map((u) => this.toRecord(u));
  }

  async findById(id: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? this.toRecord(user) : null;
  }

  async deactivate(id: string): Promise<UserRecord> {
    const user = await this.prisma.user.update({ where: { id }, data: { activo: false } });
    return this.toRecord(user);
  }

  async create(data: {
    gymId: string;
    authUserId: string;
    username: string;
    nombre: string;
    role: Role;
  }): Promise<UserRecord> {
    try {
      const user = await this.prisma.user.create({
        data: {
          gymId: data.gymId,
          authUserId: data.authUserId,
          username: data.username,
          nombre: data.nombre,
          // Los valores de `Role` (dominio) y `PrismaRole` son idénticos por
          // diseño (ver identity/domain/role.ts) — cast explícito documentado.
          role: data.role as unknown as PrismaRole,
        },
      });
      return this.toRecord(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DuplicateUsernameError(data.username, data.gymId);
      }
      throw error;
    }
  }

  private toRecord(user: PrismaUserRow): UserRecord {
    return {
      id: user.id,
      authUserId: user.authUserId,
      gymId: user.gymId,
      username: user.username,
      nombre: user.nombre,
      role: user.role as unknown as Role,
      activo: user.activo,
    };
  }
}
```

- [ ] **Step 2: Verificar que compila** (confirma que `gymId_username` es el nombre real del input compuesto)

Run: `cd apps/api && node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: sin errores en este archivo (van a seguir los de `supabase-admin-auth.provider.ts`/`invite-user.use-case.ts`, esperado hasta Tasks 4-5)

---

### Task 4: Credenciales sintéticas (TDD) + reescritura de `SupabaseAdminAuthProvider`

**Files:**

- Create: `apps/api/src/identity/infrastructure/auth/synthetic-credentials.ts`
- Test: `apps/api/src/identity/infrastructure/auth/synthetic-credentials.spec.ts`
- Modify: `apps/api/src/identity/infrastructure/auth/supabase-admin-auth.provider.ts`
- Modify: `apps/api/src/identity/infrastructure/auth/supabase-admin-auth.provider.spec.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**

- Produces: `buildSyntheticEmail(gymId, username)`, `deriveAlumnoPassword(gymId, username)` — funciones puras, testeadas sin mockear Supabase. Consumidas por `SupabaseAdminAuthProvider`.

**Nota sobre el separador del email sintético:** se usa `+` (`{username}+{gymId}@gym.internal`) — es sintaxis estándar de "tagged email" (RFC 5321, ampliamente soportada, GoTrue de Supabase no la rechaza en validaciones típicas). Queda como una constante (`SEPARADOR_EMAIL_SINTETICO`) fácil de cambiar en un solo lugar si alguna vez se comprueba lo contrario contra un proyecto real — este plan no ejercita `admin.createUser` contra la Supabase real (crearía usuarios reales en `auth.users` como side effect; no se hace sin autorización explícita, igual que con `inviteUserByEmail` en Fase 1).

- [ ] **Step 1: Escribir el test `apps/api/src/identity/infrastructure/auth/synthetic-credentials.spec.ts`**

```typescript
import { buildSyntheticEmail, deriveAlumnoPassword } from './synthetic-credentials';

describe('buildSyntheticEmail', () => {
  it('genera un email determinístico a partir de gymId + username', () => {
    expect(buildSyntheticEmail('gym-1', 'juan.perez')).toBe('juan.perez+gym-1@gym.internal');
  });

  it('el mismo (gymId, username) siempre produce el mismo email', () => {
    const a = buildSyntheticEmail('gym-1', 'juan.perez');
    const b = buildSyntheticEmail('gym-1', 'juan.perez');
    expect(a).toBe(b);
  });

  it('gyms distintos con el mismo username producen emails distintos', () => {
    const a = buildSyntheticEmail('gym-1', 'juan.perez');
    const b = buildSyntheticEmail('gym-2', 'juan.perez');
    expect(a).not.toBe(b);
  });
});

describe('deriveAlumnoPassword', () => {
  const originalSecret = process.env.AUTH_DERIVE_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.AUTH_DERIVE_SECRET;
    } else {
      process.env.AUTH_DERIVE_SECRET = originalSecret;
    }
  });

  it('lanza si AUTH_DERIVE_SECRET no está configurado', () => {
    delete process.env.AUTH_DERIVE_SECRET;
    expect(() => deriveAlumnoPassword('gym-1', 'juan.perez')).toThrow();
  });

  it('es determinística: mismo (gymId, username) siempre da la misma password', () => {
    process.env.AUTH_DERIVE_SECRET = 'test-derive-secret';
    const a = deriveAlumnoPassword('gym-1', 'juan.perez');
    const b = deriveAlumnoPassword('gym-1', 'juan.perez');
    expect(a).toBe(b);
  });

  it('usernames distintos producen passwords distintas', () => {
    process.env.AUTH_DERIVE_SECRET = 'test-derive-secret';
    const a = deriveAlumnoPassword('gym-1', 'juan.perez');
    const b = deriveAlumnoPassword('gym-1', 'juan.perez2');
    expect(a).not.toBe(b);
  });

  it('nunca se persiste: no aparece en texto plano en ningún archivo aparte de este test (verificación conceptual: la función solo la calcula, no la guarda en ningún lado)', () => {
    process.env.AUTH_DERIVE_SECRET = 'test-derive-secret';
    const password = deriveAlumnoPassword('gym-1', 'juan.perez');
    expect(typeof password).toBe('string');
    expect(password.length).toBeGreaterThanOrEqual(32);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/api && node_modules/.bin/jest synthetic-credentials`
Expected: FAIL — `Cannot find module './synthetic-credentials'`

- [ ] **Step 3: `apps/api/src/identity/infrastructure/auth/synthetic-credentials.ts`**

```typescript
import { createHmac } from 'node:crypto';

const DOMINIO_EMAIL_SINTETICO = 'gym.internal';
const SEPARADOR_EMAIL_SINTETICO = '+';

/**
 * Supabase Auth exige nativamente email o teléfono como identificador.
 * Este email sintético NUNCA se expone al frontend ni se comunica a
 * nadie — vive exclusivamente acá, con el mismo nivel de encapsulamiento
 * que el service_role key. Determinístico: mismo (gymId, username)
 * siempre produce el mismo email.
 */
export function buildSyntheticEmail(gymId: string, username: string): string {
  return `${username}${SEPARADOR_EMAIL_SINTETICO}${gymId}@${DOMINIO_EMAIL_SINTETICO}`;
}

/**
 * Password derivada determinística para alumnos: HMAC-SHA256 con un
 * secret propio (`AUTH_DERIVE_SECRET`, distinto del JWT secret de
 * Supabase). Nunca se persiste — se recalcula en cada alta y cada login.
 */
export function deriveAlumnoPassword(gymId: string, username: string): string {
  const secret = process.env.AUTH_DERIVE_SECRET;
  if (!secret) {
    throw new Error('AUTH_DERIVE_SECRET no está configurado en el servidor');
  }
  return createHmac('sha256', secret).update(`${gymId}:${username}`).digest('hex');
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/api && node_modules/.bin/jest synthetic-credentials`
Expected: `8 passed, 8 total`

- [ ] **Step 5: Reescribir `apps/api/src/identity/infrastructure/auth/supabase-admin-auth.provider.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AuthProviderPort,
  AuthSession,
  AuthUserRef,
} from '../../application/ports/auth-provider.port';
import { buildSyntheticEmail, deriveAlumnoPassword } from './synthetic-credentials';

/**
 * Adaptador de AuthProviderPort contra Supabase Auth. Usa el service_role
 * key — SOLO server-side. El email sintético y la password derivada del
 * alumno se resuelven acá adentro; nada de esto sale de este archivo.
 *
 * Nota sobre `admin.createUser` con `email_confirm: true`: a diferencia de
 * `inviteUserByEmail` (Fase 1, descartado en este plan), este método NO
 * dispara ningún correo — crea el usuario ya confirmado directamente.
 * (Documentado en la API de Supabase Admin; no se verificó en vivo en este
 * plan porque haría un side effect real sobre `auth.users` sin
 * autorización explícita — ver Task 4 del plan.)
 */
@Injectable()
export class SupabaseAdminAuthProvider implements AuthProviderPort {
  private readonly client: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRoleKey) {
      throw new Error(
        'SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridos para SupabaseAdminAuthProvider',
      );
    }

    this.client = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async createStaffUser(gymId: string, username: string, password: string): Promise<AuthUserRef> {
    return this.crearEnSupabase(gymId, username, password);
  }

  async createAlumnoUser(gymId: string, username: string): Promise<AuthUserRef> {
    return this.crearEnSupabase(gymId, username, deriveAlumnoPassword(gymId, username));
  }

  async signInStaff(gymId: string, username: string, password: string): Promise<AuthSession> {
    return this.iniciarSesion(gymId, username, password);
  }

  async signInAlumno(gymId: string, username: string): Promise<AuthSession> {
    return this.iniciarSesion(gymId, username, deriveAlumnoPassword(gymId, username));
  }

  private async crearEnSupabase(
    gymId: string,
    username: string,
    password: string,
  ): Promise<AuthUserRef> {
    const email = buildSyntheticEmail(gymId, username);
    const { data, error } = await this.client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw new Error(
        `No se pudo crear el usuario en Supabase Auth: ${error?.message ?? 'sin usuario'}`,
      );
    }

    return { authUserId: data.user.id };
  }

  private async iniciarSesion(
    gymId: string,
    username: string,
    password: string,
  ): Promise<AuthSession> {
    const email = buildSyntheticEmail(gymId, username);
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      throw new Error('Credenciales inválidas');
    }

    return { accessToken: data.session.access_token, refreshToken: data.session.refresh_token };
  }
}
```

- [ ] **Step 6: Actualizar `apps/api/src/identity/infrastructure/auth/supabase-admin-auth.provider.spec.ts`** (los 2 tests existentes de env vars quedan igual — solo agregar 2 tests nuevos de que los métodos existen y delegan a las funciones puras; no se mockea `@supabase/supabase-js` de más, solo se instancia con env vars fake y se confirma que no explota al construirse — la lógica real de cada método ya está cubierta indirectamente por `synthetic-credentials.spec.ts` + el e2e de Task 11)

```typescript
import { SupabaseAdminAuthProvider } from './supabase-admin-auth.provider';

describe('SupabaseAdminAuthProvider', () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  afterEach(() => {
    process.env.SUPABASE_URL = originalUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  it('lanza si falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY', () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => new SupabaseAdminAuthProvider()).toThrow();
  });

  it('se instancia sin error si ambas variables están presentes', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
    expect(() => new SupabaseAdminAuthProvider()).not.toThrow();
  });

  it('expone los 4 métodos del AuthProviderPort', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
    const provider = new SupabaseAdminAuthProvider();
    expect(typeof provider.createStaffUser).toBe('function');
    expect(typeof provider.createAlumnoUser).toBe('function');
    expect(typeof provider.signInStaff).toBe('function');
    expect(typeof provider.signInAlumno).toBe('function');
  });
});
```

- [ ] **Step 7: Agregar `AUTH_DERIVE_SECRET` a `apps/api/.env.example`** (agregar al final, no tocar el resto)

```
# Derivación determinística de la password interna de alumnos (HMAC-SHA256).
# Propia, distinta de SUPABASE_JWT_SECRET. Sin valor real acá.
AUTH_DERIVE_SECRET="tu-secret-propio-para-derivar-passwords-de-alumnos"
```

- [ ] **Step 8: Correr los tests de este task**

Run: `cd apps/api && node_modules/.bin/jest synthetic-credentials supabase-admin-auth.provider`
Expected: `11 passed, 11 total`

---

### Task 5: `CreateUserUseCase` (TDD) — reemplaza `InviteUserUseCase`

**Files:**

- Remove: `apps/api/src/identity/application/invite-user.use-case.ts`
- Remove: `apps/api/src/identity/application/invite-user.use-case.spec.ts`
- Create: `apps/api/src/identity/application/create-user.use-case.ts`
- Test: `apps/api/src/identity/application/create-user.use-case.spec.ts`

**Interfaces:**

- Consumes: `UserRepositoryPort`, `AuthProviderPort` (Task 2/3/4), `RoleHierarchyError`/`DuplicateUsernameError` (Task 2).
- Produces: `CreateUserUseCase`, `CreateUserInput` (`CreateProfesorInput | CreateAlumnoInput`) — consumido por `UsersController` (Task 10).

- [ ] **Step 1: Borrar `invite-user.use-case.ts` e `invite-user.use-case.spec.ts`**

- [ ] **Step 2: Escribir el test `apps/api/src/identity/application/create-user.use-case.spec.ts`**

```typescript
import { Role } from '../domain/role';
import { CreateUserUseCase } from './create-user.use-case';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { AuthProviderPort } from './ports/auth-provider.port';
import { RoleHierarchyError } from './errors/role-hierarchy.error';
import { DuplicateUsernameError } from './errors/duplicate-username.error';

describe('CreateUserUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let authProvider: jest.Mocked<AuthProviderPort>;
  let useCase: CreateUserUseCase;

  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };
  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const alumno = { id: 'alum-1', gymId: 'gym-1', role: Role.ALUMNO };

  beforeEach(() => {
    userRepository = {
      findByAuthUserId: jest.fn(),
      findByGymIdAndUsername: jest.fn(),
      findByGymId: jest.fn(),
      findById: jest.fn(),
      deactivate: jest.fn(),
      create: jest.fn(),
    };
    authProvider = {
      createStaffUser: jest.fn(),
      createAlumnoUser: jest.fn(),
      signInStaff: jest.fn(),
      signInAlumno: jest.fn(),
    };
    useCase = new CreateUserUseCase(userRepository, authProvider);
  });

  describe('jerarquía de quién crea a quién', () => {
    it('ALUMNO no puede crear a nadie', async () => {
      await expect(
        useCase.execute({ role: Role.ALUMNO, nombre: 'X', apellido: 'Y', invocadoPor: alumno }),
      ).rejects.toThrow(RoleHierarchyError);
      expect(authProvider.createAlumnoUser).not.toHaveBeenCalled();
    });

    it('PROFESOR no puede crear otro PROFESOR', async () => {
      await expect(
        useCase.execute({
          role: Role.PROFESOR,
          username: 'nuevo.profe',
          nombre: 'Nuevo',
          password: 'password123',
          invocadoPor: profesor,
        }),
      ).rejects.toThrow(RoleHierarchyError);
      expect(authProvider.createStaffUser).not.toHaveBeenCalled();
    });

    it('PROFESOR sí puede crear ALUMNO', async () => {
      userRepository.findByGymIdAndUsername.mockResolvedValue(null);
      authProvider.createAlumnoUser.mockResolvedValue({ authUserId: 'auth-x' });
      userRepository.create.mockResolvedValue({
        id: 'u1',
        authUserId: 'auth-x',
        gymId: 'gym-1',
        username: 'juan.perez',
        nombre: 'Juan Perez',
        role: Role.ALUMNO,
        activo: true,
      });

      await expect(
        useCase.execute({
          role: Role.ALUMNO,
          nombre: 'Juan',
          apellido: 'Perez',
          invocadoPor: profesor,
        }),
      ).resolves.toBeDefined();
    });

    it('ADMIN puede crear PROFESOR', async () => {
      userRepository.findByGymIdAndUsername.mockResolvedValue(null);
      authProvider.createStaffUser.mockResolvedValue({ authUserId: 'auth-p' });
      userRepository.create.mockResolvedValue({
        id: 'u2',
        authUserId: 'auth-p',
        gymId: 'gym-1',
        username: 'nuevo.profe',
        nombre: 'Nuevo',
        role: Role.PROFESOR,
        activo: true,
      });

      await expect(
        useCase.execute({
          role: Role.PROFESOR,
          username: 'nuevo.profe',
          nombre: 'Nuevo',
          password: 'password123',
          invocadoPor: admin,
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('alta de PROFESOR', () => {
    it('rechaza si el username ya existe en el gym', async () => {
      userRepository.findByGymIdAndUsername.mockResolvedValue({
        id: 'existing',
        authUserId: 'a',
        gymId: 'gym-1',
        username: 'nuevo.profe',
        nombre: 'X',
        role: Role.PROFESOR,
        activo: true,
      });

      await expect(
        useCase.execute({
          role: Role.PROFESOR,
          username: 'nuevo.profe',
          nombre: 'Nuevo',
          password: 'password123',
          invocadoPor: admin,
        }),
      ).rejects.toThrow(DuplicateUsernameError);
      expect(authProvider.createStaffUser).not.toHaveBeenCalled();
    });

    it('crea con la password real recibida, tal cual', async () => {
      userRepository.findByGymIdAndUsername.mockResolvedValue(null);
      authProvider.createStaffUser.mockResolvedValue({ authUserId: 'auth-p' });
      userRepository.create.mockResolvedValue({
        id: 'u2',
        authUserId: 'auth-p',
        gymId: 'gym-1',
        username: 'nuevo.profe',
        nombre: 'Nuevo',
        role: Role.PROFESOR,
        activo: true,
      });

      await useCase.execute({
        role: Role.PROFESOR,
        username: 'nuevo.profe',
        nombre: 'Nuevo',
        password: 'password123',
        invocadoPor: admin,
      });

      expect(authProvider.createStaffUser).toHaveBeenCalledWith(
        'gym-1',
        'nuevo.profe',
        'password123',
      );
      expect(userRepository.create).toHaveBeenCalledWith({
        gymId: 'gym-1',
        authUserId: 'auth-p',
        username: 'nuevo.profe',
        nombre: 'Nuevo',
        role: Role.PROFESOR,
      });
    });
  });

  describe('alta de ALUMNO', () => {
    it('genera el username como nombre.apellido en minúsculas, sin password/username como input', async () => {
      userRepository.findByGymIdAndUsername.mockResolvedValue(null);
      authProvider.createAlumnoUser.mockResolvedValue({ authUserId: 'auth-a' });
      userRepository.create.mockResolvedValue({
        id: 'u3',
        authUserId: 'auth-a',
        gymId: 'gym-1',
        username: 'juan.perez',
        nombre: 'Juan Perez',
        role: Role.ALUMNO,
        activo: true,
      });

      const resultado = await useCase.execute({
        role: Role.ALUMNO,
        nombre: 'Juan',
        apellido: 'Perez',
        invocadoPor: admin,
      });

      expect(userRepository.findByGymIdAndUsername).toHaveBeenCalledWith('gym-1', 'juan.perez');
      expect(authProvider.createAlumnoUser).toHaveBeenCalledWith('gym-1', 'juan.perez');
      expect(resultado.username).toBe('juan.perez');
    });

    it('normaliza acentos y mayúsculas (José Pérez -> jose.perez)', async () => {
      userRepository.findByGymIdAndUsername.mockResolvedValue(null);
      authProvider.createAlumnoUser.mockResolvedValue({ authUserId: 'auth-b' });
      userRepository.create.mockImplementation(async (data) => ({
        ...data,
        id: 'u4',
        activo: true,
      }));

      const resultado = await useCase.execute({
        role: Role.ALUMNO,
        nombre: 'José',
        apellido: 'Pérez',
        invocadoPor: admin,
      });

      expect(resultado.username).toBe('jose.perez');
    });

    it('agrega sufijo numérico incremental si el username base ya existe (juan.perez -> juan.perez2)', async () => {
      userRepository.findByGymIdAndUsername.mockImplementation(async (_gymId, username) =>
        username === 'juan.perez'
          ? {
              id: 'otro',
              authUserId: 'auth-otro',
              gymId: 'gym-1',
              username: 'juan.perez',
              nombre: 'Otro Juan',
              role: Role.ALUMNO,
              activo: true,
            }
          : null,
      );
      authProvider.createAlumnoUser.mockResolvedValue({ authUserId: 'auth-c' });
      userRepository.create.mockImplementation(async (data) => ({
        ...data,
        id: 'u5',
        activo: true,
      }));

      const resultado = await useCase.execute({
        role: Role.ALUMNO,
        nombre: 'Juan',
        apellido: 'Perez',
        invocadoPor: admin,
      });

      expect(resultado.username).toBe('juan.perez2');
      expect(authProvider.createAlumnoUser).toHaveBeenCalledWith('gym-1', 'juan.perez2');
    });

    it('devuelve el username generado en el resultado (para que el creador se lo comunique al alumno)', async () => {
      userRepository.findByGymIdAndUsername.mockResolvedValue(null);
      authProvider.createAlumnoUser.mockResolvedValue({ authUserId: 'auth-d' });
      userRepository.create.mockImplementation(async (data) => ({
        ...data,
        id: 'u6',
        activo: true,
      }));

      const resultado = await useCase.execute({
        role: Role.ALUMNO,
        nombre: 'Ana',
        apellido: 'Gomez',
        invocadoPor: admin,
      });

      expect(resultado.username).toBe('ana.gomez');
    });
  });
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `cd apps/api && node_modules/.bin/jest create-user.use-case`
Expected: FAIL — `Cannot find module './create-user.use-case'`

- [ ] **Step 4: `apps/api/src/identity/application/create-user.use-case.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../domain/role';
import { AuthenticatedUser } from '../domain/authenticated-user';
import { USER_REPOSITORY, UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { AUTH_PROVIDER, AuthProviderPort } from './ports/auth-provider.port';
import { RoleHierarchyError } from './errors/role-hierarchy.error';
import { DuplicateUsernameError } from './errors/duplicate-username.error';

export interface CreateProfesorInput {
  role: Role.PROFESOR;
  username: string;
  nombre: string;
  password: string;
  invocadoPor: AuthenticatedUser;
}

export interface CreateAlumnoInput {
  role: Role.ALUMNO;
  nombre: string;
  apellido: string;
  invocadoPor: AuthenticatedUser;
}

export type CreateUserInput = CreateProfesorInput | CreateAlumnoInput;

const ROLES_QUE_PUEDE_CREAR: Record<Role, Role[]> = {
  [Role.ADMIN]: [Role.PROFESOR, Role.ALUMNO],
  [Role.PROFESOR]: [Role.ALUMNO],
  [Role.ALUMNO]: [],
};

const MAX_INTENTOS_USERNAME = 1000;

/**
 * Alta manual de PROFESOR o ALUMNO — nunca ADMIN (no es una capacidad de
 * esta app). ADMIN puede crear PROFESOR o ALUMNO; PROFESOR solo ALUMNO.
 * Esta jerarquía se valida ACÁ, no solo vía `@Roles()` del endpoint (un
 * guard de rol solo valida "quién soy", no "a quién puedo crear").
 */
@Injectable()
export class CreateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProviderPort,
  ) {}

  async execute(input: CreateUserInput): Promise<UserRecord> {
    const rolesPermitidos = ROLES_QUE_PUEDE_CREAR[input.invocadoPor.role];
    if (!rolesPermitidos.includes(input.role)) {
      throw new RoleHierarchyError(input.invocadoPor.role, input.role);
    }

    const gymId = input.invocadoPor.gymId;

    if (input.role === Role.PROFESOR) {
      return this.crearProfesor(gymId, input);
    }
    return this.crearAlumno(gymId, input);
  }

  private async crearProfesor(gymId: string, input: CreateProfesorInput): Promise<UserRecord> {
    const existente = await this.userRepository.findByGymIdAndUsername(gymId, input.username);
    if (existente) {
      throw new DuplicateUsernameError(input.username, gymId);
    }

    const { authUserId } = await this.authProvider.createStaffUser(
      gymId,
      input.username,
      input.password,
    );

    return this.userRepository.create({
      gymId,
      authUserId,
      username: input.username,
      nombre: input.nombre,
      role: Role.PROFESOR,
    });
  }

  private async crearAlumno(gymId: string, input: CreateAlumnoInput): Promise<UserRecord> {
    const username = await this.generarUsernameDisponible(gymId, input.nombre, input.apellido);

    const { authUserId } = await this.authProvider.createAlumnoUser(gymId, username);

    return this.userRepository.create({
      gymId,
      authUserId,
      username,
      nombre: `${input.nombre} ${input.apellido}`,
      role: Role.ALUMNO,
    });
  }

  private async generarUsernameDisponible(
    gymId: string,
    nombre: string,
    apellido: string,
  ): Promise<string> {
    const base = `${this.normalizar(nombre)}.${this.normalizar(apellido)}`;

    for (let intento = 0; intento < MAX_INTENTOS_USERNAME; intento += 1) {
      const candidato = intento === 0 ? base : `${base}${intento + 1}`;
      const existente = await this.userRepository.findByGymIdAndUsername(gymId, candidato);
      if (!existente) {
        return candidato;
      }
    }

    throw new Error(
      `No se pudo generar un username disponible a partir de '${base}' tras ${MAX_INTENTOS_USERNAME} intentos`,
    );
  }

  private normalizar(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd apps/api && node_modules/.bin/jest create-user.use-case`
Expected: `11 passed, 11 total`

---

### Task 6: `LoginUseCase` (TDD)

**Files:**

- Create: `apps/api/src/identity/application/login.use-case.ts`
- Test: `apps/api/src/identity/application/login.use-case.spec.ts`

**Interfaces:**

- Consumes: `AuthProviderPort` (Task 2/4), `InvalidCredentialsError` (Task 2).
- Produces: `LoginUseCase` — consumido por `AuthController` (Task 10).

- [ ] **Step 1: Escribir el test `apps/api/src/identity/application/login.use-case.spec.ts`**

```typescript
import { LoginUseCase } from './login.use-case';
import { AuthProviderPort } from './ports/auth-provider.port';
import { InvalidCredentialsError } from './errors/invalid-credentials.error';

describe('LoginUseCase', () => {
  let authProvider: jest.Mocked<AuthProviderPort>;
  let useCase: LoginUseCase;

  beforeEach(() => {
    authProvider = {
      createStaffUser: jest.fn(),
      createAlumnoUser: jest.fn(),
      signInStaff: jest.fn(),
      signInAlumno: jest.fn(),
    };
    useCase = new LoginUseCase(authProvider);
  });

  it('con password: usa signInStaff, no signInAlumno', async () => {
    authProvider.signInStaff.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });

    const resultado = await useCase.execute({
      gymId: 'gym-1',
      username: 'admin1',
      password: 'secreto',
    });

    expect(authProvider.signInStaff).toHaveBeenCalledWith('gym-1', 'admin1', 'secreto');
    expect(authProvider.signInAlumno).not.toHaveBeenCalled();
    expect(resultado).toEqual({ accessToken: 'a', refreshToken: 'r' });
  });

  it('sin password: usa signInAlumno, no signInStaff', async () => {
    authProvider.signInAlumno.mockResolvedValue({ accessToken: 'a2', refreshToken: 'r2' });

    const resultado = await useCase.execute({ gymId: 'gym-1', username: 'juan.perez' });

    expect(authProvider.signInAlumno).toHaveBeenCalledWith('gym-1', 'juan.perez');
    expect(authProvider.signInStaff).not.toHaveBeenCalled();
    expect(resultado).toEqual({ accessToken: 'a2', refreshToken: 'r2' });
  });

  it('cualquier falla del provider se traduce a InvalidCredentialsError genérico (con password)', async () => {
    authProvider.signInStaff.mockRejectedValue(new Error('detalle interno de Supabase'));

    await expect(
      useCase.execute({ gymId: 'gym-1', username: 'admin1', password: 'mal' }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('cualquier falla del provider se traduce a InvalidCredentialsError genérico (sin password)', async () => {
    authProvider.signInAlumno.mockRejectedValue(new Error('detalle interno de Supabase'));

    await expect(useCase.execute({ gymId: 'gym-1', username: 'no.existe' })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('el mensaje de error no revela si el username existe o no', async () => {
    authProvider.signInAlumno.mockRejectedValue(new Error('User not found'));

    await expect(useCase.execute({ gymId: 'gym-1', username: 'no.existe' })).rejects.toThrow(
      'Usuario o contraseña incorrectos.',
    );
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/api && node_modules/.bin/jest login.use-case`
Expected: FAIL — `Cannot find module './login.use-case'`

- [ ] **Step 3: `apps/api/src/identity/application/login.use-case.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { AUTH_PROVIDER, AuthProviderPort, AuthSession } from './ports/auth-provider.port';
import { InvalidCredentialsError } from './errors/invalid-credentials.error';

export interface LoginInput {
  gymId: string;
  username: string;
  password?: string;
}

/**
 * Ramificado por presencia de `password`: si viene, es un intento de
 * ADMIN/PROFESOR; si no, de ALUMNO (password derivada, resuelta
 * internamente por el AuthProviderPort). No hace falta un lookup previo
 * de a qué rol pertenece el username — la rama equivocada simplemente
 * falla igual que una password mal tipeada (evita enumeración). El error
 * siempre es genérico, nunca revela si el username existe.
 */
@Injectable()
export class LoginUseCase {
  constructor(@Inject(AUTH_PROVIDER) private readonly authProvider: AuthProviderPort) {}

  async execute(input: LoginInput): Promise<AuthSession> {
    try {
      if (input.password !== undefined) {
        return await this.authProvider.signInStaff(input.gymId, input.username, input.password);
      }
      return await this.authProvider.signInAlumno(input.gymId, input.username);
    } catch {
      throw new InvalidCredentialsError();
    }
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/api && node_modules/.bin/jest login.use-case`
Expected: `5 passed, 5 total`

---

### Task 7: `ListUsersUseCase` (TDD, username-based)

**Files:**

- Create: `apps/api/src/identity/application/list-users.use-case.ts`
- Test: `apps/api/src/identity/application/list-users.use-case.spec.ts`

**Interfaces:**

- Consumes: `UserRepositoryPort.findByGymId` (Task 2/3), `RoleHierarchyError`... **no** — usa un chequeo de rol propio, no `RoleHierarchyError` (ese es específico de "quién crea a quién"). Para listar/desactivar, reusar el patrón simple de Fase 1: si el rol no alcanza, un error de "rol insuficiente" genérico. Como `InsufficientRoleError` de Fase 1 ya no existe en este plan (fue específico del flujo de invitación y no se recreó), este task define su propio chequeo con un error nuevo compartido por `ListUsersUseCase` y `DeactivateUserUseCase`.

**Nota de diseño:** se introduce `InsufficientRoleError` (parametrizado por roles requeridos, igual que se había diseñado para la parte 2 original) para estos 2 casos de uso — es un error distinto de `RoleHierarchyError` (que es específico de la regla "quién puede crear a quién", con su propio mensaje). Agregar `apps/api/src/identity/application/errors/insufficient-role.error.ts` como parte del Step 1 de este task (no existía en el plan de username porque `CreateUserUseCase` usa `RoleHierarchyError`).

- [ ] **Step 1: `apps/api/src/identity/application/errors/insufficient-role.error.ts`**

```typescript
export class InsufficientRoleError extends Error {
  constructor(rolActual: string, rolesRequeridos: string[]) {
    super(
      `El rol '${rolActual}' no está autorizado. Se requiere uno de: ${rolesRequeridos.join(', ')}.`,
    );
    this.name = 'InsufficientRoleError';
  }
}
```

- [ ] **Step 2: Escribir el test `apps/api/src/identity/application/list-users.use-case.spec.ts`**

```typescript
import { Role } from '../domain/role';
import { ListUsersUseCase } from './list-users.use-case';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { InsufficientRoleError } from './errors/insufficient-role.error';

describe('ListUsersUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let useCase: ListUsersUseCase;

  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };
  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };

  const usuariosDelGym: UserRecord[] = [
    {
      id: 'u1',
      authUserId: 'a1',
      gymId: 'gym-1',
      username: 'prof1',
      nombre: 'A',
      role: Role.PROFESOR,
      activo: true,
    },
    {
      id: 'u2',
      authUserId: 'a2',
      gymId: 'gym-1',
      username: 'juan.perez',
      nombre: 'B',
      role: Role.ALUMNO,
      activo: true,
    },
  ];

  beforeEach(() => {
    userRepository = {
      findByAuthUserId: jest.fn(),
      findByGymIdAndUsername: jest.fn(),
      findByGymId: jest.fn(),
      findById: jest.fn(),
      deactivate: jest.fn(),
      create: jest.fn(),
    };
    useCase = new ListUsersUseCase(userRepository);
  });

  it('rechaza si quien invoca no es ADMIN', async () => {
    await expect(useCase.execute({ invocadoPor: profesor })).rejects.toThrow(InsufficientRoleError);
    expect(userRepository.findByGymId).not.toHaveBeenCalled();
  });

  it('ADMIN lista los usuarios de SU gym, sin filtro de rol', async () => {
    userRepository.findByGymId.mockResolvedValue(usuariosDelGym);

    const resultado = await useCase.execute({ invocadoPor: admin });

    expect(userRepository.findByGymId).toHaveBeenCalledWith('gym-1', undefined);
    expect(resultado).toEqual(usuariosDelGym);
  });

  it('ADMIN puede filtrar por rol', async () => {
    userRepository.findByGymId.mockResolvedValue([usuariosDelGym[1]]);

    const resultado = await useCase.execute({ invocadoPor: admin, role: Role.ALUMNO });

    expect(userRepository.findByGymId).toHaveBeenCalledWith('gym-1', Role.ALUMNO);
    expect(resultado).toEqual([usuariosDelGym[1]]);
  });
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `cd apps/api && node_modules/.bin/jest list-users.use-case`
Expected: FAIL — `Cannot find module './list-users.use-case'`

- [ ] **Step 4: `apps/api/src/identity/application/list-users.use-case.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../domain/role';
import { AuthenticatedUser } from '../domain/authenticated-user';
import { USER_REPOSITORY, UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { InsufficientRoleError } from './errors/insufficient-role.error';

export interface ListUsersInput {
  invocadoPor: AuthenticatedUser;
  role?: Role;
}

const ROLES_QUE_PUEDEN_LISTAR: Role[] = [Role.ADMIN];

/**
 * Lista los usuarios del gym de quien invoca (el gymId sale siempre de
 * `invocadoPor`, nunca de un parámetro del cliente). Solo ADMIN.
 */
@Injectable()
export class ListUsersUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort) {}

  async execute(input: ListUsersInput): Promise<UserRecord[]> {
    if (!ROLES_QUE_PUEDEN_LISTAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_LISTAR);
    }
    return this.userRepository.findByGymId(input.invocadoPor.gymId, input.role);
  }
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd apps/api && node_modules/.bin/jest list-users.use-case`
Expected: `3 passed, 3 total`

---

### Task 8: `DeactivateUserUseCase` (TDD)

**Files:**

- Create: `apps/api/src/identity/application/deactivate-user.use-case.ts`
- Test: `apps/api/src/identity/application/deactivate-user.use-case.spec.ts`

**Interfaces:**

- Consumes: `UserRepositoryPort.findById`/`.deactivate` (Task 2/3), `InsufficientRoleError` (Task 7), `UserNotFoundError` (nuevo en este task).
- Produces: `DeactivateUserUseCase` — consumido por `UsersController` (Task 10).

**Nota:** el scoping por gym NO puede hacerlo `GymScopeGuard` acá (la ruta es `PATCH /users/:id/deactivate`, sin `gymId` en la URL) — el caso de uso verifica que el usuario objetivo pertenezca al gym de quien invoca, devolviendo `UserNotFoundError` (no `ForbiddenException`) si no, para no revelar que el id existe en otro gym.

- [ ] **Step 1: `apps/api/src/identity/application/errors/user-not-found.error.ts`**

```typescript
export class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`No existe un usuario con id '${userId}' en tu gym.`);
    this.name = 'UserNotFoundError';
  }
}
```

- [ ] **Step 2: Escribir el test `apps/api/src/identity/application/deactivate-user.use-case.spec.ts`**

```typescript
import { Role } from '../domain/role';
import { DeactivateUserUseCase } from './deactivate-user.use-case';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { InsufficientRoleError } from './errors/insufficient-role.error';
import { UserNotFoundError } from './errors/user-not-found.error';

describe('DeactivateUserUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let useCase: DeactivateUserUseCase;

  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };
  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };

  const usuarioObjetivo: UserRecord = {
    id: 'target-1',
    authUserId: 'auth-target',
    gymId: 'gym-1',
    username: 'juan.perez',
    nombre: 'Juan Perez',
    role: Role.ALUMNO,
    activo: true,
  };

  beforeEach(() => {
    userRepository = {
      findByAuthUserId: jest.fn(),
      findByGymIdAndUsername: jest.fn(),
      findByGymId: jest.fn(),
      findById: jest.fn(),
      deactivate: jest.fn(),
      create: jest.fn(),
    };
    useCase = new DeactivateUserUseCase(userRepository);
  });

  it('rechaza si quien invoca no es ADMIN', async () => {
    await expect(useCase.execute({ invocadoPor: profesor, userId: 'target-1' })).rejects.toThrow(
      InsufficientRoleError,
    );
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it('rechaza con UserNotFoundError si el usuario no existe', async () => {
    userRepository.findById.mockResolvedValue(null);
    await expect(useCase.execute({ invocadoPor: admin, userId: 'no-existe' })).rejects.toThrow(
      UserNotFoundError,
    );
    expect(userRepository.deactivate).not.toHaveBeenCalled();
  });

  it('rechaza con UserNotFoundError si el usuario existe pero es de otro gym', async () => {
    userRepository.findById.mockResolvedValue({ ...usuarioObjetivo, gymId: 'gym-OTRO' });
    await expect(useCase.execute({ invocadoPor: admin, userId: 'target-1' })).rejects.toThrow(
      UserNotFoundError,
    );
    expect(userRepository.deactivate).not.toHaveBeenCalled();
  });

  it('ADMIN desactiva un usuario de su propio gym (baja lógica, no delete)', async () => {
    userRepository.findById.mockResolvedValue(usuarioObjetivo);
    userRepository.deactivate.mockResolvedValue({ ...usuarioObjetivo, activo: false });

    const resultado = await useCase.execute({ invocadoPor: admin, userId: 'target-1' });

    expect(userRepository.deactivate).toHaveBeenCalledWith('target-1');
    expect(resultado.activo).toBe(false);
  });
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `cd apps/api && node_modules/.bin/jest deactivate-user.use-case`
Expected: FAIL — `Cannot find module './deactivate-user.use-case'`

- [ ] **Step 4: `apps/api/src/identity/application/deactivate-user.use-case.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../domain/role';
import { AuthenticatedUser } from '../domain/authenticated-user';
import { USER_REPOSITORY, UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { InsufficientRoleError } from './errors/insufficient-role.error';
import { UserNotFoundError } from './errors/user-not-found.error';

export interface DeactivateUserInput {
  invocadoPor: AuthenticatedUser;
  userId: string;
}

const ROLES_QUE_PUEDEN_DESACTIVAR: Role[] = [Role.ADMIN];

/**
 * Baja lógica (`activo: false`, PRD regla 5) — nunca DELETE físico. Solo
 * ADMIN, y solo sobre usuarios de su propio gym: si el id es de otro gym
 * se responde igual que "no existe".
 */
@Injectable()
export class DeactivateUserUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort) {}

  async execute(input: DeactivateUserInput): Promise<UserRecord> {
    if (!ROLES_QUE_PUEDEN_DESACTIVAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_DESACTIVAR);
    }

    const objetivo = await this.userRepository.findById(input.userId);
    if (!objetivo || objetivo.gymId !== input.invocadoPor.gymId) {
      throw new UserNotFoundError(input.userId);
    }

    return this.userRepository.deactivate(input.userId);
  }
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd apps/api && node_modules/.bin/jest deactivate-user.use-case`
Expected: `4 passed, 4 total`

---

### Task 9: `LoginRateLimitGuard` (TDD)

**Files:**

- Create: `apps/api/src/identity/infrastructure/guards/login-rate-limit.guard.ts`
- Test: `apps/api/src/identity/infrastructure/guards/login-rate-limit.guard.spec.ts`

**Interfaces:**

- Produces: `LoginRateLimitGuard` — aplicado con `@UseGuards()` a nivel de método en `AuthController.login` (Task 10), NO como `APP_GUARD` global.

- [ ] **Step 1: Escribir el test `apps/api/src/identity/infrastructure/guards/login-rate-limit.guard.spec.ts`**

```typescript
import { ExecutionContext, HttpException } from '@nestjs/common';
import { LoginRateLimitGuard } from './login-rate-limit.guard';

function buildContext(ip: string, username: string): ExecutionContext {
  const request = { ip, body: { username } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('LoginRateLimitGuard', () => {
  let guard: LoginRateLimitGuard;

  beforeEach(() => {
    guard = new LoginRateLimitGuard();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('permite hasta 5 intentos para el mismo ip+username', () => {
    for (let i = 0; i < 5; i += 1) {
      expect(guard.canActivate(buildContext('1.2.3.4', 'juan.perez'))).toBe(true);
    }
  });

  it('rechaza el 6to intento para el mismo ip+username dentro de la ventana', () => {
    for (let i = 0; i < 5; i += 1) {
      guard.canActivate(buildContext('1.2.3.4', 'juan.perez'));
    }
    expect(() => guard.canActivate(buildContext('1.2.3.4', 'juan.perez'))).toThrow(HttpException);
  });

  it('no bloquea un username distinto desde la misma ip', () => {
    for (let i = 0; i < 5; i += 1) {
      guard.canActivate(buildContext('1.2.3.4', 'juan.perez'));
    }
    expect(guard.canActivate(buildContext('1.2.3.4', 'otro.usuario'))).toBe(true);
  });

  it('no bloquea el mismo username desde una ip distinta', () => {
    for (let i = 0; i < 5; i += 1) {
      guard.canActivate(buildContext('1.2.3.4', 'juan.perez'));
    }
    expect(guard.canActivate(buildContext('5.6.7.8', 'juan.perez'))).toBe(true);
  });

  it('resetea el contador pasada la ventana de tiempo', () => {
    for (let i = 0; i < 5; i += 1) {
      guard.canActivate(buildContext('1.2.3.4', 'juan.perez'));
    }
    jest.advanceTimersByTime(15 * 60 * 1000 + 1);
    expect(guard.canActivate(buildContext('1.2.3.4', 'juan.perez'))).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/api && node_modules/.bin/jest login-rate-limit.guard`
Expected: FAIL — `Cannot find module './login-rate-limit.guard'`

- [ ] **Step 3: `apps/api/src/identity/infrastructure/guards/login-rate-limit.guard.ts`**

```typescript
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

interface Intento {
  cantidad: number;
  desde: number;
}

const VENTANA_MS = 15 * 60 * 1000;
const MAX_INTENTOS = 5;

/**
 * Rate limit mínimo para /auth/login, por IP + username combinados.
 * Ventana deslizante simple en memoria — no sobrevive un restart ni
 * funciona entre múltiples instancias; suficiente para el MVP de un solo
 * proceso. El username del alumno es su único secreto (riesgo aceptado y
 * documentado en el PRD) — esto es la mitigación mínima contra fuerza bruta.
 */
@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly intentos = new Map<string, Intento>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const username =
      (request.body as { username?: string } | undefined)?.username ?? 'sin-username';
    const clave = `${request.ip}:${username}`;
    const ahora = Date.now();

    const registro = this.intentos.get(clave);
    if (!registro || ahora - registro.desde > VENTANA_MS) {
      this.intentos.set(clave, { cantidad: 1, desde: ahora });
      return true;
    }

    if (registro.cantidad >= MAX_INTENTOS) {
      throw new HttpException(
        'Demasiados intentos. Probá de nuevo más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    registro.cantidad += 1;
    return true;
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/api && node_modules/.bin/jest login-rate-limit.guard`
Expected: `5 passed, 5 total`

---

### Task 10: Controllers (`UsersController`, `AuthController`) + exception filter + wiring

**Files:**

- Create: `apps/api/src/identity/infrastructure/http/dto/create-profesor.dto.ts`
- Create: `apps/api/src/identity/infrastructure/http/dto/create-alumno.dto.ts`
- Create: `apps/api/src/identity/infrastructure/http/dto/login.dto.ts`
- Create: `apps/api/src/identity/infrastructure/http/users.controller.ts`
- Create: `apps/api/src/identity/infrastructure/http/auth.controller.ts`
- Create: `apps/api/src/identity/infrastructure/filters/domain-exception.filter.ts`
- Test: `apps/api/src/identity/infrastructure/filters/domain-exception.filter.spec.ts`
- Modify: `apps/api/src/identity/identity.module.ts`
- Modify: `apps/api/src/main.ts`

**Interfaces:**

- Consumes: `CreateUserUseCase` (Task 5), `LoginUseCase` (Task 6), `ListUsersUseCase` (Task 7), `DeactivateUserUseCase` (Task 8), `LoginRateLimitGuard` (Task 9), todos los errores de dominio (Tasks 2/7/8).
- Produces: rutas `POST /users/profesor`, `POST /users/alumno`, `GET /users`, `PATCH /users/:id/deactivate`, `POST /auth/login`.

- [ ] **Step 1: `apps/api/src/identity/infrastructure/http/dto/create-profesor.dto.ts`**

```typescript
import { IsString, Matches, MinLength } from 'class-validator';

export class CreateProfesorDto {
  // Charset restringido a propósito: `synthetic-credentials.ts` arma el
  // email sintético y el input del HMAC concatenando gymId+username con
  // `@`/`+`/`:` como separadores — un username que contenga esos
  // caracteres podría romper esa estructura o, en el caso de `:`, generar
  // ambigüedad en el input del HMAC. Los usernames autogenerados de
  // alumno ya cumplen esto por construcción; este es el único punto de
  // entrada donde el username lo escribe un cliente.
  @IsString()
  @MinLength(3)
  @Matches(/^[a-z0-9._-]+$/, {
    message: 'username solo puede tener minúsculas, números, puntos, guiones y guiones bajos',
  })
  username!: string;

  @IsString()
  @MinLength(2)
  nombre!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
```

- [ ] **Step 2: `apps/api/src/identity/infrastructure/http/dto/create-alumno.dto.ts`**

```typescript
import { IsString, MinLength } from 'class-validator';

export class CreateAlumnoDto {
  @IsString()
  @MinLength(2)
  nombre!: string;

  @IsString()
  @MinLength(2)
  apellido!: string;
}
```

- [ ] **Step 3: `apps/api/src/identity/infrastructure/http/dto/login.dto.ts`**

```typescript
import { IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  gymId!: string;

  @IsString()
  username!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  password?: string;
}
```

- [ ] **Step 4: `apps/api/src/identity/infrastructure/http/users.controller.ts`**

```typescript
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../../domain/role';
import { AuthenticatedUser } from '../../domain/authenticated-user';
import { CreateUserUseCase } from '../../application/create-user.use-case';
import { ListUsersUseCase } from '../../application/list-users.use-case';
import { DeactivateUserUseCase } from '../../application/deactivate-user.use-case';
import { CreateProfesorDto } from './dto/create-profesor.dto';
import { CreateAlumnoDto } from './dto/create-alumno.dto';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@Controller('users')
export class UsersController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly listUsersUseCase: ListUsersUseCase,
    private readonly deactivateUserUseCase: DeactivateUserUseCase,
  ) {}

  @Post('profesor')
  @Roles(Role.ADMIN)
  createProfesor(@Body() dto: CreateProfesorDto, @Req() req: RequestWithUser) {
    return this.createUserUseCase.execute({
      role: Role.PROFESOR,
      username: dto.username,
      nombre: dto.nombre,
      password: dto.password,
      invocadoPor: req.user,
    });
  }

  @Post('alumno')
  @Roles(Role.ADMIN, Role.PROFESOR)
  createAlumno(@Body() dto: CreateAlumnoDto, @Req() req: RequestWithUser) {
    return this.createUserUseCase.execute({
      role: Role.ALUMNO,
      nombre: dto.nombre,
      apellido: dto.apellido,
      invocadoPor: req.user,
    });
  }

  @Get()
  @Roles(Role.ADMIN)
  list(@Query('role') role: string | undefined, @Req() req: RequestWithUser) {
    return this.listUsersUseCase.execute({
      invocadoPor: req.user,
      role: this.parsearRoleFiltro(role),
    });
  }

  @Patch(':id/deactivate')
  @Roles(Role.ADMIN)
  deactivate(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.deactivateUserUseCase.execute({ invocadoPor: req.user, userId: id });
  }

  private parsearRoleFiltro(role: string | undefined): Role | undefined {
    if (role === undefined) return undefined;
    if (!Object.values(Role).includes(role as Role)) {
      throw new BadRequestException(`role debe ser uno de: ${Object.values(Role).join(', ')}`);
    }
    return role as Role;
  }
}
```

- [ ] **Step 5: `apps/api/src/identity/infrastructure/http/auth.controller.ts`**

```typescript
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { LoginUseCase } from '../../application/login.use-case';
import { LoginDto } from './dto/login.dto';
import { LoginRateLimitGuard } from '../guards/login-rate-limit.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly loginUseCase: LoginUseCase) {}

  @Post('login')
  @Public()
  @UseGuards(LoginRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.loginUseCase.execute(dto);
  }
}
```

- [ ] **Step 6: `apps/api/src/identity/infrastructure/filters/domain-exception.filter.ts`**

```typescript
import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { DuplicateUsernameError } from '../../application/errors/duplicate-username.error';
import { RoleHierarchyError } from '../../application/errors/role-hierarchy.error';
import { InvalidCredentialsError } from '../../application/errors/invalid-credentials.error';
import { InsufficientRoleError } from '../../application/errors/insufficient-role.error';
import { UserNotFoundError } from '../../application/errors/user-not-found.error';

const STATUS_POR_ERROR = new Map<Function, HttpStatus>([
  [DuplicateUsernameError, HttpStatus.CONFLICT],
  [RoleHierarchyError, HttpStatus.FORBIDDEN],
  [InsufficientRoleError, HttpStatus.FORBIDDEN],
  [InvalidCredentialsError, HttpStatus.UNAUTHORIZED],
  [UserNotFoundError, HttpStatus.NOT_FOUND],
]);

/**
 * Traduce errores de dominio de `identity` a HTTP status en el borde de la
 * app — los casos de uso y los controllers no conocen códigos HTTP. Nunca
 * deja pasar un stack trace crudo: si el tipo de error no está mapeado
 * acá, no lo captura (el exception filter default de Nest lo maneja).
 */
@Catch(
  DuplicateUsernameError,
  RoleHierarchyError,
  InsufficientRoleError,
  InvalidCredentialsError,
  UserNotFoundError,
)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: Error, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_POR_ERROR.get(exception.constructor) ?? HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      statusCode: status,
      error: exception.name,
      message: exception.message,
    });
  }
}
```

- [ ] **Step 7: `apps/api/src/identity/infrastructure/filters/domain-exception.filter.spec.ts`**

```typescript
import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { DomainExceptionFilter } from './domain-exception.filter';
import { DuplicateUsernameError } from '../../application/errors/duplicate-username.error';
import { RoleHierarchyError } from '../../application/errors/role-hierarchy.error';
import { InvalidCredentialsError } from '../../application/errors/invalid-credentials.error';
import { InsufficientRoleError } from '../../application/errors/insufficient-role.error';
import { UserNotFoundError } from '../../application/errors/user-not-found.error';

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

  it.each([
    [
      new DuplicateUsernameError('juan.perez', 'gym-1'),
      HttpStatus.CONFLICT,
      'DuplicateUsernameError',
    ],
    [new RoleHierarchyError('PROFESOR', 'PROFESOR'), HttpStatus.FORBIDDEN, 'RoleHierarchyError'],
    [
      new InsufficientRoleError('PROFESOR', ['ADMIN']),
      HttpStatus.FORBIDDEN,
      'InsufficientRoleError',
    ],
    [new InvalidCredentialsError(), HttpStatus.UNAUTHORIZED, 'InvalidCredentialsError'],
    [new UserNotFoundError('user-x'), HttpStatus.NOT_FOUND, 'UserNotFoundError'],
  ])('mapea %p al status %i', (error, statusEsperado, nombreEsperado) => {
    const { host, status, json } = buildHost();

    filter.catch(error as Error, host);

    expect(status).toHaveBeenCalledWith(statusEsperado);
    expect(json).toHaveBeenCalledWith({
      statusCode: statusEsperado,
      error: nombreEsperado,
      message: (error as Error).message,
    });
  });
});
```

- [ ] **Step 8: Reescribir `apps/api/src/identity/identity.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { USER_REPOSITORY } from './application/ports/user-repository.port';
import { AUTH_PROVIDER } from './application/ports/auth-provider.port';
import { CreateUserUseCase } from './application/create-user.use-case';
import { LoginUseCase } from './application/login.use-case';
import { ListUsersUseCase } from './application/list-users.use-case';
import { DeactivateUserUseCase } from './application/deactivate-user.use-case';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { SupabaseAdminAuthProvider } from './infrastructure/auth/supabase-admin-auth.provider';
import { UsersController } from './infrastructure/http/users.controller';
import { AuthController } from './infrastructure/http/auth.controller';
import { JwtAuthGuard } from './infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from './infrastructure/guards/roles.guard';
import { GymScopeGuard } from './infrastructure/guards/gym-scope.guard';
import { LoginRateLimitGuard } from './infrastructure/guards/login-rate-limit.guard';

@Module({
  imports: [],
  controllers: [UsersController, AuthController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: AUTH_PROVIDER, useClass: SupabaseAdminAuthProvider },
    CreateUserUseCase,
    LoginUseCase,
    ListUsersUseCase,
    DeactivateUserUseCase,
    LoginRateLimitGuard,
    // Guards globales, en orden: autenticación -> rol -> scoping por gym.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: GymScopeGuard },
  ],
  exports: [USER_REPOSITORY],
})
export class IdentityModule {}
```

- [ ] **Step 9: Actualizar `apps/api/src/main.ts`** (agregar el filter global; el resto queda igual)

```typescript
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './identity/infrastructure/filters/domain-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
```

- [ ] **Step 10: Correr toda la suite + typecheck + build**

Run: `cd apps/api && node_modules/.bin/jest && node_modules/.bin/tsc --noEmit -p tsconfig.json && node_modules/.bin/nest build`
Expected: todos los tests en verde (Task 4: 11 + Task 5: 11 + Task 6: 5 + Task 7: 3 + Task 8: 4 + Task 9: 5 + Task 10: 5 = 44, más el `gym-id.value-object.spec.ts` de Fase 1 = 47 total; los `.spec.ts` de `jwt-auth.guard`/`roles.guard`/`gym-scope.guard` de Fase 1 no cambian), sin errores de compilación

---

### Task 11: Test e2e — cadena de guards + login completo

**Files:**

- Create: `apps/api/src/identity/infrastructure/guard-chain.e2e.spec.ts`
- Create: `apps/api/src/identity/infrastructure/login-flow.e2e.spec.ts`
- Modify: `apps/api/package.json` (agregar `supertest`/`@types/supertest`)

**Interfaces:**

- Consumes: `JwtAuthGuard`, `RolesGuard`, `GymScopeGuard`, `Roles`, `Public`, `Role`, `USER_REPOSITORY`/`UserRepositoryPort` (Fase 1/Task 2), `AuthController`, `LoginUseCase`, `AUTH_PROVIDER`/`AuthProviderPort`, `LoginRateLimitGuard`.

- [ ] **Step 1: Agregar dependencias en `apps/api/package.json`**

Agregar a `devDependencies`: `"supertest": "^7.0.0"`, `"@types/supertest": "^6.0.2"`.

- [ ] **Step 2: Instalar**

Run: `cd /home/fernando/Escritorio/Dev/Fernando/app-gimnasio && npx --yes pnpm@9.0.0 install --no-frozen-lockfile` (o `pnpm install`)

- [ ] **Step 3: `apps/api/src/identity/infrastructure/guard-chain.e2e.spec.ts`**

```typescript
import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { GymScopeGuard } from './guards/gym-scope.guard';
import { Roles } from './decorators/roles.decorator';
import { Public } from './decorators/public.decorator';
import { Role } from '../domain/role';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
  UserRecord,
} from '../application/ports/user-repository.port';

const TEST_SECRET = 'e2e-test-secret';
const TEST_SUPABASE_URL = 'https://e2e-test.supabase.co';

@Controller('test')
class GuardChainTestController {
  @Get('admin-only')
  @Roles(Role.ADMIN)
  adminOnly() {
    return { ok: true };
  }

  @Get('scoped/:gymId')
  scoped() {
    return { ok: true };
  }

  @Get('public')
  @Public()
  publicRoute() {
    return { ok: true };
  }
}

function firmarToken(sub: string): string {
  return jwt.sign({ sub }, TEST_SECRET, {
    audience: 'authenticated',
    issuer: `${TEST_SUPABASE_URL}/auth/v1`,
    expiresIn: '1h',
  });
}

describe('Cadena de guards (e2e): JwtAuthGuard -> RolesGuard -> GymScopeGuard', () => {
  let app: INestApplication;

  const usuarios: Record<string, UserRecord> = {
    'auth-admin': {
      id: 'user-admin',
      authUserId: 'auth-admin',
      gymId: 'gym-A',
      username: 'admin1',
      nombre: 'Admin',
      role: Role.ADMIN,
      activo: true,
    },
    'auth-alumno': {
      id: 'user-alumno',
      authUserId: 'auth-alumno',
      gymId: 'gym-A',
      username: 'juan.perez',
      nombre: 'Juan',
      role: Role.ALUMNO,
      activo: true,
    },
    'auth-desactivado': {
      id: 'user-desactivado',
      authUserId: 'auth-desactivado',
      gymId: 'gym-A',
      username: 'baja1',
      nombre: 'Baja',
      role: Role.ADMIN,
      activo: false,
    },
  };

  const fakeUserRepository: Pick<UserRepositoryPort, 'findByAuthUserId'> = {
    findByAuthUserId: async (authUserId: string) => usuarios[authUserId] ?? null,
  };

  beforeAll(async () => {
    process.env.SUPABASE_JWT_SECRET = TEST_SECRET;
    process.env.SUPABASE_URL = TEST_SUPABASE_URL;

    const moduleRef = await Test.createTestingModule({
      controllers: [GuardChainTestController],
      providers: [
        { provide: USER_REPOSITORY, useValue: fakeUserRepository },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: GymScopeGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rechaza sin token (401)', async () => {
    await request(app.getHttpServer()).get('/test/admin-only').expect(401);
  });

  it('permite una ruta @Public() sin token (200)', async () => {
    await request(app.getHttpServer()).get('/test/public').expect(200);
  });

  it('rechaza con rol insuficiente (403)', async () => {
    await request(app.getHttpServer())
      .get('/test/admin-only')
      .set('Authorization', `Bearer ${firmarToken('auth-alumno')}`)
      .expect(403);
  });

  it('rechaza a un usuario desactivado (401), aunque el rol sea correcto', async () => {
    await request(app.getHttpServer())
      .get('/test/admin-only')
      .set('Authorization', `Bearer ${firmarToken('auth-desactivado')}`)
      .expect(401);
  });

  it('permite con el rol correcto (200)', async () => {
    await request(app.getHttpServer())
      .get('/test/admin-only')
      .set('Authorization', `Bearer ${firmarToken('auth-admin')}`)
      .expect(200);
  });

  it('rechaza acceso a un gym distinto en la URL (403)', async () => {
    await request(app.getHttpServer())
      .get('/test/scoped/gym-B')
      .set('Authorization', `Bearer ${firmarToken('auth-admin')}`)
      .expect(403);
  });

  it('permite acceso al propio gym en la URL (200)', async () => {
    await request(app.getHttpServer())
      .get('/test/scoped/gym-A')
      .set('Authorization', `Bearer ${firmarToken('auth-admin')}`)
      .expect(200);
  });
});
```

- [ ] **Step 4: `apps/api/src/identity/infrastructure/login-flow.e2e.spec.ts`** (bootea `AuthController` real con un `AuthProviderPort` fake — sin tocar Supabase real)

```typescript
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthController } from './http/auth.controller';
import { LoginUseCase } from '../application/login.use-case';
import { AUTH_PROVIDER, AuthProviderPort } from '../application/ports/auth-provider.port';
import { USER_REPOSITORY, UserRepositoryPort } from '../application/ports/user-repository.port';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { GymScopeGuard } from './guards/gym-scope.guard';
import { LoginRateLimitGuard } from './guards/login-rate-limit.guard';

describe('POST /auth/login (e2e)', () => {
  let app: INestApplication;

  const fakeAuthProvider: AuthProviderPort = {
    createStaffUser: jest.fn(),
    createAlumnoUser: jest.fn(),
    signInStaff: jest.fn(async (_gymId, username, password) => {
      if (username === 'admin1' && password === 'password-correcta') {
        return { accessToken: 'token-staff', refreshToken: 'refresh-staff' };
      }
      throw new Error('Credenciales inválidas');
    }),
    signInAlumno: jest.fn(async (_gymId, username) => {
      if (username === 'juan.perez') {
        return { accessToken: 'token-alumno', refreshToken: 'refresh-alumno' };
      }
      throw new Error('Credenciales inválidas');
    }),
  };

  const fakeUserRepository: Pick<UserRepositoryPort, 'findByAuthUserId'> = {
    findByAuthUserId: async () => null,
  };

  beforeAll(async () => {
    process.env.SUPABASE_JWT_SECRET = 'e2e-secret';
    process.env.SUPABASE_URL = 'https://e2e-test.supabase.co';

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        LoginUseCase,
        LoginRateLimitGuard,
        { provide: AUTH_PROVIDER, useValue: fakeAuthProvider },
        { provide: USER_REPOSITORY, useValue: fakeUserRepository },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: GymScopeGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('login sin token funciona (ruta @Public())', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ gymId: 'gym-A', username: 'admin1', password: 'password-correcta' })
      .expect(200)
      .expect((res) => {
        if (res.body.accessToken !== 'token-staff') throw new Error('accessToken inesperado');
      });
  });

  it('login de alumno sin password funciona', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ gymId: 'gym-A', username: 'juan.perez' })
      .expect(200)
      .expect((res) => {
        if (res.body.accessToken !== 'token-alumno') throw new Error('accessToken inesperado');
      });
  });

  it('password incorrecta devuelve 401 genérico', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ gymId: 'gym-A', username: 'admin1', password: 'mal' })
      .expect(401);
    if (!String(res.body.message).includes('incorrectos')) throw new Error('mensaje inesperado');
  });

  it('username inexistente (sin password) devuelve el mismo 401 genérico', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ gymId: 'gym-A', username: 'no.existe' })
      .expect(401);
  });
});
```

- [ ] **Step 5: Correr ambos e2e**

Run: `cd apps/api && node_modules/.bin/jest guard-chain.e2e login-flow.e2e`
Expected: `11 passed, 11 total`

---

### Task 12: `apps/web` — sesión de Supabase (lectura y escritura) + cliente HTTP

**Files:**

- Modify: `apps/web/package.json`
- Create: `apps/web/.env.example`
- Create: `apps/web/lib/session.ts`
- Create: `apps/web/lib/session-writable.ts`
- Create: `apps/web/lib/api-client.ts`

**Interfaces:**

- Produces: `getAccessToken()`, `createWritableSupabaseServerClient()`, `apiFetch<T>()`, `ApiError` — consumidos por Task 13.

- [ ] **Step 1: Agregar dependencia en `apps/web/package.json`**

Agregar a `dependencies`: `"@supabase/ssr": "^0.4.0"`.

- [ ] **Step 2: `apps/web/.env.example`**

```
# Supabase — cliente público (anon key es seguro exponer al browser)
NEXT_PUBLIC_SUPABASE_URL="https://tu-proyecto.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="tu-anon-key"

# Single-gym MVP (HLD: un solo gimnasio). Reemplazar por resolución real
# (subdominio/slug) en Fase 3, multi-gym.
NEXT_PUBLIC_GYM_ID="tu-gym-id"

# URL de apps/api — SOLO server-side, nunca NEXT_PUBLIC_*
API_BASE_URL="http://localhost:3001"
```

- [ ] **Step 3: `apps/web/lib/session.ts`** (lectura, usado en Server Components — no puede escribir cookies)

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Lee el access_token de la sesión actual desde las cookies — lectura
 * LOCAL, no valida el JWT acá (eso lo hace el backend). Nunca se
 * reimplementa la verificación del JWT del lado de Next.js.
 */
export async function getAccessToken(): Promise<string | null> {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {
          // Server Components no pueden escribir cookies — no-op a propósito.
        },
        remove() {
          // Ídem set().
        },
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token ?? null;
}
```

- [ ] **Step 4: `apps/web/lib/session-writable.ts`** (escritura, usado SOLO en Server Actions/Route Handlers)

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Variante con escritura real de cookies — solo válida en Server
 * Actions/Route Handlers (Server Components no pueden setear cookies).
 * Se usa para persistir la sesión que devuelve `POST /auth/login`.
 */
export function createWritableSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          cookieStore.set(name, value, options);
        },
        remove(name: string, options: Record<string, unknown>) {
          cookieStore.set(name, '', { ...options, maxAge: 0 });
        },
      },
    },
  );
}
```

- [ ] **Step 5: `apps/web/lib/api-client.ts`**

```typescript
import { getAccessToken } from './session';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) {
    throw new ApiError(401, 'No hay sesión activa');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const cuerpo = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, cuerpo.message ?? 'Error de la API');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
```

- [ ] **Step 6: Instalar y verificar que compila**

Run: `cd /home/fernando/Escritorio/Dev/Fernando/app-gimnasio && npx --yes pnpm@9.0.0 install --no-frozen-lockfile`, luego `cd apps/web && node_modules/.bin/tsc --noEmit`
Expected: instala `@supabase/ssr` sin errores; typecheck sin errores

---

### Task 13: `apps/web` — login, layout de `(admin)`, alta de profesor/alumno, listado

**Files:**

- Create: `apps/web/app/login/page.tsx`
- Create: `apps/web/app/login/actions.ts`
- Modify: `apps/web/app/(admin)/layout.tsx`
- Create: `apps/web/app/(admin)/admin/actions.ts`
- Create: `apps/web/app/(admin)/admin/create-profesor-form.tsx`
- Create: `apps/web/app/(admin)/admin/create-alumno-form.tsx`
- Create: `apps/web/app/(admin)/admin/users-list.tsx`
- Modify: `apps/web/app/(admin)/admin/page.tsx`

**Interfaces:**

- Consumes: `apiFetch`/`ApiError` (Task 12), `createWritableSupabaseServerClient` (Task 12).

**Estilo visual — reglas explícitas del usuario, aplican a todo este task:**

- **Mobile-first de verdad**: cada clase de Tailwind en este task se escribe para mobile primero (sin prefijo) y se agranda con `sm:`/`md:` — nunca al revés. Cada pantalla se piensa primero en un viewport angosto (~375px).
- **Targets táctiles grandes**: todo botón/input interactivo tiene `min-h-11` (44px, el mínimo táctil recomendado) y padding generoso — nada pensado para precisión de mouse/hover como interacción primaria.
- **Cero código ajeno**: todo el CSS/componentes de este task se escriben desde cero con utilities de Tailwind. No se copia ni adapta código, CSS ni estructura de ningún proyecto de referencia (en particular: nada de openGym — alexpcosta/opengym ni DuarteSantos8/opengym — están en AGPL-3.0; usarlos como referencia visual está bien, tomar su código no).
- Paleta minimalista propia (grises neutros + un acento), sin pretender igualar ningún proyecto puntual — es una elección de diseño genérica, no una réplica.
- Listas de usuarios: tabla en pantallas medianas/grandes (`md:` en adelante), tarjetas apiladas en mobile (una tabla angosta con 5 columnas es ilegible en un celular) — mismo dato, presentación distinta según viewport, sin duplicar lógica de negocio.

- [ ] **Step 1: `apps/web/app/login/actions.ts`**

```typescript
'use server';

import { redirect } from 'next/navigation';
import { createWritableSupabaseServerClient } from '../../lib/session-writable';

export interface LoginActionState {
  error: string | null;
}

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';

export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const gymId = String(formData.get('gymId') ?? '');
  const username = String(formData.get('username') ?? '');
  const passwordRaw = formData.get('password');
  const password = passwordRaw ? String(passwordRaw) : undefined;

  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gymId, username, ...(password ? { password } : {}) }),
    cache: 'no-store',
  });

  if (!response.ok) {
    return { error: 'Usuario o contraseña incorrectos.' };
  }

  const { accessToken, refreshToken } = await response.json();

  const supabase = createWritableSupabaseServerClient();
  await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });

  redirect('/admin');
}
```

- [ ] **Step 2: `apps/web/app/login/page.tsx`**

```tsx
'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { loginAction, LoginActionState } from './actions';

const ESTADO_INICIAL: LoginActionState = { error: null };
const GYM_ID = process.env.NEXT_PUBLIC_GYM_ID ?? '';

function BotonIngresar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 rounded-lg bg-neutral-900 px-4 text-base font-medium text-white active:bg-neutral-700 disabled:opacity-50"
    >
      {pending ? 'Ingresando...' : 'Ingresar'}
    </button>
  );
}

export default function LoginPage() {
  const [estado, formAction] = useFormState(loginAction, ESTADO_INICIAL);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-50 px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-2xl font-semibold text-neutral-900">Ingresar</h1>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="gymId" value={GYM_ID} />
          <input
            name="username"
            placeholder="Usuario"
            required
            className="min-h-11 rounded-lg border border-neutral-300 px-4 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
          />
          <input
            name="password"
            type="password"
            placeholder="Contraseña (dejalo vacío si sos alumno)"
            className="min-h-11 rounded-lg border border-neutral-300 px-4 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
          />
          <BotonIngresar />
          {estado.error && (
            <p role="alert" className="text-sm text-red-600">
              {estado.error}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Reescribir `apps/web/app/(admin)/layout.tsx`** (misma lógica que antes — sin cambios de fondo, solo confirma que sigue vigente tras el rediseño)

```tsx
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api-client';

/**
 * Valida server-side que la sesión actual pertenece a un ADMIN — sin
 * reimplementar la verificación del JWT: llama a `GET /users` del backend,
 * gateado por `@Roles(ADMIN)` + `JwtAuthGuard`. Si responde 401/403,
 * redirige a `/login`.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  try {
    await apiFetch('/users');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  return <>{children}</>;
}
```

- [ ] **Step 4: `apps/web/app/(admin)/admin/actions.ts`**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from '../../../lib/api-client';

export interface CreateProfesorActionState {
  error: string | null;
  success: boolean;
}

export async function createProfesorAction(
  _prevState: CreateProfesorActionState,
  formData: FormData,
): Promise<CreateProfesorActionState> {
  const username = String(formData.get('username') ?? '');
  const nombre = String(formData.get('nombre') ?? '');
  const password = String(formData.get('password') ?? '');

  try {
    await apiFetch('/users/profesor', {
      method: 'POST',
      body: JSON.stringify({ username, nombre, password }),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 409) {
        return {
          error: `Ya existe un usuario con el username '${username}' en este gym.`,
          success: false,
        };
      }
      return { error: error.message, success: false };
    }
    return { error: 'Error inesperado creando el profesor.', success: false };
  }

  revalidatePath('/admin');
  return { error: null, success: true };
}

export interface CreateAlumnoActionState {
  error: string | null;
  usernameGenerado: string | null;
}

export async function createAlumnoAction(
  _prevState: CreateAlumnoActionState,
  formData: FormData,
): Promise<CreateAlumnoActionState> {
  const nombre = String(formData.get('nombre') ?? '');
  const apellido = String(formData.get('apellido') ?? '');

  try {
    const creado = await apiFetch<{ username: string }>('/users/alumno', {
      method: 'POST',
      body: JSON.stringify({ nombre, apellido }),
    });
    revalidatePath('/admin');
    return { error: null, usernameGenerado: creado.username };
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message, usernameGenerado: null };
    }
    return { error: 'Error inesperado creando el alumno.', usernameGenerado: null };
  }
}

export async function deactivateUserAction(userId: string): Promise<{ error: string | null }> {
  try {
    await apiFetch(`/users/${userId}/deactivate`, { method: 'PATCH' });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: 'Error inesperado desactivando al usuario.' };
  }

  revalidatePath('/admin');
  return { error: null };
}
```

- [ ] **Step 5: `apps/web/app/(admin)/admin/create-profesor-form.tsx`**

```tsx
'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createProfesorAction, CreateProfesorActionState } from './actions';

const ESTADO_INICIAL: CreateProfesorActionState = { error: null, success: false };

function BotonCrear() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 w-full rounded-lg bg-neutral-900 px-4 text-base font-medium text-white active:bg-neutral-700 disabled:opacity-50 sm:w-auto"
    >
      {pending ? 'Creando...' : 'Crear profesor'}
    </button>
  );
}

const INPUT_CLASSES =
  'min-h-11 rounded-lg border border-neutral-300 px-4 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none';

export function CreateProfesorForm() {
  const [estado, formAction] = useFormState(createProfesorAction, ESTADO_INICIAL);

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-neutral-900">Nuevo profesor</h2>
      <form action={formAction} className="flex flex-col gap-3">
        <input
          name="username"
          placeholder="Usuario"
          required
          minLength={3}
          className={INPUT_CLASSES}
        />
        <input
          name="nombre"
          placeholder="Nombre"
          required
          minLength={2}
          className={INPUT_CLASSES}
        />
        <input
          name="password"
          type="password"
          placeholder="Contraseña"
          required
          minLength={6}
          className={INPUT_CLASSES}
        />
        <BotonCrear />
        {estado.error && (
          <p role="alert" className="text-sm text-red-600">
            {estado.error}
          </p>
        )}
        {estado.success && <p className="text-sm text-green-700">Profesor creado.</p>}
      </form>
    </section>
  );
}
```

- [ ] **Step 6: `apps/web/app/(admin)/admin/create-alumno-form.tsx`**

```tsx
'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createAlumnoAction, CreateAlumnoActionState } from './actions';

const ESTADO_INICIAL: CreateAlumnoActionState = { error: null, usernameGenerado: null };

function BotonCrear() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 w-full rounded-lg bg-neutral-900 px-4 text-base font-medium text-white active:bg-neutral-700 disabled:opacity-50 sm:w-auto"
    >
      {pending ? 'Creando...' : 'Crear alumno'}
    </button>
  );
}

const INPUT_CLASSES =
  'min-h-11 rounded-lg border border-neutral-300 px-4 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none';

export function CreateAlumnoForm() {
  const [estado, formAction] = useFormState(createAlumnoAction, ESTADO_INICIAL);

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-neutral-900">Nuevo alumno</h2>
      <form action={formAction} className="flex flex-col gap-3">
        <input
          name="nombre"
          placeholder="Nombre"
          required
          minLength={2}
          className={INPUT_CLASSES}
        />
        <input
          name="apellido"
          placeholder="Apellido"
          required
          minLength={2}
          className={INPUT_CLASSES}
        />
        <BotonCrear />
        {estado.error && (
          <p role="alert" className="text-sm text-red-600">
            {estado.error}
          </p>
        )}
        {estado.usernameGenerado && (
          <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
            Usuario creado: <strong className="font-semibold">{estado.usernameGenerado}</strong> —
            comunicáselo en persona (es lo único que necesita para entrar).
          </p>
        )}
      </form>
    </section>
  );
}
```

- [ ] **Step 7: `apps/web/app/(admin)/admin/users-list.tsx`** (tarjetas apiladas en mobile, tabla desde `md:` — mismo dato, dos presentaciones, sin duplicar la lógica de desactivar/filtrar)

```tsx
'use client';

import { useState, useTransition } from 'react';
import { deactivateUserAction } from './actions';

interface UserRow {
  id: string;
  username: string;
  nombre: string;
  role: 'ADMIN' | 'PROFESOR' | 'ALUMNO';
  activo: boolean;
}

type FiltroRol = 'TODOS' | UserRow['role'];

const ETIQUETA_ROL: Record<UserRow['role'], string> = {
  ADMIN: 'Admin',
  PROFESOR: 'Profesor',
  ALUMNO: 'Alumno',
};

export function UsersList({ usuariosIniciales }: { usuariosIniciales: UserRow[] }) {
  const [filtroRol, setFiltroRol] = useState<FiltroRol>('TODOS');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const usuariosFiltrados = usuariosIniciales.filter(
    (u) => filtroRol === 'TODOS' || u.role === filtroRol,
  );

  function handleDeactivate(userId: string, nombre: string) {
    const confirmado = window.confirm(
      `¿Desactivar a ${nombre}? Va a perder acceso inmediatamente. Esto no se puede deshacer desde acá.`,
    );
    if (!confirmado) return;

    setError(null);
    startTransition(async () => {
      const resultado = await deactivateUserAction(userId);
      if (resultado.error) {
        setError(resultado.error);
      }
    });
  }

  function BotonDesactivar({ u, className = '' }: { u: UserRow; className?: string }) {
    return (
      <button
        onClick={() => handleDeactivate(u.id, u.nombre)}
        disabled={!u.activo || isPending}
        className={`min-h-11 rounded-lg border border-red-200 px-4 text-sm font-medium text-red-700 active:bg-red-50 disabled:border-neutral-200 disabled:text-neutral-400 ${className}`}
      >
        Desactivar
      </button>
    );
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">Usuarios del gym</h2>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          Filtrar por rol
          <select
            value={filtroRol}
            onChange={(e) => setFiltroRol(e.target.value as FiltroRol)}
            className="min-h-11 rounded-lg border border-neutral-300 px-3 text-base"
          >
            <option value="TODOS">Todos</option>
            <option value="ADMIN">Admin</option>
            <option value="PROFESOR">Profesor</option>
            <option value="ALUMNO">Alumno</option>
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* Mobile: tarjetas apiladas (default, sin prefijo — oculto desde md:) */}
      <ul className="flex flex-col gap-3 md:hidden">
        {usuariosFiltrados.map((u) => (
          <li key={u.id} className="rounded-xl border border-neutral-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-neutral-900">{u.nombre}</p>
                <p className="text-sm text-neutral-500">@{u.username}</p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  u.activo ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-500'
                }`}
              >
                {u.activo ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            <p className="mt-2 text-sm text-neutral-600">{ETIQUETA_ROL[u.role]}</p>
            <BotonDesactivar u={u} className="mt-3 w-full" />
          </li>
        ))}
      </ul>

      {/* md: en adelante — tabla, columnas más aprovechables en pantalla ancha */}
      <table className="hidden w-full text-left md:table">
        <thead>
          <tr className="border-b border-neutral-200 text-sm text-neutral-500">
            <th className="py-2 font-medium">Usuario</th>
            <th className="py-2 font-medium">Nombre</th>
            <th className="py-2 font-medium">Rol</th>
            <th className="py-2 font-medium">Estado</th>
            <th className="py-2 font-medium">Acción</th>
          </tr>
        </thead>
        <tbody>
          {usuariosFiltrados.map((u) => (
            <tr key={u.id} className="border-b border-neutral-100 last:border-0">
              <td className="py-3 text-sm text-neutral-500">@{u.username}</td>
              <td className="py-3 text-neutral-900">{u.nombre}</td>
              <td className="py-3 text-neutral-700">{ETIQUETA_ROL[u.role]}</td>
              <td className="py-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    u.activo ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-500'
                  }`}
                >
                  {u.activo ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td className="py-3">
                <BotonDesactivar u={u} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 8: Reescribir `apps/web/app/(admin)/admin/page.tsx`**

```tsx
import { apiFetch } from '../../../lib/api-client';
import { CreateProfesorForm } from './create-profesor-form';
import { CreateAlumnoForm } from './create-alumno-form';
import { UsersList } from './users-list';

interface UserRow {
  id: string;
  username: string;
  nombre: string;
  role: 'ADMIN' | 'PROFESOR' | 'ALUMNO';
  activo: boolean;
}

export default async function AdminPage() {
  const usuarios = await apiFetch<UserRow[]>('/users');

  return (
    <main className="min-h-dvh bg-neutral-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Panel Admin</h1>
        <div className="flex flex-col gap-6 sm:grid sm:grid-cols-2">
          <CreateProfesorForm />
          <CreateAlumnoForm />
        </div>
        <UsersList usuariosIniciales={usuarios} />
      </div>
    </main>
  );
}
```

- [ ] **Step 9: Verificar que compila**

Run: `cd apps/web && node_modules/.bin/tsc --noEmit`
Expected: sin errores

- [ ] **Step 10: Confirmar el viewport mobile antes que el desktop** (pedido explícito del usuario: "probá cada pantalla nueva en viewport de celular antes que en desktop")

Run: `cd apps/web && node_modules/.bin/next build` y, si es posible correr `next dev` en este entorno, abrir `/login` y `/admin` con las devtools en un viewport angosto (375px) primero — confirmar que ningún elemento se corta ni requiere scroll horizontal, que los botones/inputs son cómodos al tacto (`min-h-11` ya aplicado en todos), y que la lista de usuarios se ve como tarjetas (no como tabla apretada) por debajo de `md:`. Si este entorno no tiene navegador disponible para verificar visualmente, dejarlo documentado como pendiente de revisión manual del usuario — no asumir que compila == se ve bien.

---

### Task 14: Verificación integral

**Files:** ninguno (solo comandos)

- [ ] **Step 1: Suite completa de `api`**

Run: `cd apps/api && node_modules/.bin/jest`
Expected: todos en verde — confirmar el número total exacto en el reporte (Fase 1: `gym-id`+`jwt-auth.guard`+`roles.guard`+`gym-scope.guard` = 1+7+4+5=17, más este plan: Task 4: 11, Task 5: 11, Task 6: 5, Task 7: 3, Task 8: 4, Task 9: 5, Task 10: 5, Task 11: 11 = 55; total esperado 72 — puede variar levemente, reportar el número real)

- [ ] **Step 2: Typecheck + build de `api`**

Run: `cd apps/api && node_modules/.bin/tsc --noEmit -p tsconfig.json && node_modules/.bin/nest build`
Expected: sin errores

- [ ] **Step 3: Prisma validate**

Run: `cd apps/api && node_modules/.bin/prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: Typecheck + build de `web`**

Run: `cd apps/web && node_modules/.bin/tsc --noEmit && node_modules/.bin/next build`
Expected: sin errores (si `next build` falla por falta de `NEXT_PUBLIC_*` en el entorno, reportarlo como concern, no bloqueo — son secrets del usuario)

- [ ] **Step 5: Grep de que no queda nada de email/invite**

Run: `grep -ril "inviteUserByEmail\|InviteUserUseCase\|DuplicateEmailError" apps/api/src apps/web || echo "LIMPIO"`
Expected: `LIMPIO`

- [ ] **Step 6: Reportar al usuario**

No hacer commit. Para cada punto del pedido, comando + output exacto, no solo "quedó hecho":

1. `User.email` → `username` + migración — output de `prisma migrate deploy`/`validate`.
2. Email sintético + password derivada — output de `synthetic-credentials.spec.ts`, y aclarar explícitamente que `admin.createUser`/`signInWithPassword` NO se ejercitaron contra la Supabase real (side effect en `auth.users`, no autorizado en este plan) — solo mockeados/fakeados en tests.
3. `CreateUserUseCase` (jerarquía + username autogenerado con sufijo) — output de `create-user.use-case.spec.ts`.
4. `LoginUseCase` ramificado + error genérico — output de `login.use-case.spec.ts`.
5. Rate limit de login — output de `login-rate-limit.guard.spec.ts`.
6. Encapsulamiento (grep de `synthetic-credentials`/`deriveAlumnoPassword` fuera de `identity/infrastructure/auth/`) — comando + resultado.
7. Tests actualizados/nuevos — conteo total y grep del Step 5 de este task confirmando que no queda nada del flujo viejo.
8. Frontend — decisión de UI de login tomada y por qué (un solo form, password opcional), comando de build de `web`, y qué NO se verificó end-to-end (requiere `apps/api` corriendo + Supabase real + browser).
