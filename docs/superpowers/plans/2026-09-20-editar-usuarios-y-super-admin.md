# Editar usuarios + SUPER_ADMIN Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ADMIN edita nombre/password de PROFESOR/ALUMNO de su gym (PROFESOR edita nombre de sus ALUMNO de cartera), y un rol `SUPER_ADMIN` nuevo puede crear/editar cuentas ADMIN de cualquier gym.

**Architecture:** Extiende el módulo `identity` existente (nuevo caso de uso `EditUserUseCase`, nuevo endpoint `PATCH /users/:id`, nuevo `SuperAdminLoginUseCase` en `/auth/super-admin/login`) y agrega un módulo nuevo y separado `super-admin/` (CRUD de cuentas ADMIN, gateado por `@Roles(Role.SUPER_ADMIN)`, nunca toca recursos gym-scoped). `User.gymId` pasa a nullable en el schema — solo `SUPER_ADMIN` tiene `gymId: null`.

**Tech Stack:** NestJS + Prisma + Supabase Auth (backend, sin cambios de librerías), Next.js Server Actions (frontend, sin cambios de librerías).

## Global Constraints

- El alumno como rol no gana ninguna capacidad de auto-edición (descartado explícitamente).
- Editar `username` queda fuera de alcance en todos los flujos de este plan — sigue inmutable vía UI.
- No se crea tabla `Gym`. El `gymId` de un ADMIN nuevo lo escribe el SUPER_ADMIN a mano, sin catálogo ni validación contra una lista.
- `SUPER_ADMIN` nunca pasa por rutas gym-scoped (`/users`, `/routine-templates`, `/routine-instances`, cartera, catálogo) — solo opera sobre `/super-admin/*` y `/auth/super-admin/login`.
- Cambiar una password (PROFESOR o ADMIN) nunca pide la password actual — quien edita define una nueva directamente, igual que al dar de alta.
- `PLATFORM_PSEUDO_GYM_ID` (constante reservada para el email sintético de SUPER_ADMIN) nunca se persiste como `gymId` real de ningún usuario — ni siquiera del propio SUPER_ADMIN (su fila tiene `gymId: null`).
- Todo bounded context de errores extiende `DomainError` (`apps/api/src/shared-kernel/domain-error.ts`) con su propio `httpStatus` — nunca se lanza un `Error` plano desde un caso de uso salvo que sea un bug de autorización que nunca debería ocurrir en producción (ver `requireGymId` en Task 1).
- Backend: 254 tests existentes deben seguir en verde después de cada task. Frontend: build de Next.js y suite de tests existente deben seguir en verde después de cada task que lo toque.

---

### Task 1: `gymId` nullable + rol `SUPER_ADMIN` (plumbing de todo el codebase)

Esta es la task más grande del plan: cambia un tipo compartido por toda la app (`AuthenticatedUser.gymId` y `UserRecord.gymId` pasan de `string` a `string | null`) y arregla cada punto donde eso deja de compilar. Es un solo cambio atómico — no tiene sentido dejarlo a medias, ya que el codebase no compila hasta que TODOS estos archivos estén arreglados.

**Contexto para quien implemente:** solo las filas `SUPER_ADMIN` tienen `gymId: null` en la base. Todo el resto del código (ADMIN/PROFESOR/ALUMNO) sigue teniendo siempre un `gymId` real — y cada uno de esos casos de uso ya está protegido por `@Roles(...)` para que `SUPER_ADMIN` nunca los alcance. El arreglo en cada archivo de abajo es angostar el tipo de vuelta a `string` en el momento de uso con el helper `requireGymId` (Step 2) — nunca cambiar la lógica de negocio.

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260920120000_super_admin_role_and_nullable_gym_id/migration.sql`
- Modify: `apps/api/src/identity/domain/role.ts`
- Modify: `apps/api/src/identity/domain/authenticated-user.ts`
- Create: `apps/api/src/identity/application/require-gym-id.ts`
- Test: `apps/api/src/identity/application/require-gym-id.spec.ts`
- Modify: `apps/api/src/identity/application/ports/user-repository.port.ts`
- Modify: `apps/api/src/identity/infrastructure/persistence/prisma-user.repository.ts`
- Modify: `apps/api/src/identity/infrastructure/persistence/prisma-cartera.repository.ts`
- Modify: `apps/api/src/identity/infrastructure/http/user-response.mapper.ts`
- Modify: `apps/api/src/identity/infrastructure/guards/gym-scope.guard.ts`
- Modify (uso de `requireGymId`, 1 ocurrencia cada uno salvo que se indique otra cosa):
  - `apps/api/src/identity/application/list-users.use-case.ts` (línea 26)
  - `apps/api/src/identity/application/create-user.use-case.ts` (línea 53)
  - `apps/api/src/identity/application/get-user-deletion-impact.use-case.ts` (línea 42)
  - `apps/api/src/identity/application/delete-user-permanently.use-case.ts` (línea 52)
  - `apps/api/src/identity/application/cartera/list-profesores-de-alumno.use-case.ts` (línea 28)
  - `apps/api/src/identity/application/cartera/remove-profesor-from-alumno.use-case.ts` (2 ocurrencias: líneas 38-39)
  - `apps/api/src/identity/application/cartera/assign-profesor-to-alumno.use-case.ts` (3 ocurrencias: líneas 44, 56, 71)
  - `apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.ts` (línea 80)
  - `apps/api/src/routines/application/create-routine-template.use-case.ts` (línea 32)
  - `apps/api/src/routines/application/assign-routine-to-alumno.use-case.ts` (2 ocurrencias: líneas 80, 121)

**Interfaces:**

- Produces: `Role.SUPER_ADMIN` (enum value, `apps/api/src/identity/domain/role.ts`).
- Produces: `AuthenticatedUser.gymId: string | null` (`apps/api/src/identity/domain/authenticated-user.ts`) — usado por TODO el resto del plan.
- Produces: `UserRecord.gymId: string | null` (`apps/api/src/identity/application/ports/user-repository.port.ts`).
- Produces: `requireGymId(user: AuthenticatedUser): string` (`apps/api/src/identity/application/require-gym-id.ts`) — Task 4, 7 y el resto de este codebase lo usan para angostar el tipo.
- Produces: `GymScopeGuard` deja pasar sin chequeo a `role === Role.SUPER_ADMIN` — Task 7 depende de esto (`POST /super-admin/admins` manda un `gymId` en el body que nunca va a matchear el `gymId: null` del invocador).

- [ ] **Step 1: Schema — `SUPER_ADMIN` + `gymId` nullable**

Modificar `apps/api/prisma/schema.prisma`:

```prisma
enum Role {
  ADMIN
  PROFESOR
  ALUMNO
  SUPER_ADMIN
}
```

Y en `model User`:

```prisma
model User {
  id         String   @id @default(uuid())
  authUserId String   @unique
  gymId      String?
  username   String
  nombre     String
  role       Role
  activo     Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  templatesComoProfesor  RoutineTemplate[] @relation("ProfesorTemplates")
  instanciasComoProfesor RoutineInstance[] @relation("ProfesorInstances")
  instanciasComoAlumno   RoutineInstance[] @relation("AlumnoInstances")
  alumnosAsignados       ProfesorAlumno[]  @relation("CarteraDelProfesor")
  profesoresAsignados    ProfesorAlumno[]  @relation("ProfesoresDelAlumno")

  @@unique([gymId, username])
  @@index([gymId])
}
```

(Único cambio real: `gymId String` → `gymId String?`. El resto del modelo queda igual.)

- [ ] **Step 2: Crear la migración a mano**

Correr `mkdir -p apps/api/prisma/migrations/20260920120000_super_admin_role_and_nullable_gym_id` y crear `migration.sql` ahí adentro:

```sql
-- SUPER_ADMIN: rol nuevo, sin gymId (por eso User.gymId pasa a nullable).
-- ALTER TYPE ... ADD VALUE no puede usarse en la misma transacción en la
-- que ese valor nuevo se INSERTA/lee — acá solo se agrega, no se usa,
-- así que corre sin problema dentro de la transacción que Prisma ya abre
-- por archivo de migración.
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';

ALTER TABLE "User" ALTER COLUMN "gymId" DROP NOT NULL;
```

No correr `prisma migrate dev` (generaría un diff distinto al de arriba) — este proyecto edita `migration.sql` a mano y valida con `prisma migrate deploy` contra una base de desarrollo, ya establecido en migraciones previas de este repo.

- [ ] **Step 3: Regenerar el cliente de Prisma**

Run: `cd apps/api && npx prisma generate`
Expected: termina sin error, `node_modules/.prisma/client` incluye `Role.SUPER_ADMIN` y `gymId: string | null` en los tipos generados de `User`.

- [ ] **Step 4: `Role` de dominio**

`apps/api/src/identity/domain/role.ts`:

```typescript
export enum Role {
  ADMIN = 'ADMIN',
  PROFESOR = 'PROFESOR',
  ALUMNO = 'ALUMNO',
  SUPER_ADMIN = 'SUPER_ADMIN',
}
```

- [ ] **Step 5: `AuthenticatedUser.gymId` nullable**

`apps/api/src/identity/domain/authenticated-user.ts`:

```typescript
import { Role } from './role';

/**
 * Shape de `req.user`, inyectado por `JwtAuthGuard` en cada request
 * autenticado. `gymId` es `null` únicamente para `SUPER_ADMIN` — todo
 * caso de uso gym-scoped usa `requireGymId()` (`application/require-gym-id.ts`)
 * para angostar el tipo, en vez de asumir que siempre hay un gymId.
 */
export interface AuthenticatedUser {
  id: string;
  gymId: string | null;
  role: Role;
}
```

- [ ] **Step 6: Escribir el test de `requireGymId` (falla primero)**

`apps/api/src/identity/application/require-gym-id.spec.ts`:

```typescript
import { Role } from '../domain/role';
import { requireGymId } from './require-gym-id';

describe('requireGymId', () => {
  it('devuelve el gymId cuando existe', () => {
    expect(requireGymId({ id: 'u1', gymId: 'gym-1', role: Role.ADMIN })).toBe('gym-1');
  });

  it('lanza si el usuario no tiene gymId (SUPER_ADMIN)', () => {
    expect(() => requireGymId({ id: 'u1', gymId: null, role: Role.SUPER_ADMIN })).toThrow();
  });
});
```

Run: `cd apps/api && npx jest require-gym-id.spec.ts`
Expected: FAIL con "Cannot find module './require-gym-id'".

- [ ] **Step 7: Implementar `requireGymId`**

`apps/api/src/identity/application/require-gym-id.ts`:

```typescript
import { AuthenticatedUser } from '../domain/authenticated-user';

/**
 * Angosta `AuthenticatedUser.gymId` de `string | null` a `string` en el
 * punto de uso. Solo `SUPER_ADMIN` tiene `gymId: null` (domain/role.ts)
 * y ningún caso de uso gym-scoped es alcanzable por ese rol — el guard
 * de rol de cada endpoint ya lo bloquea antes de llegar acá. Si esto
 * lanza, es un bug de autorización (un guard dejó pasar a alguien que
 * no debía), nunca un estado esperado del negocio — por eso es un Error
 * plano (500 genérico vía el exception filter default de Nest), no un
 * DomainError con su propio código HTTP de negocio.
 */
export function requireGymId(user: AuthenticatedUser): string {
  if (user.gymId === null) {
    throw new Error(
      `Usuario '${user.id}' (rol ${user.role}) sin gymId intentó una operación gym-scoped — bug de autorización, no debería ser alcanzable.`,
    );
  }
  return user.gymId;
}
```

Run: `cd apps/api && npx jest require-gym-id.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 8: `UserRecord.gymId` nullable + `create()` acepta `gymId: string | null`**

`apps/api/src/identity/application/ports/user-repository.port.ts` — cambiar el campo `gymId` en `UserRecord` y en el parámetro `data` de `create`:

```typescript
export interface UserRecord {
  id: string;
  authUserId: string;
  gymId: string | null;
  username: string;
  nombre: string;
  role: Role;
  activo: boolean;
}
```

Y en `create(data: {...})`, el campo `gymId: string;` pasa a `gymId: string | null;`. El resto de la interfaz (`findByAuthUserId`, `findByGymIdAndUsername`, `findByGymId`, `findById`, `deactivate`) no cambia de firma — esos siguen recibiendo `gymId: string` porque siempre se llaman con un gym real conocido (nunca con el `gymId` de un `SUPER_ADMIN`).

Agregar el método nuevo que usa Task 3:

```typescript
  /** Actualiza solo `nombre` — usado por EditUserUseCase (Task 4) y EditAdminUseCase (Task 7). */
  updateNombre(id: string, nombre: string): Promise<UserRecord>;
```

- [ ] **Step 9: `PrismaUserRepository` — tipos + `updateNombre`**

`apps/api/src/identity/infrastructure/persistence/prisma-user.repository.ts`:

- `interface PrismaUserRow { ...; gymId: string | null; ... }` (era `gymId: string`).
- El método `create(data: {...}, vinculoCartera?)`: el parámetro `data.gymId` pasa a `string | null` (sigue escribiéndose igual, `tx.user.create({ data: { gymId: data.gymId, ... } })` — Prisma acepta `null` ahí sin cambios).
- Agregar al final de la clase:

```typescript
  async updateNombre(id: string, nombre: string): Promise<UserRecord> {
    const user = await this.prisma.user.update({ where: { id }, data: { nombre } });
    return this.toRecord(user);
  }
```

- [ ] **Step 10: `PrismaCarteraRepository` — mismo ajuste de tipo**

`apps/api/src/identity/infrastructure/persistence/prisma-cartera.repository.ts` — su `interface PrismaUserRow` local (la que alimenta `toUserRecord`) cambia `gymId: string` a `gymId: string | null`. Sin más cambios — la asignación `gymId: user.gymId` ya queda consistente.

- [ ] **Step 11: `UserResponse.gymId` nullable**

`apps/api/src/identity/infrastructure/http/user-response.mapper.ts`:

```typescript
export interface UserResponse {
  id: string;
  gymId: string | null;
  username: string;
  nombre: string;
  role: UserRecord['role'];
  activo: boolean;
}
```

- [ ] **Step 12: `GymScopeGuard` — bypass para `SUPER_ADMIN`**

`apps/api/src/identity/infrastructure/guards/gym-scope.guard.ts`, dentro de `canActivate`, inmediatamente después del chequeo `if (!user) { return true; }`:

```typescript
// SUPER_ADMIN no tiene gymId propio y opera explícitamente cruzando
// gyms (ej. POST /super-admin/admins manda el gymId del ADMIN nuevo
// en el body) — el scoping de esta guard no aplica a ese rol.
if (user.role === Role.SUPER_ADMIN) {
  return true;
}
```

(Requiere importar `Role` desde `'../../domain/role'` si el archivo no lo importa ya.)

- [ ] **Step 13: Arreglar los 10 call-sites con `requireGymId`**

En cada uno de estos archivos, agregar el import `import { requireGymId } from '<ruta-relativa-a-identity/application/require-gym-id>';` y reemplazar `input.invocadoPor.gymId` por `requireGymId(input.invocadoPor)` (o por una variable local `const gymId = requireGymId(input.invocadoPor);` cuando el archivo lo usa más de una vez, reemplazando todos los usos siguientes por `gymId`):

1. `apps/api/src/identity/application/list-users.use-case.ts` — import `from './require-gym-id'`. Línea `return this.userRepository.findByGymId(input.invocadoPor.gymId, input.role);` → `return this.userRepository.findByGymId(requireGymId(input.invocadoPor), input.role);`

2. `apps/api/src/identity/application/create-user.use-case.ts` — import `from './require-gym-id'`. Línea `const gymId = input.invocadoPor.gymId;` → `const gymId = requireGymId(input.invocadoPor);`

3. `apps/api/src/identity/application/get-user-deletion-impact.use-case.ts` — import `from './require-gym-id'`. En la llamada a `resolveUserInGym(this.userRepository, input.userId, input.invocadoPor.gymId)`, reemplazar el tercer argumento por `requireGymId(input.invocadoPor)`.

4. `apps/api/src/identity/application/delete-user-permanently.use-case.ts` — mismo cambio que el anterior (misma forma exacta de llamada a `resolveUserInGym`).

5. `apps/api/src/identity/application/cartera/list-profesores-de-alumno.use-case.ts` — import `from '../require-gym-id'`. Línea `await resolveUserInGym(this.userRepository, input.alumnoId, input.invocadoPor.gymId);` → tercer argumento `requireGymId(input.invocadoPor)`.

6. `apps/api/src/identity/application/cartera/remove-profesor-from-alumno.use-case.ts` — import `from '../require-gym-id'`. Agregar `const gymId = requireGymId(input.invocadoPor);` antes de las dos llamadas a `resolveUserInGym`, y usar `gymId` como tercer argumento en ambas (líneas 38 y 39).

7. `apps/api/src/identity/application/cartera/assign-profesor-to-alumno.use-case.ts` — import `from '../require-gym-id'`. Agregar `const gymId = requireGymId(input.invocadoPor);` justo después del chequeo de rol (antes de la primera llamada a `resolveUserInGym`), y reemplazar las 3 ocurrencias de `input.invocadoPor.gymId` (las dos llamadas a `resolveUserInGym` y el `gymId: input.invocadoPor.gymId` del `carteraRepository.crear({...})`) por `gymId`.

8. `apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.ts` — import `from '../../identity/application/require-gym-id'`. En la llamada a `resolveUserInGym(this.userRepository, input.alumnoId, input.invocadoPor.gymId)`, tercer argumento → `requireGymId(input.invocadoPor)`.

9. `apps/api/src/routines/application/create-routine-template.use-case.ts` — import `from '../../identity/application/require-gym-id'`. Línea `gymId: input.invocadoPor.gymId,` dentro de `this.templateRepository.create({...})` → `gymId: requireGymId(input.invocadoPor),`.

10. `apps/api/src/routines/application/assign-routine-to-alumno.use-case.ts` — import `from '../../identity/application/require-gym-id'`. Agregar `const gymId = requireGymId(input.invocadoPor);` justo antes de la llamada a `resolveUserInGym` (línea ~76, antes del bloque `const alumno = await resolveUserInGym(...)`), usar `gymId` como tercer argumento ahí (era línea 80) y también en `gymId: input.invocadoPor.gymId,` dentro de `this.instanceRepository.crear({...})` (era línea 121).

- [ ] **Step 14: Verificar que compila y que los 254 tests existentes siguen en verde**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores.

Run: `cd apps/api && npm test`
Expected: `Test Suites: 46 passed, 46 total` (45 previas + `require-gym-id.spec.ts` nuevo), `Tests: 256 passed, 256 total` (254 previos + 2 nuevos).

- [ ] **Step 15: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/identity apps/api/src/routines
git commit -m "feat(identity): rol SUPER_ADMIN y gymId nullable en User"
```

---

### Task 2: `AuthProviderPort.updateStaffPassword` + email sintético reservado

**Files:**

- Modify: `apps/api/src/identity/application/ports/auth-provider.port.ts`
- Modify: `apps/api/src/identity/infrastructure/auth/supabase-admin-auth.provider.ts`
- Modify: `apps/api/src/identity/infrastructure/auth/supabase-admin-auth.provider.spec.ts`
- Modify: `apps/api/src/identity/infrastructure/auth/synthetic-credentials.ts`
- Test: `apps/api/src/identity/infrastructure/auth/synthetic-credentials.spec.ts`

**Interfaces:**

- Consumes: nada de tasks anteriores.
- Produces: `AuthProviderPort.updateStaffPassword(authUserId: string, password: string): Promise<void>` — Task 4 y Task 7 lo usan.
- Produces: `PLATFORM_PSEUDO_GYM_ID` (constante string) exportada desde `synthetic-credentials.ts` — Task 6 (`SuperAdminLoginUseCase`) y Task 7 (`CreateAdminUseCase`, validación de `gymId` reservado) lo usan.

- [ ] **Step 1: Agregar el método al puerto**

`apps/api/src/identity/application/ports/auth-provider.port.ts`, agregar a la interfaz `AuthProviderPort`:

```typescript
  /**
   * Pisa la password de un usuario existente (PROFESOR o ADMIN — nunca
   * ALUMNO, que no tiene password real). No pide la actual: quien la
   * cambia define una nueva directamente, igual que al dar de alta.
   */
  updateStaffPassword(authUserId: string, password: string): Promise<void>;
```

- [ ] **Step 2: Actualizar el test de "expone los métodos del puerto"**

`apps/api/src/identity/infrastructure/auth/supabase-admin-auth.provider.spec.ts`, en el test `'expone los 6 métodos del AuthProviderPort'`:

```typescript
it('expone los 7 métodos del AuthProviderPort', () => {
  const provider = new SupabaseAdminAuthProvider();
  expect(typeof provider.createStaffUser).toBe('function');
  expect(typeof provider.createAlumnoUser).toBe('function');
  expect(typeof provider.signInStaff).toBe('function');
  expect(typeof provider.signInAlumno).toBe('function');
  expect(typeof provider.refreshSession).toBe('function');
  expect(typeof provider.deleteAuthUser).toBe('function');
  expect(typeof provider.updateStaffPassword).toBe('function');
});
```

Run: `cd apps/api && npx jest supabase-admin-auth.provider.spec.ts`
Expected: FAIL — `provider.updateStaffPassword` es `undefined`.

- [ ] **Step 3: Implementar `updateStaffPassword`**

`apps/api/src/identity/infrastructure/auth/supabase-admin-auth.provider.ts`, agregar el método a la clase (junto a `deleteAuthUser`):

```typescript
  async updateStaffPassword(authUserId: string, password: string): Promise<void> {
    const { error } = await this.client.auth.admin.updateUserById(authUserId, { password });
    if (error) {
      throw new Error(`No se pudo actualizar la password en Supabase Auth: ${error.message}`);
    }
  }
```

Run: `cd apps/api && npx jest supabase-admin-auth.provider.spec.ts`
Expected: PASS.

- [ ] **Step 4: Escribir el test del email sintético reservado (falla primero)**

`apps/api/src/identity/infrastructure/auth/synthetic-credentials.spec.ts` — este archivo ya existe (tests de `buildSyntheticEmail`/`deriveAlumnoPassword`); agregar al final:

```typescript
describe('PLATFORM_PSEUDO_GYM_ID', () => {
  it('es un gymId reservado, distinto de cualquier gymId real posible', () => {
    expect(PLATFORM_PSEUDO_GYM_ID).toBe('__platform__');
  });

  it('produce un email sintético válido para SUPER_ADMIN', () => {
    expect(buildSyntheticEmail(PLATFORM_PSEUDO_GYM_ID, 'fer')).toBe(
      'fer+__platform__@gym.internal',
    );
  });
});
```

(Agregar `PLATFORM_PSEUDO_GYM_ID` al import existente de `buildSyntheticEmail`/`deriveAlumnoPassword` al inicio del archivo.)

Run: `cd apps/api && npx jest synthetic-credentials.spec.ts`
Expected: FAIL — `PLATFORM_PSEUDO_GYM_ID` no existe.

- [ ] **Step 5: Exportar la constante**

`apps/api/src/identity/infrastructure/auth/synthetic-credentials.ts`, agregar cerca de `DOMINIO_EMAIL_SINTETICO`:

```typescript
/**
 * gymId reservado, exclusivo de cuentas SUPER_ADMIN — nunca se persiste
 * como gymId real de ningún User (el de un SUPER_ADMIN es `null`, ver
 * domain/role.ts). Sirve solo para construir/resolver su email sintético
 * acá adentro. `CreateAdminUseCase` (super-admin/) rechaza explícitamente
 * que alguien use este valor como gymId de un ADMIN real.
 */
export const PLATFORM_PSEUDO_GYM_ID = '__platform__';
```

Run: `cd apps/api && npx jest synthetic-credentials.spec.ts`
Expected: PASS.

- [ ] **Step 6: Test suite completa**

Run: `cd apps/api && npm test`
Expected: todos los suites en verde (2 tests nuevos en `synthetic-credentials.spec.ts`, 1 test modificado en `supabase-admin-auth.provider.spec.ts`).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/identity/application/ports/auth-provider.port.ts apps/api/src/identity/infrastructure/auth
git commit -m "feat(identity): updateStaffPassword y gymId reservado para SUPER_ADMIN"
```

---

### Task 3: `EditUserUseCase` (ADMIN edita PROFESOR/ALUMNO, PROFESOR edita su ALUMNO)

**Files:**

- Create: `apps/api/src/identity/application/errors/cannot-edit-admin.error.ts`
- Create: `apps/api/src/identity/application/errors/alumno-has-no-password.error.ts`
- Create: `apps/api/src/identity/application/edit-user.use-case.ts`
- Test: `apps/api/src/identity/application/edit-user.use-case.spec.ts`

**Interfaces:**

- Consumes: `requireGymId` (Task 1), `AuthProviderPort.updateStaffPassword` (Task 2), `UserRepositoryPort.updateNombre` (Task 1), `CarteraRepositoryPort.existe` (ya existe), `AlumnoNotInCarteraError` (ya existe en `apps/api/src/routines/application/errors/alumno-not-in-cartera.error.ts`).
- Produces: `EditUserUseCase.execute(input: EditUserInput): Promise<UserRecord>` — Task 5 (endpoint HTTP) lo consume.

- [ ] **Step 1: Errores nuevos**

`apps/api/src/identity/application/errors/cannot-edit-admin.error.ts`:

```typescript
import { DomainError } from '../../../shared-kernel/domain-error';

export class CannotEditAdminError extends DomainError {
  readonly httpStatus = 400;

  constructor(userId: string) {
    super(
      `El usuario '${userId}' es ADMIN o SUPER_ADMIN — no se puede editar por esta vía. Usá el panel de super-admin.`,
    );
    this.name = 'CannotEditAdminError';
  }
}
```

`apps/api/src/identity/application/errors/alumno-has-no-password.error.ts`:

```typescript
import { DomainError } from '../../../shared-kernel/domain-error';

export class AlumnoHasNoPasswordError extends DomainError {
  readonly httpStatus = 400;

  constructor(userId: string) {
    super(`El usuario '${userId}' es ALUMNO — los alumnos no tienen contraseña.`);
    this.name = 'AlumnoHasNoPasswordError';
  }
}
```

- [ ] **Step 2: Escribir los tests (fallan primero)**

`apps/api/src/identity/application/edit-user.use-case.spec.ts`:

```typescript
import { Role } from '../domain/role';
import { EditUserUseCase } from './edit-user.use-case';
import { AuthProviderPort } from './ports/auth-provider.port';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { CarteraRepositoryPort } from './ports/cartera-repository.port';
import { CannotEditAdminError } from './errors/cannot-edit-admin.error';
import { AlumnoHasNoPasswordError } from './errors/alumno-has-no-password.error';
import { UserNotFoundError } from './errors/user-not-found.error';
import { AlumnoNotInCarteraError } from '../../routines/application/errors/alumno-not-in-cartera.error';

describe('EditUserUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let authProvider: jest.Mocked<AuthProviderPort>;
  let carteraRepository: jest.Mocked<CarteraRepositoryPort>;
  let useCase: EditUserUseCase;

  const admin: UserRecord = {
    id: 'admin-1',
    authUserId: 'auth-admin',
    gymId: 'gym-1',
    username: 'admin1',
    nombre: 'Admin',
    role: Role.ADMIN,
    activo: true,
  };
  const profesorInvocador: UserRecord = {
    id: 'prof-1',
    authUserId: 'auth-prof',
    gymId: 'gym-1',
    username: 'prof1',
    nombre: 'Profe',
    role: Role.PROFESOR,
    activo: true,
  };
  const profesorObjetivo: UserRecord = {
    id: 'prof-2',
    authUserId: 'auth-prof2',
    gymId: 'gym-1',
    username: 'prof2',
    nombre: 'Profe Dos',
    role: Role.PROFESOR,
    activo: true,
  };
  const alumno: UserRecord = {
    id: 'alum-1',
    authUserId: 'auth-alum',
    gymId: 'gym-1',
    username: 'juan.perez',
    nombre: 'Juan Perez',
    role: Role.ALUMNO,
    activo: true,
  };
  const alumnoOtroGym: UserRecord = { ...alumno, id: 'alum-2', gymId: 'gym-2' };
  const otroAdmin: UserRecord = { ...admin, id: 'admin-2' };

  beforeEach(() => {
    userRepository = {
      findByAuthUserId: jest.fn(),
      findByGymIdAndUsername: jest.fn(),
      findByGymId: jest.fn(),
      findById: jest.fn(),
      deactivate: jest.fn(),
      create: jest.fn(),
      updateNombre: jest.fn(),
    };
    authProvider = {
      createStaffUser: jest.fn(),
      createAlumnoUser: jest.fn(),
      signInStaff: jest.fn(),
      signInAlumno: jest.fn(),
      refreshSession: jest.fn(),
      deleteAuthUser: jest.fn(),
      updateStaffPassword: jest.fn(),
    };
    carteraRepository = {
      existe: jest.fn(),
      crear: jest.fn(),
      eliminar: jest.fn(),
      findAlumnosDeProfesor: jest.fn(),
      findProfesoresDeAlumno: jest.fn(),
    };
    useCase = new EditUserUseCase(userRepository, authProvider, carteraRepository);
  });

  it('ADMIN edita nombre de un PROFESOR de su gym', async () => {
    userRepository.findById.mockResolvedValue(profesorObjetivo);
    userRepository.updateNombre.mockResolvedValue({ ...profesorObjetivo, nombre: 'Nuevo Nombre' });

    const resultado = await useCase.execute({
      invocadoPor: { id: admin.id, gymId: admin.gymId, role: Role.ADMIN },
      userId: profesorObjetivo.id,
      nombre: 'Nuevo Nombre',
    });

    expect(userRepository.updateNombre).toHaveBeenCalledWith(profesorObjetivo.id, 'Nuevo Nombre');
    expect(resultado.nombre).toBe('Nuevo Nombre');
  });

  it('ADMIN edita la password de un PROFESOR de su gym', async () => {
    userRepository.findById.mockResolvedValue(profesorObjetivo);

    await useCase.execute({
      invocadoPor: { id: admin.id, gymId: admin.gymId, role: Role.ADMIN },
      userId: profesorObjetivo.id,
      password: 'nueva-password-123',
    });

    expect(authProvider.updateStaffPassword).toHaveBeenCalledWith(
      profesorObjetivo.authUserId,
      'nueva-password-123',
    );
    expect(userRepository.updateNombre).not.toHaveBeenCalled();
  });

  it('ADMIN no puede editar un usuario de otro gym (404, anti-enumeración)', async () => {
    userRepository.findById.mockResolvedValue(alumnoOtroGym);

    await expect(
      useCase.execute({
        invocadoPor: { id: admin.id, gymId: admin.gymId, role: Role.ADMIN },
        userId: alumnoOtroGym.id,
        nombre: 'X',
      }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('ADMIN no puede editar otro ADMIN por esta vía', async () => {
    userRepository.findById.mockResolvedValue(otroAdmin);

    await expect(
      useCase.execute({
        invocadoPor: { id: admin.id, gymId: admin.gymId, role: Role.ADMIN },
        userId: otroAdmin.id,
        nombre: 'X',
      }),
    ).rejects.toThrow(CannotEditAdminError);
  });

  it('setear password a un ALUMNO rechaza con AlumnoHasNoPasswordError', async () => {
    userRepository.findById.mockResolvedValue(alumno);

    await expect(
      useCase.execute({
        invocadoPor: { id: admin.id, gymId: admin.gymId, role: Role.ADMIN },
        userId: alumno.id,
        password: 'lo-que-sea',
      }),
    ).rejects.toThrow(AlumnoHasNoPasswordError);
  });

  it('PROFESOR edita el nombre de un ALUMNO de su cartera', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(true);
    userRepository.updateNombre.mockResolvedValue({ ...alumno, nombre: 'Juan P.' });

    const resultado = await useCase.execute({
      invocadoPor: {
        id: profesorInvocador.id,
        gymId: profesorInvocador.gymId,
        role: Role.PROFESOR,
      },
      userId: alumno.id,
      nombre: 'Juan P.',
    });

    expect(carteraRepository.existe).toHaveBeenCalledWith(profesorInvocador.id, alumno.id);
    expect(resultado.nombre).toBe('Juan P.');
  });

  it('PROFESOR no puede editar un ALUMNO fuera de su cartera', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(false);

    await expect(
      useCase.execute({
        invocadoPor: {
          id: profesorInvocador.id,
          gymId: profesorInvocador.gymId,
          role: Role.PROFESOR,
        },
        userId: alumno.id,
        nombre: 'X',
      }),
    ).rejects.toThrow(AlumnoNotInCarteraError);
  });

  it('PROFESOR no puede editar a otro PROFESOR', async () => {
    userRepository.findById.mockResolvedValue(profesorObjetivo);

    await expect(
      useCase.execute({
        invocadoPor: {
          id: profesorInvocador.id,
          gymId: profesorInvocador.gymId,
          role: Role.PROFESOR,
        },
        userId: profesorObjetivo.id,
        nombre: 'X',
      }),
    ).rejects.toThrow(UserNotFoundError);
  });
});
```

Run: `cd apps/api && npx jest edit-user.use-case.spec.ts`
Expected: FAIL — `./edit-user.use-case` no existe.

- [ ] **Step 3: Implementar `EditUserUseCase`**

`apps/api/src/identity/application/edit-user.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../domain/role';
import { AuthenticatedUser } from '../domain/authenticated-user';
import { USER_REPOSITORY, UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { AUTH_PROVIDER, AuthProviderPort } from './ports/auth-provider.port';
import { CARTERA_REPOSITORY, CarteraRepositoryPort } from './ports/cartera-repository.port';
import { resolveUserInGym } from './resolve-user-in-gym';
import { requireGymId } from './require-gym-id';
import { InsufficientRoleError } from './errors/insufficient-role.error';
import { CannotEditAdminError } from './errors/cannot-edit-admin.error';
import { AlumnoHasNoPasswordError } from './errors/alumno-has-no-password.error';
import { UserNotFoundError } from './errors/user-not-found.error';
import { AlumnoNotInCarteraError } from '../../routines/application/errors/alumno-not-in-cartera.error';

export interface EditUserInput {
  invocadoPor: AuthenticatedUser;
  userId: string;
  nombre?: string;
  password?: string;
}

/**
 * ADMIN edita PROFESOR/ALUMNO de su gym; PROFESOR edita solo ALUMNO de su
 * cartera. Nadie edita un ADMIN/SUPER_ADMIN por acá — eso es exclusivo
 * de `super-admin/` (Task 7). Nunca pide la password actual: quien edita
 * define una nueva directamente (mismo criterio que al dar de alta).
 */
@Injectable()
export class EditUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProviderPort,
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
  ) {}

  async execute(input: EditUserInput): Promise<UserRecord> {
    const gymId = requireGymId(input.invocadoPor);
    const objetivo = await resolveUserInGym(this.userRepository, input.userId, gymId);

    if (objetivo.role === Role.ADMIN || objetivo.role === Role.SUPER_ADMIN) {
      throw new CannotEditAdminError(objetivo.id);
    }

    if (input.invocadoPor.role === Role.PROFESOR) {
      if (objetivo.role !== Role.ALUMNO) {
        throw new UserNotFoundError(objetivo.id);
      }
      const enCartera = await this.carteraRepository.existe(input.invocadoPor.id, objetivo.id);
      if (!enCartera) {
        throw new AlumnoNotInCarteraError(objetivo.id);
      }
    } else if (input.invocadoPor.role !== Role.ADMIN) {
      throw new InsufficientRoleError(input.invocadoPor.role, [Role.ADMIN, Role.PROFESOR]);
    }

    if (input.password !== undefined && objetivo.role === Role.ALUMNO) {
      throw new AlumnoHasNoPasswordError(objetivo.id);
    }

    let actualizado = objetivo;
    if (input.nombre !== undefined) {
      actualizado = await this.userRepository.updateNombre(objetivo.id, input.nombre);
    }
    if (input.password !== undefined) {
      await this.authProvider.updateStaffPassword(objetivo.authUserId, input.password);
    }
    return actualizado;
  }
}
```

Run: `cd apps/api && npx jest edit-user.use-case.spec.ts`
Expected: PASS (9 tests).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/identity/application/edit-user.use-case.ts apps/api/src/identity/application/edit-user.use-case.spec.ts apps/api/src/identity/application/errors/cannot-edit-admin.error.ts apps/api/src/identity/application/errors/alumno-has-no-password.error.ts
git commit -m "feat(identity): EditUserUseCase (ADMIN/PROFESOR editan nombre/password)"
```

---

### Task 4: `PATCH /users/:id` (endpoint HTTP de `EditUserUseCase`)

**Files:**

- Create: `apps/api/src/identity/infrastructure/http/dto/edit-user.dto.ts`
- Modify: `apps/api/src/identity/infrastructure/http/users.controller.ts`
- Modify: `apps/api/src/identity/identity.module.ts`
- Test: `apps/api/src/identity/infrastructure/http/edit-user.e2e.spec.ts`

**Interfaces:**

- Consumes: `EditUserUseCase` (Task 3).
- Produces: `PATCH /users/:id` — usado por Task 9 (frontend).

- [ ] **Step 1: DTO**

`apps/api/src/identity/infrastructure/http/dto/edit-user.dto.ts`:

```typescript
import { IsOptional, IsString, MinLength } from 'class-validator';

export class EditUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
```

- [ ] **Step 2: Wiring en `UsersController`**

`apps/api/src/identity/infrastructure/http/users.controller.ts` — agregar el import de `EditUserUseCase` y `EditUserDto`, inyectarlo en el constructor, y agregar el endpoint (junto a `deactivate`, mismo estilo):

```typescript
  @Patch(':id')
  @Roles(Role.ADMIN, Role.PROFESOR)
  async edit(@Param('id') id: string, @Body() dto: EditUserDto, @Req() req: RequestWithUser) {
    if (dto.nombre === undefined && dto.password === undefined) {
      throw new BadRequestException('Mandá al menos uno de: nombre, password.');
    }
    const user = await this.editUserUseCase.execute({
      invocadoPor: req.user,
      userId: id,
      nombre: dto.nombre,
      password: dto.password,
    });
    return toUserResponse(user);
  }
```

(`BadRequestException` ya está importado en este archivo — se usa en `parsearRoleFiltro`.)

- [ ] **Step 3: Registrar en el módulo**

`apps/api/src/identity/identity.module.ts` — agregar `EditUserUseCase` al import y a la lista de `providers`. También agregar `AUTH_PROVIDER` a `exports` (lo necesita Task 7):

```typescript
  exports: [USER_REPOSITORY, AUTH_PROVIDER, CARTERA_REPOSITORY],
```

- [ ] **Step 4: Escribir el e2e test (falla primero)**

`apps/api/src/identity/infrastructure/http/edit-user.e2e.spec.ts` — copiar el scaffolding de `cartera.controller.e2e.spec.ts` (mismo patrón: `Test.createTestingModule`, JWKS local, `signTestToken`) pero registrando `UsersController` + `CreateUserUseCase`/`ListUsersUseCase`/`DeactivateUserUseCase`/`GetUserDeletionImpactUseCase`/`DeleteUserPermanentlyUseCase`/`EditUserUseCase` con fakes de `USER_REPOSITORY`/`AUTH_PROVIDER`/`CARTERA_REPOSITORY`:

```typescript
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { UsersController } from './users.controller';
import { CreateUserUseCase } from '../../application/create-user.use-case';
import { ListUsersUseCase } from '../../application/list-users.use-case';
import { DeactivateUserUseCase } from '../../application/deactivate-user.use-case';
import { GetUserDeletionImpactUseCase } from '../../application/get-user-deletion-impact.use-case';
import { DeleteUserPermanentlyUseCase } from '../../application/delete-user-permanently.use-case';
import { EditUserUseCase } from '../../application/edit-user.use-case';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
  UserRecord,
} from '../../application/ports/user-repository.port';
import { AUTH_PROVIDER, AuthProviderPort } from '../../application/ports/auth-provider.port';
import {
  CARTERA_REPOSITORY,
  CarteraRepositoryPort,
} from '../../application/ports/cartera-repository.port';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { GymScopeGuard } from '../guards/gym-scope.guard';
import { Role } from '../../domain/role';
import { DomainExceptionFilter } from '../../../shared-kernel/domain-exception.filter';
import { buildTestJwtKeys, signTestToken, TestJwtKeys } from '../guards/testing/jwt-test-support';

jest.mock('jose', () => {
  const actual = jest.requireActual('jose');
  return { ...actual, createRemoteJWKSet: jest.fn() };
});
const { createRemoteJWKSet: mockCreateRemoteJWKSet } = jest.requireMock('jose') as {
  createRemoteJWKSet: jest.Mock;
};

describe('PATCH /users/:id (e2e)', () => {
  let app: INestApplication;
  let claves: TestJwtKeys;

  const admin: UserRecord = {
    id: 'admin-1',
    authUserId: 'auth-admin',
    gymId: 'gym-A',
    username: 'admin1',
    nombre: 'Admin',
    role: Role.ADMIN,
    activo: true,
  };
  const profesor: UserRecord = {
    id: 'prof-1',
    authUserId: 'auth-prof',
    gymId: 'gym-A',
    username: 'prof1',
    nombre: 'Profe',
    role: Role.PROFESOR,
    activo: true,
  };
  const alumno: UserRecord = {
    id: 'alum-1',
    authUserId: 'auth-alum',
    gymId: 'gym-A',
    username: 'juan.perez',
    nombre: 'Juan Perez',
    role: Role.ALUMNO,
    activo: true,
  };

  const usuariosPorAuthId: Record<string, UserRecord> = {
    'auth-admin': admin,
    'auth-alum': alumno,
  };

  const fakeUserRepository: Partial<UserRepositoryPort> = {
    findByAuthUserId: async (authUserId: string) => usuariosPorAuthId[authUserId] ?? null,
    findById: async (id: string) => {
      if (id === profesor.id) return profesor;
      if (id === alumno.id) return alumno;
      if (id === admin.id) return admin;
      return null;
    },
    updateNombre: async (id: string, nombre: string) => ({ ...profesor, id, nombre }),
  };
  const fakeAuthProvider: Partial<AuthProviderPort> = { updateStaffPassword: async () => {} };
  const fakeCarteraRepository: Partial<CarteraRepositoryPort> = { existe: async () => true };

  beforeAll(async () => {
    claves = await buildTestJwtKeys();
    mockCreateRemoteJWKSet.mockReturnValue(claves.jwks);

    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        CreateUserUseCase,
        ListUsersUseCase,
        DeactivateUserUseCase,
        GetUserDeletionImpactUseCase,
        DeleteUserPermanentlyUseCase,
        EditUserUseCase,
        { provide: USER_REPOSITORY, useValue: fakeUserRepository },
        { provide: AUTH_PROVIDER, useValue: fakeAuthProvider },
        { provide: CARTERA_REPOSITORY, useValue: fakeCarteraRepository },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: GymScopeGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainExceptionFilter());
    process.env.SUPABASE_URL = 'https://e2e-edit-user-test.supabase.co';
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function tokenPara(sub: string) {
    return signTestToken(claves.privateKey, { issuer: `${process.env.SUPABASE_URL}/auth/v1`, sub });
  }

  it('ADMIN edita el nombre de un PROFESOR de su gym', async () => {
    const token = await tokenPara('auth-admin');
    const res = await request(app.getHttpServer())
      .patch(`/users/${profesor.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Profe Editado' });

    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Profe Editado');
  });

  it('rechaza con 400 si el body no trae nombre ni password', async () => {
    const token = await tokenPara('auth-admin');
    const res = await request(app.getHttpServer())
      .patch(`/users/${profesor.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('ADMIN no puede editar a otro ADMIN', async () => {
    const token = await tokenPara('auth-admin');
    const res = await request(app.getHttpServer())
      .patch(`/users/${admin.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Otro Nombre' });

    expect(res.status).toBe(400);
  });

  it('ALUMNO no puede llamar a este endpoint', async () => {
    const token = await tokenPara('auth-alum');
    const res = await request(app.getHttpServer())
      .patch(`/users/${profesor.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'X' });

    expect(res.status).toBe(403);
  });
});
```

Run: `cd apps/api && npx jest edit-user.e2e.spec.ts`
Expected: FAIL — `editUserUseCase` no está inyectado en `UsersController` todavía (paso 2 no aplicado aún si se corre antes; si Step 2/3 ya se aplicaron, este test debería pasar directo — en TDD estricto, escribir este test ANTES del Step 2/3 haría fallar por 404 en la ruta).

- [ ] **Step 3 (retomado): Aplicar Steps 1-3 si no se aplicaron, y re-correr**

Run: `cd apps/api && npx jest edit-user.e2e.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 4: Test suite completa**

Run: `cd apps/api && npm test`
Expected: todo en verde.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/identity/infrastructure/http apps/api/src/identity/identity.module.ts
git commit -m "feat(identity): endpoint PATCH /users/:id"
```

---

### Task 5: `SuperAdminLoginUseCase` + `POST /auth/super-admin/login`

**Files:**

- Create: `apps/api/src/identity/application/super-admin-login.use-case.ts`
- Test: `apps/api/src/identity/application/super-admin-login.use-case.spec.ts`
- Create: `apps/api/src/identity/infrastructure/http/dto/super-admin-login.dto.ts`
- Modify: `apps/api/src/identity/infrastructure/http/auth.controller.ts`
- Modify: `apps/api/src/identity/identity.module.ts`
- Test: `apps/api/src/identity/infrastructure/super-admin-login-flow.e2e.spec.ts`

**Interfaces:**

- Consumes: `PLATFORM_PSEUDO_GYM_ID` (Task 2).
- Produces: `POST /auth/super-admin/login` — usado por Task 10 (frontend).

- [ ] **Step 1: Escribir el test unitario (falla primero)**

`apps/api/src/identity/application/super-admin-login.use-case.spec.ts`:

```typescript
import { Role } from '../domain/role';
import { SuperAdminLoginUseCase } from './super-admin-login.use-case';
import { AuthProviderPort } from './ports/auth-provider.port';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { InvalidCredentialsError } from './errors/invalid-credentials.error';
import { PLATFORM_PSEUDO_GYM_ID } from '../infrastructure/auth/synthetic-credentials';

describe('SuperAdminLoginUseCase', () => {
  let authProvider: jest.Mocked<AuthProviderPort>;
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let useCase: SuperAdminLoginUseCase;

  const superAdmin: UserRecord = {
    id: 'sa-1',
    authUserId: 'auth-sa',
    gymId: null,
    username: 'root',
    nombre: 'Root',
    role: Role.SUPER_ADMIN,
    activo: true,
  };

  beforeEach(() => {
    authProvider = {
      createStaffUser: jest.fn(),
      createAlumnoUser: jest.fn(),
      signInStaff: jest.fn(),
      signInAlumno: jest.fn(),
      refreshSession: jest.fn(),
      deleteAuthUser: jest.fn(),
      updateStaffPassword: jest.fn(),
    };
    userRepository = {
      findByAuthUserId: jest.fn(),
      findByGymIdAndUsername: jest.fn(),
      findByGymId: jest.fn(),
      findById: jest.fn(),
      deactivate: jest.fn(),
      create: jest.fn(),
      updateNombre: jest.fn(),
    };
    useCase = new SuperAdminLoginUseCase(authProvider, userRepository);
  });

  it('usa signInStaff con PLATFORM_PSEUDO_GYM_ID, nunca con un gymId real', async () => {
    authProvider.signInStaff.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      authUserId: 'auth-sa',
    });
    userRepository.findByAuthUserId.mockResolvedValue(superAdmin);

    await useCase.execute({ username: 'root', password: 'secreto' });

    expect(authProvider.signInStaff).toHaveBeenCalledWith(
      PLATFORM_PSEUDO_GYM_ID,
      'root',
      'secreto',
    );
  });

  it('rechaza si el authProvider falla', async () => {
    authProvider.signInStaff.mockRejectedValue(new Error('detalle interno'));

    await expect(useCase.execute({ username: 'root', password: 'mal' })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('rechaza si el User resuelto no es SUPER_ADMIN (defensa en profundidad)', async () => {
    authProvider.signInStaff.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      authUserId: 'auth-otro',
    });
    userRepository.findByAuthUserId.mockResolvedValue({
      ...superAdmin,
      authUserId: 'auth-otro',
      role: Role.ADMIN,
    });

    await expect(useCase.execute({ username: 'root', password: 'secreto' })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('rechaza si el SUPER_ADMIN está desactivado', async () => {
    authProvider.signInStaff.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      authUserId: 'auth-sa',
    });
    userRepository.findByAuthUserId.mockResolvedValue({ ...superAdmin, activo: false });

    await expect(useCase.execute({ username: 'root', password: 'secreto' })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });
});
```

Run: `cd apps/api && npx jest super-admin-login.use-case.spec.ts`
Expected: FAIL — el archivo de implementación no existe.

- [ ] **Step 2: Implementar `SuperAdminLoginUseCase`**

`apps/api/src/identity/application/super-admin-login.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../domain/role';
import { AUTH_PROVIDER, AuthProviderPort, AuthSession } from './ports/auth-provider.port';
import { USER_REPOSITORY, UserRepositoryPort } from './ports/user-repository.port';
import { InvalidCredentialsError } from './errors/invalid-credentials.error';
import { PLATFORM_PSEUDO_GYM_ID } from '../infrastructure/auth/synthetic-credentials';

export interface SuperAdminLoginInput {
  username: string;
  password: string;
}

/**
 * Login exclusivo de SUPER_ADMIN — nunca pide gymId (a diferencia de
 * LoginUseCase). Arma el email sintético con PLATFORM_PSEUDO_GYM_ID.
 * Verifica además que el User resuelto sea efectivamente SUPER_ADMIN:
 * nadie más puede tener ese email reservado en circunstancias normales
 * (CreateAdminUseCase, Task 7, impide que un ADMIN normal use ese gymId),
 * pero el chequeo es defensa en profundidad barata.
 */
@Injectable()
export class SuperAdminLoginUseCase {
  constructor(
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProviderPort,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
  ) {}

  async execute(input: SuperAdminLoginInput): Promise<AuthSession> {
    let session: AuthSession;
    try {
      session = await this.authProvider.signInStaff(
        PLATFORM_PSEUDO_GYM_ID,
        input.username,
        input.password,
      );
    } catch {
      throw new InvalidCredentialsError();
    }

    const user = await this.userRepository.findByAuthUserId(session.authUserId);
    if (!user || !user.activo || user.role !== Role.SUPER_ADMIN) {
      throw new InvalidCredentialsError();
    }

    return session;
  }
}
```

Run: `cd apps/api && npx jest super-admin-login.use-case.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 3: DTO**

`apps/api/src/identity/infrastructure/http/dto/super-admin-login.dto.ts`:

```typescript
import { IsString, MinLength } from 'class-validator';

export class SuperAdminLoginDto {
  @IsString()
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
```

- [ ] **Step 4: Endpoint en `AuthController`**

`apps/api/src/identity/infrastructure/http/auth.controller.ts` — inyectar `SuperAdminLoginUseCase` en el constructor y agregar:

```typescript
  @Post('super-admin/login')
  @Public()
  @UseGuards(LoginRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  async superAdminLogin(
    @Body() dto: SuperAdminLoginDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const { accessToken, refreshToken } = await this.superAdminLoginUseCase.execute(dto);
    return { accessToken, refreshToken };
  }
```

- [ ] **Step 5: Registrar en el módulo**

`apps/api/src/identity/identity.module.ts` — agregar `SuperAdminLoginUseCase` al import y a `providers`.

- [ ] **Step 6: e2e test (falla primero, luego pasa)**

`apps/api/src/identity/infrastructure/super-admin-login-flow.e2e.spec.ts` — mismo scaffolding que `login-flow.e2e.spec.ts` (`AuthController` real, `AUTH_PROVIDER`/`USER_REPOSITORY` fakeados, sin JWT porque login no requiere auth):

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AuthController } from './http/auth.controller';
import { LoginUseCase } from '../application/login.use-case';
import { RefreshSessionUseCase } from '../application/refresh-session.use-case';
import { SuperAdminLoginUseCase } from '../application/super-admin-login.use-case';
import { AUTH_PROVIDER, AuthProviderPort } from '../application/ports/auth-provider.port';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
  UserRecord,
} from '../application/ports/user-repository.port';
import { Role } from '../domain/role';
import { LoginRateLimitGuard } from './guards/login-rate-limit.guard';
import { DomainExceptionFilter } from '../../shared-kernel/domain-exception.filter';
import { PLATFORM_PSEUDO_GYM_ID } from './auth/synthetic-credentials';

describe('POST /auth/super-admin/login (e2e)', () => {
  let app: INestApplication;
  let gymIdRecibidoPorSignInStaff: string | undefined;

  const fakeAuthProvider: Partial<AuthProviderPort> = {
    signInStaff: jest.fn(async (gymId: string, username: string, password: string) => {
      gymIdRecibidoPorSignInStaff = gymId;
      if (gymId === PLATFORM_PSEUDO_GYM_ID && username === 'root' && password === 'correcta') {
        return { accessToken: 'token-sa', refreshToken: 'refresh-sa', authUserId: 'auth-sa' };
      }
      throw new Error('Credenciales inválidas');
    }),
  };

  const superAdmin: UserRecord = {
    id: 'sa-1',
    authUserId: 'auth-sa',
    gymId: null,
    username: 'root',
    nombre: 'Root',
    role: Role.SUPER_ADMIN,
    activo: true,
  };

  const fakeUserRepository: Partial<UserRepositoryPort> = {
    findByAuthUserId: async (authUserId: string) => (authUserId === 'auth-sa' ? superAdmin : null),
  };

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://e2e-super-admin-login-test.supabase.co';
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        LoginUseCase,
        RefreshSessionUseCase,
        SuperAdminLoginUseCase,
        LoginRateLimitGuard,
        { provide: AUTH_PROVIDER, useValue: fakeAuthProvider },
        { provide: USER_REPOSITORY, useValue: fakeUserRepository },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('loguea con username/password, sin pedir ni usar gymId del body', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/super-admin/login')
      .send({ username: 'root', password: 'correcta', gymId: 'gym-cualquiera-si-lo-mandaran' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accessToken: 'token-sa', refreshToken: 'refresh-sa' });
    expect(gymIdRecibidoPorSignInStaff).toBe(PLATFORM_PSEUDO_GYM_ID);
  });

  it('rechaza credenciales incorrectas con 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/super-admin/login')
      .send({ username: 'root', password: 'mal' });

    expect(res.status).toBe(401);
  });
});
```

Run: `cd apps/api && npx jest super-admin-login-flow.e2e.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Test suite completa**

Run: `cd apps/api && npm test`
Expected: todo en verde.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/identity
git commit -m "feat(identity): SuperAdminLoginUseCase y POST /auth/super-admin/login"
```

---

### Task 6: Módulo `super-admin` — crear/listar/editar cuentas ADMIN

**Files:**

- Create: `apps/api/src/super-admin/super-admin.module.ts`
- Create: `apps/api/src/super-admin/application/errors/reserved-gym-id.error.ts`
- Create: `apps/api/src/super-admin/application/create-admin.use-case.ts`
- Test: `apps/api/src/super-admin/application/create-admin.use-case.spec.ts`
- Create: `apps/api/src/super-admin/application/list-admins.use-case.ts`
- Create: `apps/api/src/super-admin/application/edit-admin.use-case.ts`
- Test: `apps/api/src/super-admin/application/edit-admin.use-case.spec.ts`
- Create: `apps/api/src/super-admin/infrastructure/http/super-admin.controller.ts`
- Create: `apps/api/src/super-admin/infrastructure/http/dto/create-admin.dto.ts`
- Test: `apps/api/src/super-admin/infrastructure/http/super-admin.controller.e2e.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**

- Consumes: `USER_REPOSITORY`, `AUTH_PROVIDER` (exportados por `IdentityModule` desde Task 4), `PLATFORM_PSEUDO_GYM_ID` (Task 2), `Role`/`AuthenticatedUser`/`Roles` decorator (identity, ya existen), `EditUserDto` (Task 4, reusado tal cual — mismo shape `{nombre?, password?}`).
- Produces: `POST /super-admin/admins`, `GET /super-admin/admins`, `PATCH /super-admin/admins/:id` — usados por Task 11 (frontend).

- [ ] **Step 1: Error de gymId reservado**

`apps/api/src/super-admin/application/errors/reserved-gym-id.error.ts`:

```typescript
import { DomainError } from '../../../shared-kernel/domain-error';

export class ReservedGymIdError extends DomainError {
  readonly httpStatus = 400;

  constructor(gymId: string) {
    super(`El gymId '${gymId}' está reservado para el sistema — elegí otro.`);
    this.name = 'ReservedGymIdError';
  }
}
```

- [ ] **Step 2: Test de `CreateAdminUseCase` (falla primero)**

`apps/api/src/super-admin/application/create-admin.use-case.spec.ts`:

```typescript
import { Role } from '../../identity/domain/role';
import { CreateAdminUseCase } from './create-admin.use-case';
import { AuthProviderPort } from '../../identity/application/ports/auth-provider.port';
import {
  UserRepositoryPort,
  UserRecord,
} from '../../identity/application/ports/user-repository.port';
import { ReservedGymIdError } from './errors/reserved-gym-id.error';
import { PLATFORM_PSEUDO_GYM_ID } from '../../identity/infrastructure/auth/synthetic-credentials';

describe('CreateAdminUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let authProvider: jest.Mocked<AuthProviderPort>;
  let useCase: CreateAdminUseCase;

  beforeEach(() => {
    userRepository = {
      findByAuthUserId: jest.fn(),
      findByGymIdAndUsername: jest.fn(),
      findByGymId: jest.fn(),
      findById: jest.fn(),
      deactivate: jest.fn(),
      create: jest.fn(),
      updateNombre: jest.fn(),
    };
    authProvider = {
      createStaffUser: jest.fn(),
      createAlumnoUser: jest.fn(),
      signInStaff: jest.fn(),
      signInAlumno: jest.fn(),
      refreshSession: jest.fn(),
      deleteAuthUser: jest.fn(),
      updateStaffPassword: jest.fn(),
    };
    useCase = new CreateAdminUseCase(userRepository, authProvider);
  });

  it('crea un ADMIN con el gymId indicado', async () => {
    authProvider.createStaffUser.mockResolvedValue({ authUserId: 'auth-new-admin' });
    const creado: UserRecord = {
      id: 'admin-new',
      authUserId: 'auth-new-admin',
      gymId: 'gym-nuevo',
      username: 'nuevoadmin',
      nombre: 'Nuevo Admin',
      role: Role.ADMIN,
      activo: true,
    };
    userRepository.create.mockResolvedValue(creado);

    const resultado = await useCase.execute({
      gymId: 'gym-nuevo',
      username: 'nuevoadmin',
      nombre: 'Nuevo Admin',
      password: 'segura123',
    });

    expect(authProvider.createStaffUser).toHaveBeenCalledWith(
      'gym-nuevo',
      'nuevoadmin',
      'segura123',
    );
    expect(userRepository.create).toHaveBeenCalledWith({
      gymId: 'gym-nuevo',
      authUserId: 'auth-new-admin',
      username: 'nuevoadmin',
      nombre: 'Nuevo Admin',
      role: Role.ADMIN,
    });
    expect(resultado).toEqual(creado);
  });

  it('rechaza si gymId es el reservado para SUPER_ADMIN', async () => {
    await expect(
      useCase.execute({
        gymId: PLATFORM_PSEUDO_GYM_ID,
        username: 'x',
        nombre: 'X',
        password: 'segura123',
      }),
    ).rejects.toThrow(ReservedGymIdError);
    expect(authProvider.createStaffUser).not.toHaveBeenCalled();
  });

  it('si falla la fila en Prisma, compensa borrando el usuario de Supabase Auth', async () => {
    authProvider.createStaffUser.mockResolvedValue({ authUserId: 'auth-huerfano' });
    userRepository.create.mockRejectedValue(new Error('username duplicado'));

    await expect(
      useCase.execute({ gymId: 'gym-nuevo', username: 'x', nombre: 'X', password: 'segura123' }),
    ).rejects.toThrow('username duplicado');
    expect(authProvider.deleteAuthUser).toHaveBeenCalledWith('auth-huerfano');
  });
});
```

Run: `cd apps/api && npx jest super-admin/application/create-admin.use-case.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `CreateAdminUseCase`**

`apps/api/src/super-admin/application/create-admin.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../identity/domain/role';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
  UserRecord,
} from '../../identity/application/ports/user-repository.port';
import {
  AUTH_PROVIDER,
  AuthProviderPort,
} from '../../identity/application/ports/auth-provider.port';
import { PLATFORM_PSEUDO_GYM_ID } from '../../identity/infrastructure/auth/synthetic-credentials';
import { ReservedGymIdError } from './errors/reserved-gym-id.error';

export interface CreateAdminInput {
  gymId: string;
  username: string;
  nombre: string;
  password: string;
}

/**
 * Único camino HTTP para crear un ADMIN (antes solo existía el script
 * `prisma/seed-admin.ts`, corrido a mano). No valida el gymId contra
 * ningún catálogo (no hay tabla Gym) — el SUPER_ADMIN lo escribe a mano;
 * este ADMIN nuevo propaga ese mismo gymId a todo lo que cree después.
 */
@Injectable()
export class CreateAdminUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProviderPort,
  ) {}

  async execute(input: CreateAdminInput): Promise<UserRecord> {
    if (input.gymId === PLATFORM_PSEUDO_GYM_ID) {
      throw new ReservedGymIdError(input.gymId);
    }

    const { authUserId } = await this.authProvider.createStaffUser(
      input.gymId,
      input.username,
      input.password,
    );

    try {
      return await this.userRepository.create({
        gymId: input.gymId,
        authUserId,
        username: input.username,
        nombre: input.nombre,
        role: Role.ADMIN,
      });
    } catch (error) {
      try {
        await this.authProvider.deleteAuthUser(authUserId);
      } catch {
        // Swallow: la compensación es best-effort, el error original manda.
      }
      throw error;
    }
  }
}
```

Run: `cd apps/api && npx jest super-admin/application/create-admin.use-case.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 4: `ListAdminsUseCase`**

`apps/api/src/super-admin/application/list-admins.use-case.ts` (sin test unitario dedicado — trivial, se cubre en el e2e del Step 8):

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared-kernel/prisma.service';
import { UserRecord } from '../../identity/application/ports/user-repository.port';
import { Role as PrismaRole } from '@prisma/client';
import { Role } from '../../identity/domain/role';

/**
 * Único caso de uso de este módulo que no pasa por `UserRepositoryPort`:
 * ese puerto está diseñado para consultas gym-scoped (`findByGymId`
 * exige un gymId). Listar TODOS los ADMIN de TODOS los gyms es
 * exclusivo de SUPER_ADMIN — no tiene sentido forzarlo al puerto
 * existente, así que este caso de uso habla con Prisma directo.
 */
@Injectable()
export class ListAdminsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(): Promise<UserRecord[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: PrismaRole.ADMIN },
      orderBy: [{ gymId: 'asc' }, { nombre: 'asc' }],
    });
    return admins.map((u) => ({
      id: u.id,
      authUserId: u.authUserId,
      gymId: u.gymId,
      username: u.username,
      nombre: u.nombre,
      role: u.role as unknown as Role,
      activo: u.activo,
    }));
  }
}
```

- [ ] **Step 5: Test de `EditAdminUseCase` (falla primero)**

`apps/api/src/super-admin/application/edit-admin.use-case.spec.ts`:

```typescript
import { Role } from '../../identity/domain/role';
import { EditAdminUseCase } from './edit-admin.use-case';
import { AuthProviderPort } from '../../identity/application/ports/auth-provider.port';
import {
  UserRepositoryPort,
  UserRecord,
} from '../../identity/application/ports/user-repository.port';
import { UserNotFoundError } from '../../identity/application/errors/user-not-found.error';

describe('EditAdminUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let authProvider: jest.Mocked<AuthProviderPort>;
  let useCase: EditAdminUseCase;

  const adminDeCualquierGym: UserRecord = {
    id: 'admin-1',
    authUserId: 'auth-admin',
    gymId: 'gym-lejano',
    username: 'admin1',
    nombre: 'Admin',
    role: Role.ADMIN,
    activo: true,
  };
  const noAdmin: UserRecord = { ...adminDeCualquierGym, id: 'prof-1', role: Role.PROFESOR };

  beforeEach(() => {
    userRepository = {
      findByAuthUserId: jest.fn(),
      findByGymIdAndUsername: jest.fn(),
      findByGymId: jest.fn(),
      findById: jest.fn(),
      deactivate: jest.fn(),
      create: jest.fn(),
      updateNombre: jest.fn(),
    };
    authProvider = {
      createStaffUser: jest.fn(),
      createAlumnoUser: jest.fn(),
      signInStaff: jest.fn(),
      signInAlumno: jest.fn(),
      refreshSession: jest.fn(),
      deleteAuthUser: jest.fn(),
      updateStaffPassword: jest.fn(),
    };
    useCase = new EditAdminUseCase(userRepository, authProvider);
  });

  it('edita nombre y password de un ADMIN de cualquier gym (sin restricción de gym)', async () => {
    userRepository.findById.mockResolvedValue(adminDeCualquierGym);
    userRepository.updateNombre.mockResolvedValue({ ...adminDeCualquierGym, nombre: 'Nuevo' });

    const resultado = await useCase.execute({
      adminId: adminDeCualquierGym.id,
      nombre: 'Nuevo',
      password: 'nueva-pass-123',
    });

    expect(userRepository.updateNombre).toHaveBeenCalledWith(adminDeCualquierGym.id, 'Nuevo');
    expect(authProvider.updateStaffPassword).toHaveBeenCalledWith(
      adminDeCualquierGym.authUserId,
      'nueva-pass-123',
    );
    expect(resultado.nombre).toBe('Nuevo');
  });

  it('rechaza si el id no corresponde a un ADMIN', async () => {
    userRepository.findById.mockResolvedValue(noAdmin);

    await expect(useCase.execute({ adminId: noAdmin.id, nombre: 'X' })).rejects.toThrow(
      UserNotFoundError,
    );
  });

  it('rechaza si el id no existe', async () => {
    userRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute({ adminId: 'no-existe', nombre: 'X' })).rejects.toThrow(
      UserNotFoundError,
    );
  });
});
```

Run: `cd apps/api && npx jest super-admin/application/edit-admin.use-case.spec.ts`
Expected: FAIL.

- [ ] **Step 6: Implementar `EditAdminUseCase`**

`apps/api/src/super-admin/application/edit-admin.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../identity/domain/role';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
  UserRecord,
} from '../../identity/application/ports/user-repository.port';
import {
  AUTH_PROVIDER,
  AuthProviderPort,
} from '../../identity/application/ports/auth-provider.port';
import { UserNotFoundError } from '../../identity/application/errors/user-not-found.error';

export interface EditAdminInput {
  adminId: string;
  nombre?: string;
  password?: string;
}

/**
 * Mismo contrato que EditUserUseCase (identity/), pero sin restricción
 * de gym — SUPER_ADMIN edita cualquier ADMIN de cualquier gym. No hay
 * "cannot target admin" acá: esa restricción es justo lo que este caso
 * de uso existe para saltear, de forma controlada y gateada por rol.
 */
@Injectable()
export class EditAdminUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProviderPort,
  ) {}

  async execute(input: EditAdminInput): Promise<UserRecord> {
    const objetivo = await this.userRepository.findById(input.adminId);
    if (!objetivo || objetivo.role !== Role.ADMIN) {
      throw new UserNotFoundError(input.adminId);
    }

    let actualizado = objetivo;
    if (input.nombre !== undefined) {
      actualizado = await this.userRepository.updateNombre(objetivo.id, input.nombre);
    }
    if (input.password !== undefined) {
      await this.authProvider.updateStaffPassword(objetivo.authUserId, input.password);
    }
    return actualizado;
  }
}
```

Run: `cd apps/api && npx jest super-admin/application/edit-admin.use-case.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: DTO de creación + controller**

`apps/api/src/super-admin/infrastructure/http/dto/create-admin.dto.ts`:

```typescript
import { IsString, Matches, MinLength } from 'class-validator';

export class CreateAdminDto {
  @IsString()
  @MinLength(1)
  gymId!: string;

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

`apps/api/src/super-admin/infrastructure/http/super-admin.controller.ts`:

```typescript
import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../../../identity/infrastructure/decorators/roles.decorator';
import { Role } from '../../../identity/domain/role';
import { CreateAdminUseCase } from '../../application/create-admin.use-case';
import { ListAdminsUseCase } from '../../application/list-admins.use-case';
import { EditAdminUseCase } from '../../application/edit-admin.use-case';
import { CreateAdminDto } from './dto/create-admin.dto';
import { EditUserDto } from '../../../identity/infrastructure/http/dto/edit-user.dto';
import { toUserResponse } from '../../../identity/infrastructure/http/user-response.mapper';

@Controller('super-admin/admins')
@Roles(Role.SUPER_ADMIN)
export class SuperAdminController {
  constructor(
    private readonly createAdminUseCase: CreateAdminUseCase,
    private readonly listAdminsUseCase: ListAdminsUseCase,
    private readonly editAdminUseCase: EditAdminUseCase,
  ) {}

  @Post()
  async create(@Body() dto: CreateAdminDto) {
    const admin = await this.createAdminUseCase.execute(dto);
    return toUserResponse(admin);
  }

  @Get()
  async list() {
    const admins = await this.listAdminsUseCase.execute();
    return admins.map(toUserResponse);
  }

  @Patch(':id')
  async edit(@Param('id') id: string, @Body() dto: EditUserDto) {
    if (dto.nombre === undefined && dto.password === undefined) {
      throw new BadRequestException('Mandá al menos uno de: nombre, password.');
    }
    const admin = await this.editAdminUseCase.execute({
      adminId: id,
      nombre: dto.nombre,
      password: dto.password,
    });
    return toUserResponse(admin);
  }
}
```

- [ ] **Step 8: Módulo + wiring en `AppModule`**

`apps/api/src/super-admin/super-admin.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { PrismaModule } from '../shared-kernel/prisma.module';
import { CreateAdminUseCase } from './application/create-admin.use-case';
import { ListAdminsUseCase } from './application/list-admins.use-case';
import { EditAdminUseCase } from './application/edit-admin.use-case';
import { SuperAdminController } from './infrastructure/http/super-admin.controller';

@Module({
  imports: [IdentityModule, PrismaModule],
  controllers: [SuperAdminController],
  providers: [CreateAdminUseCase, ListAdminsUseCase, EditAdminUseCase],
})
export class SuperAdminModule {}
```

`apps/api/src/app.module.ts` — agregar `SuperAdminModule` al array de `imports`.

- [ ] **Step 9: e2e test del controller (falla primero, luego pasa)**

`apps/api/src/super-admin/infrastructure/http/super-admin.controller.e2e.spec.ts` — mismo scaffolding que Task 4 (JWKS local, `signTestToken`), montando `SuperAdminController` con `CreateAdminUseCase`/`ListAdminsUseCase`/`EditAdminUseCase` reales, `USER_REPOSITORY`/`AUTH_PROVIDER` fakeados y `PrismaService` fakeado (lo usa `ListAdminsUseCase` directo, ver Task 6 Step 4):

```typescript
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { SuperAdminController } from './super-admin.controller';
import { CreateAdminUseCase } from '../../application/create-admin.use-case';
import { ListAdminsUseCase } from '../../application/list-admins.use-case';
import { EditAdminUseCase } from '../../application/edit-admin.use-case';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
  UserRecord,
} from '../../../identity/application/ports/user-repository.port';
import {
  AUTH_PROVIDER,
  AuthProviderPort,
} from '../../../identity/application/ports/auth-provider.port';
import { JwtAuthGuard } from '../../../identity/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../../identity/infrastructure/guards/roles.guard';
import { GymScopeGuard } from '../../../identity/infrastructure/guards/gym-scope.guard';
import { Role } from '../../../identity/domain/role';
import { DomainExceptionFilter } from '../../../shared-kernel/domain-exception.filter';
import {
  buildTestJwtKeys,
  signTestToken,
  TestJwtKeys,
} from '../../../identity/infrastructure/guards/testing/jwt-test-support';

jest.mock('jose', () => {
  const actual = jest.requireActual('jose');
  return { ...actual, createRemoteJWKSet: jest.fn() };
});
const { createRemoteJWKSet: mockCreateRemoteJWKSet } = jest.requireMock('jose') as {
  createRemoteJWKSet: jest.Mock;
};

describe('/super-admin/admins (e2e)', () => {
  let app: INestApplication;
  let claves: TestJwtKeys;

  const superAdmin: UserRecord = {
    id: 'sa-1',
    authUserId: 'auth-sa',
    gymId: null,
    username: 'root',
    nombre: 'Root',
    role: Role.SUPER_ADMIN,
    activo: true,
  };
  const adminNormal: UserRecord = {
    id: 'admin-1',
    authUserId: 'auth-admin',
    gymId: 'gym-A',
    username: 'admin1',
    nombre: 'Admin',
    role: Role.ADMIN,
    activo: true,
  };
  const adminsExistentes = [
    {
      id: 'admin-1',
      authUserId: 'auth-admin',
      gymId: 'gym-A',
      username: 'admin1',
      nombre: 'Admin',
      role: Role.ADMIN,
      activo: true,
    },
    {
      id: 'admin-2',
      authUserId: 'auth-admin2',
      gymId: 'gym-B',
      username: 'admin2',
      nombre: 'Admin Dos',
      role: Role.ADMIN,
      activo: true,
    },
  ];

  const usuariosPorAuthId: Record<string, UserRecord> = {
    'auth-sa': superAdmin,
    'auth-admin': adminNormal,
  };

  const fakeUserRepository: Partial<UserRepositoryPort> = {
    findByAuthUserId: async (authUserId: string) => usuariosPorAuthId[authUserId] ?? null,
    create: async (data) => ({ id: 'admin-nuevo', activo: true, ...data }),
  };
  const fakeAuthProvider: Partial<AuthProviderPort> = {
    createStaffUser: async () => ({ authUserId: 'auth-nuevo-admin' }),
  };
  const fakePrisma = { user: { findMany: jest.fn().mockResolvedValue(adminsExistentes) } };

  beforeAll(async () => {
    claves = await buildTestJwtKeys();
    mockCreateRemoteJWKSet.mockReturnValue(claves.jwks);
    process.env.SUPABASE_URL = 'https://e2e-super-admin-test.supabase.co';

    const moduleRef = await Test.createTestingModule({
      controllers: [SuperAdminController],
      providers: [
        CreateAdminUseCase,
        ListAdminsUseCase,
        EditAdminUseCase,
        { provide: USER_REPOSITORY, useValue: fakeUserRepository },
        { provide: AUTH_PROVIDER, useValue: fakeAuthProvider },
        { provide: PrismaService, useValue: fakePrisma },
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

  async function tokenPara(sub: string) {
    return signTestToken(claves.privateKey, { issuer: `${process.env.SUPABASE_URL}/auth/v1`, sub });
  }

  it('SUPER_ADMIN crea un ADMIN nuevo', async () => {
    const token = await tokenPara('auth-sa');
    const res = await request(app.getHttpServer())
      .post('/super-admin/admins')
      .set('Authorization', `Bearer ${token}`)
      .send({
        gymId: 'gym-nuevo',
        username: 'nuevoadmin',
        nombre: 'Nuevo Admin',
        password: 'segura123',
      });

    expect(res.status).toBe(201);
    expect(res.body.gymId).toBe('gym-nuevo');
  });

  it('un ADMIN normal no puede llamar a /super-admin/admins', async () => {
    const token = await tokenPara('auth-admin');
    const res = await request(app.getHttpServer())
      .get('/super-admin/admins')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('GET /super-admin/admins devuelve admins de distintos gyms', async () => {
    const token = await tokenPara('auth-sa');
    const res = await request(app.getHttpServer())
      .get('/super-admin/admins')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.map((a: { gymId: string }) => a.gymId)).toEqual(['gym-A', 'gym-B']);
  });
});
```

Run: `cd apps/api && npx jest super-admin.controller.e2e.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 10: Test suite completa**

Run: `cd apps/api && npm test`
Expected: todo en verde.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/super-admin apps/api/src/app.module.ts
git commit -m "feat(super-admin): modulo nuevo — crear/listar/editar cuentas ADMIN"
```

---

### Task 7: Bootstrap del primer SUPER_ADMIN (script one-off)

**Files:**

- Create: `apps/api/prisma/seed-super-admin.ts`
- Modify: `apps/api/package.json`

**Interfaces:**

- Consumes: `SupabaseAdminAuthProvider`, `PLATFORM_PSEUDO_GYM_ID` (Task 2), `Role.SUPER_ADMIN` (Task 1).

- [ ] **Step 1: Script**

`apps/api/prisma/seed-super-admin.ts` (mismo patrón que `seed-admin.ts` — idempotente, valida antes de escribir, compensa si Prisma falla):

```typescript
import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { SupabaseAdminAuthProvider } from '../src/identity/infrastructure/auth/supabase-admin-auth.provider';
import { PLATFORM_PSEUDO_GYM_ID } from '../src/identity/infrastructure/auth/synthetic-credentials';

const prisma = new PrismaClient();
const REGEX_USERNAME = /^[a-z0-9._-]+$/;

/**
 * Bootstrap del primer SUPER_ADMIN — mismo problema huevo-gallina que
 * seed-admin.ts para el primer ADMIN: `CreateAdminUseCase` (super-admin/)
 * exige ya estar autenticado como SUPER_ADMIN, así que el primero solo
 * puede nacer acá, fuera de la app.
 *
 * Uso:
 *   SEED_SUPER_ADMIN_USERNAME=root \
 *   SEED_SUPER_ADMIN_NOMBRE="Fernando Benitez" \
 *   SEED_SUPER_ADMIN_PASSWORD="una-password-real-de-verdad" \
 *   pnpm seed:super-admin
 */
async function main() {
  const username = requireEnv('SEED_SUPER_ADMIN_USERNAME');
  const nombre = requireEnv('SEED_SUPER_ADMIN_NOMBRE');
  const password = requireEnv('SEED_SUPER_ADMIN_PASSWORD');

  if (!REGEX_USERNAME.test(username)) {
    throw new Error(
      `SEED_SUPER_ADMIN_USERNAME inválido: solo minúsculas, números, '.', '_' y '-' (recibido: "${username}")`,
    );
  }
  if (password.length < 6) {
    throw new Error('SEED_SUPER_ADMIN_PASSWORD debe tener al menos 6 caracteres');
  }

  const yaExiste = await prisma.user.findFirst({ where: { role: Role.SUPER_ADMIN, username } });
  if (yaExiste) {
    console.log(`Ya existe un SUPER_ADMIN con username="${username}" — no se crea otro.`);
    return;
  }

  const provider = new SupabaseAdminAuthProvider();
  const { authUserId } = await provider.createStaffUser(PLATFORM_PSEUDO_GYM_ID, username, password);

  try {
    await prisma.user.create({
      data: { gymId: null, authUserId, username, nombre, role: Role.SUPER_ADMIN },
    });
  } catch (error) {
    await provider.deleteAuthUser(authUserId).catch(() => {
      console.error(
        `Además falló la compensación: quedó un usuario huérfano en Supabase Auth (authUserId=${authUserId}) — borralo a mano.`,
      );
    });
    throw error;
  }

  console.log(`SUPER_ADMIN creado: username="${username}".`);
  console.log('Guardá el username y la password reales en un lugar seguro — no quedan acá.');
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name} (ver el encabezado de prisma/seed-super-admin.ts)`,
    );
  }
  return value;
}

main()
  .catch((error) => {
    console.error('Error corriendo el seed del SUPER_ADMIN:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Script de npm**

`apps/api/package.json`, agregar junto a `"seed:admin"`:

```json
    "seed:super-admin": "tsx prisma/seed-super-admin.ts"
```

- [ ] **Step 3: Verificar que compila**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/seed-super-admin.ts apps/api/package.json
git commit -m "feat(super-admin): script de bootstrap del primer SUPER_ADMIN"
```

---

### Task 8 (frontend): Editar usuario — formulario reusable + wiring en `/admin` y `/profesor`

**Files:**

- Create: `apps/web/components/edit-user-form.tsx`
- Modify: `apps/web/app/(admin)/admin/actions.ts`
- Modify: `apps/web/app/(admin)/admin/users-list.tsx`
- Modify: `apps/web/app/(profesor)/profesor/actions.ts`
- Modify: `apps/web/app/(profesor)/profesor/page.tsx`

**Interfaces:**

- Consumes: `PATCH /users/:id` (Task 4).

- [ ] **Step 1: Server action de edición (admin)**

`apps/web/app/(admin)/admin/actions.ts` — agregar al final:

```typescript
export interface EditUserActionState {
  error: string | null;
  success: boolean;
}

export async function editUserAction(
  userId: string,
  _prevState: EditUserActionState,
  formData: FormData,
): Promise<EditUserActionState> {
  const nombreRaw = formData.get('nombre');
  const passwordRaw = formData.get('password');
  const nombre = nombreRaw ? String(nombreRaw).trim() : undefined;
  const password = passwordRaw ? String(passwordRaw) : undefined;

  if (!nombre && !password) {
    return { error: 'Cambiá el nombre o la contraseña.', success: false };
  }

  try {
    await apiFetch(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...(nombre ? { nombre } : {}), ...(password ? { password } : {}) }),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message, success: false };
    }
    return { error: 'Error inesperado editando el usuario.', success: false };
  }

  revalidatePath('/admin');
  return { error: null, success: true };
}
```

- [ ] **Step 2: Componente reusable `EditUserForm`**

`apps/web/components/edit-user-form.tsx`:

```typescript
'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { PrimaryButton } from './ui/primary-button';

export interface EditUserActionState {
  error: string | null;
  success: boolean;
}

const ESTADO_INICIAL: EditUserActionState = { error: null, success: false };

const INPUT_CLASSES =
  'min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted focus:border-accent focus:outline-none lg:min-h-9 lg:text-sm';

function BotonGuardar() {
  const { pending } = useFormStatus();
  return (
    <PrimaryButton type="submit" size="sm" disabled={pending}>
      {pending ? 'Guardando...' : 'Guardar'}
    </PrimaryButton>
  );
}

/**
 * Reusado por /admin (nombre + password si `permitePassword`) y
 * /profesor (solo nombre, `permitePassword={false}` — el backend
 * rechazaría igual una password para un ALUMNO, pero no tiene sentido
 * mostrar el campo).
 */
export function EditUserForm({
  action,
  nombreActual,
  permitePassword,
  onCerrar,
}: {
  action: (prevState: EditUserActionState, formData: FormData) => Promise<EditUserActionState>;
  nombreActual: string;
  permitePassword: boolean;
  onCerrar: () => void;
}) {
  const [estado, formAction] = useActionState(action, ESTADO_INICIAL);
  const [nombre, setNombre] = useState(nombreActual);

  return (
    <form action={formAction} className="mt-2 flex flex-col gap-2 rounded-lg border border-border p-3">
      <input
        name="nombre"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre"
        minLength={2}
        className={INPUT_CLASSES}
      />
      {permitePassword && (
        <input
          name="password"
          type="password"
          placeholder="Nueva contraseña (dejalo vacío para no cambiarla)"
          minLength={6}
          className={INPUT_CLASSES}
        />
      )}
      <div className="flex gap-2">
        <BotonGuardar />
        <button
          type="button"
          onClick={onCerrar}
          className="min-h-11 rounded-lg border border-border px-4 text-sm text-text-muted lg:min-h-9"
        >
          Cancelar
        </button>
      </div>
      {estado.error && (
        <p role="alert" className="text-sm text-danger">
          {estado.error}
        </p>
      )}
      {estado.success && <p className="text-sm text-success">Guardado.</p>}
    </form>
  );
}
```

- [ ] **Step 3: Wiring en `UsersList` (admin)**

`apps/web/app/(admin)/admin/users-list.tsx` — agregar `import { EditUserForm } from '../../../components/edit-user-form';` y `import { editUserAction } from './actions';`, más un estado `usuarioAEditar` (similar a `usuarioAEliminar`) y un botón "Editar" junto a "Desactivar"/"Eliminar" (visible solo si `u.role !== 'ADMIN'`, ya que un ADMIN nunca es editable por esta vía):

```typescript
  const [usuarioAEditar, setUsuarioAEditar] = useState<UserRow | null>(null);

  function BotonEditar({ u, className = '' }: { u: UserRow; className?: string }) {
    if (u.role === 'ADMIN') return null;
    return (
      <button
        onClick={() => setUsuarioAEditar(usuarioAEditar?.id === u.id ? null : u)}
        className={`min-h-11 rounded-lg border border-border px-4 text-sm font-medium text-text lg:min-h-9 ${className}`}
      >
        Editar
      </button>
    );
  }
```

Y en el render de cada fila (mobile y desktop), junto a `<BotonDesactivar u={u} />`:

```tsx
<BotonEditar u={u} className="flex-1" />
```

Debajo de esos botones (dentro del mismo `<li>`/`<td>`, condicionalmente):

```tsx
{
  usuarioAEditar?.id === u.id && (
    <EditUserForm
      action={editUserAction.bind(null, u.id)}
      nombreActual={u.nombre}
      permitePassword={u.role === 'PROFESOR'}
      onCerrar={() => setUsuarioAEditar(null)}
    />
  );
}
```

- [ ] **Step 4: Server action de edición (profesor)**

`apps/web/app/(profesor)/profesor/actions.ts` — agregar la misma función `editUserAction` que en el Step 1, pero con `revalidatePath('/profesor')` en vez de `/admin`.

- [ ] **Step 5: Wiring en `/profesor` (lista de alumnos)**

Cada fila de alumno necesita estado local (toggle de edición) — `page.tsx` es un Server Component, así que la fila se extrae a un Client Component nuevo.

`apps/web/app/(profesor)/profesor/alumno-row.tsx`:

```typescript
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { EditUserForm } from '../../../components/edit-user-form';
import { editUserAction } from './actions';

interface AlumnoRow {
  id: string;
  nombre: string;
  username: string;
  activo: boolean;
}

export function AlumnoRow({ alumno }: { alumno: AlumnoRow }) {
  const [editando, setEditando] = useState(false);

  return (
    <li>
      <div className="flex min-h-11 items-center justify-between rounded-lg border border-border bg-surface px-4 py-2">
        <Link href={`/profesor/alumnos/${alumno.id}`} className="flex-1">
          <p className="text-sm font-medium text-text">{alumno.nombre}</p>
          <p className="text-xs text-text-muted">@{alumno.username}</p>
        </Link>
        <div className="flex items-center gap-2">
          {!alumno.activo && (
            <span className="rounded-full bg-surface-alt px-2.5 py-1 text-xs font-medium text-text-muted">
              Inactivo
            </span>
          )}
          <button
            onClick={() => setEditando(!editando)}
            className="min-h-11 rounded-lg border border-border px-3 text-sm font-medium text-text lg:min-h-9"
          >
            Editar
          </button>
        </div>
      </div>
      {editando && (
        <EditUserForm
          action={editUserAction.bind(null, alumno.id)}
          nombreActual={alumno.nombre}
          permitePassword={false}
          onCerrar={() => setEditando(false)}
        />
      )}
    </li>
  );
}
```

`apps/web/app/(profesor)/profesor/page.tsx` — reemplazar el `<li>` inline por el componente nuevo:

```typescript
import Link from 'next/link';
import { apiFetch } from '../../../lib/api-client';
import { PageHeader } from '../../../components/ui/page-header';
import { LogoutButton } from '../../../components/logout-button';
import { CreateAlumnoForm } from './create-alumno-form';
import { AlumnoRow } from './alumno-row';

interface AlumnoRowData {
  id: string;
  nombre: string;
  username: string;
  activo: boolean;
}

export default async function ProfesorDashboardPage() {
  const alumnos = await apiFetch<AlumnoRowData[]>('/users/me/alumnos');

  return (
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-16">
      <PageHeader title="Mi cartera" right={<LogoutButton />} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-muted">Nuevo alumno</h2>
        <CreateAlumnoForm />
      </section>

      <ul className="flex flex-col gap-2">
        {alumnos.map((alumno) => (
          <AlumnoRow key={alumno.id} alumno={alumno} />
        ))}
        {alumnos.length === 0 && (
          <p className="text-sm text-text-muted">
            Todavía no tenés alumnos — creá uno arriba o pedile al Admin que te asigne alguno.
          </p>
        )}
      </ul>
    </main>
  );
}
```

- [ ] **Step 6: Build y tests**

Run: `cd apps/web && npx next build`
Expected: build limpio.

Run: `cd apps/web && npm test`
Expected: todo en verde.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/edit-user-form.tsx apps/web/app/\(admin\)/admin apps/web/app/\(profesor\)/profesor
git commit -m "feat(web): editar nombre/password de usuarios desde /admin y /profesor"
```

---

### Task 9 (frontend): Login de SUPER_ADMIN

**Files:**

- Create: `apps/web/app/super-admin/login/page.tsx`
- Create: `apps/web/app/super-admin/login/actions.ts`

**Interfaces:**

- Consumes: `POST /auth/super-admin/login` (Task 5).

- [ ] **Step 1: Server action**

`apps/web/app/super-admin/login/actions.ts` (mismo patrón que `apps/web/app/login/actions.ts`, sin `gymId`, redirige a `/super-admin` directo):

```typescript
'use server';

import { redirect } from 'next/navigation';
import { createWritableSupabaseServerClient } from '../../../lib/session-writable';

export interface SuperAdminLoginActionState {
  error: string | null;
}

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';

export async function superAdminLoginAction(
  _prevState: SuperAdminLoginActionState,
  formData: FormData,
): Promise<SuperAdminLoginActionState> {
  const username = String(formData.get('username') ?? '');
  const password = String(formData.get('password') ?? '');

  const response = await fetch(`${API_BASE_URL}/auth/super-admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    cache: 'no-store',
  });

  if (!response.ok) {
    return { error: 'Usuario o contraseña incorrectos.' };
  }

  const { accessToken, refreshToken } = await response.json();
  const supabase = await createWritableSupabaseServerClient();
  await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });

  redirect('/super-admin');
}
```

- [ ] **Step 2: Página**

`apps/web/app/super-admin/login/page.tsx` (mismo layout visual que `apps/web/app/login/page.tsx`, sin el input oculto de `gymId` ni el mensaje de sesión expirada):

```typescript
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { superAdminLoginAction, SuperAdminLoginActionState } from './actions';
import { PrimaryButton } from '../../../components/ui/primary-button';

const ESTADO_INICIAL: SuperAdminLoginActionState = { error: null };

function BotonIngresar() {
  const { pending } = useFormStatus();
  return (
    <PrimaryButton type="submit" disabled={pending} className="active:opacity-90">
      {pending ? 'Ingresando...' : 'Ingresar'}
    </PrimaryButton>
  );
}

export default function SuperAdminLoginPage() {
  const [estado, formAction] = useActionState(superAdminLoginAction, ESTADO_INICIAL);

  return (
    <main className="flex min-h-dvh flex-col justify-end bg-surface px-6 pb-10 pt-8 lg:items-center lg:justify-center lg:px-4 lg:py-8">
      <div className="lg:w-full lg:max-w-sm lg:rounded-2xl lg:border lg:border-border lg:bg-surface-alt lg:p-8">
        <h1 className="mb-6 text-2xl font-semibold text-text lg:text-xl">Super Admin</h1>
        <form action={formAction} className="flex flex-col gap-4">
          <input
            name="username"
            placeholder="Usuario"
            required
            className="min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted focus:border-accent focus:outline-none lg:min-h-9 lg:text-sm"
          />
          <input
            name="password"
            type="password"
            placeholder="Contraseña"
            required
            className="min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted focus:border-accent focus:outline-none lg:min-h-9 lg:text-sm"
          />
          <BotonIngresar />
          {estado.error && (
            <p role="alert" className="text-sm text-danger">
              {estado.error}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Build**

Run: `cd apps/web && npx next build`
Expected: build limpio, ruta `/super-admin/login` listada.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/super-admin
git commit -m "feat(web): pantalla de login para SUPER_ADMIN"
```

---

### Task 10 (frontend): Dashboard de SUPER_ADMIN

**Files:**

- Create: `apps/web/app/(super-admin)/layout.tsx`
- Create: `apps/web/app/(super-admin)/super-admin/page.tsx`
- Create: `apps/web/app/(super-admin)/super-admin/actions.ts`
- Create: `apps/web/app/(super-admin)/super-admin/create-admin-form.tsx`
- Create: `apps/web/app/(super-admin)/super-admin/admins-list.tsx`
- Modify: `apps/web/lib/logout-action.ts`
- Modify: `apps/web/components/logout-button.tsx`

**Interfaces:**

- Consumes: `GET/POST /super-admin/admins`, `PATCH /super-admin/admins/:id` (Task 6), `EditUserForm` (Task 8).

- [ ] **Step 1: `logoutAction` acepta un destino opcional**

`apps/web/lib/logout-action.ts` — agregar un parámetro opcional (SUPER_ADMIN debe volver a `/super-admin/login`, no a `/login`):

```typescript
export async function logoutAction(redirectTo: string = '/login'): Promise<void> {
  const supabase = await createWritableSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(redirectTo);
}
```

`apps/web/components/logout-button.tsx` — aceptar un prop `redirectTo` y pasarlo bindeado a la Server Action:

```typescript
import { LogOut } from 'lucide-react';
import { logoutAction } from '../lib/logout-action';

export function LogoutButton({ redirectTo = '/login' }: { redirectTo?: string }) {
  const accionConDestino = logoutAction.bind(null, redirectTo);
  return (
    <form action={accionConDestino}>
      <button
        type="submit"
        aria-label="Cerrar sesión"
        className="flex h-11 w-11 items-center justify-center rounded-full text-text active:bg-surface-alt lg:h-9 lg:w-9"
      >
        <LogOut size={20} aria-hidden />
      </button>
    </form>
  );
}
```

(Los 7 usos existentes de `<LogoutButton />` sin props siguen funcionando igual — `redirectTo` tiene default `/login`.)

- [ ] **Step 2: Layout con gate de rol**

`apps/web/app/(super-admin)/layout.tsx` (mismo patrón que `(admin)/layout.tsx`, pero exige `SUPER_ADMIN` y redirige a `/super-admin/login` si no hay sesión válida — no a `/login`):

```typescript
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api-client';

interface MeResponse {
  id: string;
  gymId: string | null;
  role: 'ADMIN' | 'PROFESOR' | 'ALUMNO' | 'SUPER_ADMIN';
}

export default async function SuperAdminLayout({ children }: { children: ReactNode }) {
  let me: MeResponse;
  try {
    me = await apiFetch<MeResponse>('/users/me');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/super-admin/login');
    }
    throw error;
  }

  if (me.role !== 'SUPER_ADMIN') {
    redirect('/super-admin/login');
  }

  return <>{children}</>;
}
```

- [ ] **Step 3: Server actions del dashboard**

`apps/web/app/(super-admin)/super-admin/actions.ts`:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from '../../../lib/api-client';

export interface CreateAdminActionState {
  error: string | null;
  success: boolean;
}

export async function createAdminAction(
  _prevState: CreateAdminActionState,
  formData: FormData,
): Promise<CreateAdminActionState> {
  const gymId = String(formData.get('gymId') ?? '');
  const username = String(formData.get('username') ?? '');
  const nombre = String(formData.get('nombre') ?? '');
  const password = String(formData.get('password') ?? '');

  try {
    await apiFetch('/super-admin/admins', {
      method: 'POST',
      body: JSON.stringify({ gymId, username, nombre, password }),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message, success: false };
    }
    return { error: 'Error inesperado creando el admin.', success: false };
  }

  revalidatePath('/super-admin');
  return { error: null, success: true };
}

export interface EditAdminActionState {
  error: string | null;
  success: boolean;
}

export async function editAdminAction(
  adminId: string,
  _prevState: EditAdminActionState,
  formData: FormData,
): Promise<EditAdminActionState> {
  const nombreRaw = formData.get('nombre');
  const passwordRaw = formData.get('password');
  const nombre = nombreRaw ? String(nombreRaw).trim() : undefined;
  const password = passwordRaw ? String(passwordRaw) : undefined;

  if (!nombre && !password) {
    return { error: 'Cambiá el nombre o la contraseña.', success: false };
  }

  try {
    await apiFetch(`/super-admin/admins/${adminId}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...(nombre ? { nombre } : {}), ...(password ? { password } : {}) }),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message, success: false };
    }
    return { error: 'Error inesperado editando el admin.', success: false };
  }

  revalidatePath('/super-admin');
  return { error: null, success: true };
}
```

- [ ] **Step 4: Formulario de alta**

`apps/web/app/(super-admin)/super-admin/create-admin-form.tsx` (mismo patrón que `CreateProfesorForm`, con un campo `gymId` extra):

```typescript
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createAdminAction, CreateAdminActionState } from './actions';
import { PrimaryButton } from '../../../components/ui/primary-button';

const ESTADO_INICIAL: CreateAdminActionState = { error: null, success: false };

const INPUT_CLASSES =
  'min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted focus:border-accent focus:outline-none lg:min-h-9 lg:text-sm';

function BotonCrear() {
  const { pending } = useFormStatus();
  return (
    <PrimaryButton type="submit" disabled={pending}>
      {pending ? 'Creando...' : 'Crear admin'}
    </PrimaryButton>
  );
}

export function CreateAdminForm({ gymIdsExistentes }: { gymIdsExistentes: string[] }) {
  const [estado, formAction] = useActionState(createAdminAction, ESTADO_INICIAL);

  return (
    <section className="rounded-2xl bg-surface p-4 shadow-sm sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-text">Nuevo admin</h2>
      <form action={formAction} className="flex flex-col gap-3">
        <input
          name="gymId"
          placeholder="gymId (nuevo o existente)"
          required
          list="gym-ids-existentes"
          className={INPUT_CLASSES}
        />
        <datalist id="gym-ids-existentes">
          {gymIdsExistentes.map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>
        <input name="username" placeholder="Usuario" required minLength={3} className={INPUT_CLASSES} />
        <input name="nombre" placeholder="Nombre" required minLength={2} className={INPUT_CLASSES} />
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
          <p role="alert" className="text-sm text-danger">
            {estado.error}
          </p>
        )}
        {estado.success && <p className="text-sm text-success">Admin creado.</p>}
      </form>
    </section>
  );
}
```

- [ ] **Step 5: Listado agrupado por gym**

`apps/web/app/(super-admin)/super-admin/admins-list.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { EditUserForm } from '../../../components/edit-user-form';
import { editAdminAction } from './actions';

interface AdminRow {
  id: string;
  gymId: string | null;
  username: string;
  nombre: string;
  activo: boolean;
}

export function AdminsList({ admins }: { admins: AdminRow[] }) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const porGym = new Map<string, AdminRow[]>();
  for (const admin of admins) {
    const clave = admin.gymId ?? '(sin gym)';
    porGym.set(clave, [...(porGym.get(clave) ?? []), admin]);
  }

  return (
    <section className="rounded-2xl bg-surface p-4 shadow-sm sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-text">Admins por gym</h2>
      <div className="flex flex-col gap-4">
        {[...porGym.entries()].map(([gymId, filas]) => (
          <div key={gymId}>
            <p className="mb-2 text-sm font-medium text-text-muted">{gymId}</p>
            <ul className="flex flex-col gap-2">
              {filas.map((admin) => (
                <li key={admin.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-text">{admin.nombre}</p>
                      <p className="text-xs text-text-muted">@{admin.username}</p>
                    </div>
                    <button
                      onClick={() => setEditandoId(editandoId === admin.id ? null : admin.id)}
                      className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium text-text lg:min-h-9"
                    >
                      Editar
                    </button>
                  </div>
                  {editandoId === admin.id && (
                    <EditUserForm
                      action={editAdminAction.bind(null, admin.id)}
                      nombreActual={admin.nombre}
                      permitePassword
                      onCerrar={() => setEditandoId(null)}
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {admins.length === 0 && <p className="text-sm text-text-muted">Todavía no hay admins.</p>}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Página del dashboard**

`apps/web/app/(super-admin)/super-admin/page.tsx`:

```typescript
import { apiFetch } from '../../../lib/api-client';
import { PageHeader } from '../../../components/ui/page-header';
import { LogoutButton } from '../../../components/logout-button';
import { CreateAdminForm } from './create-admin-form';
import { AdminsList } from './admins-list';

interface AdminRow {
  id: string;
  gymId: string | null;
  username: string;
  nombre: string;
  activo: boolean;
}

export default async function SuperAdminPage() {
  const admins = await apiFetch<AdminRow[]>('/super-admin/admins');
  const gymIdsExistentes = [...new Set(admins.map((a) => a.gymId).filter((id): id is string => id !== null))];

  return (
    <main className="min-h-dvh bg-surface px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-6 lg:pt-16">
      <div className="flex w-full flex-col gap-6 sm:mx-auto sm:max-w-3xl">
        <PageHeader title="Super Admin" right={<LogoutButton redirectTo="/super-admin/login" />} />
        <CreateAdminForm gymIdsExistentes={gymIdsExistentes} />
        <AdminsList admins={admins} />
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Build**

Run: `cd apps/web && npx next build`
Expected: build limpio, ruta `/super-admin` listada.

- [ ] **Step 8: Test suite completa (frontend)**

Run: `cd apps/web && npm test`
Expected: todo en verde.

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/\(super-admin\) apps/web/lib/logout-action.ts apps/web/components/logout-button.tsx
git commit -m "feat(web): dashboard de SUPER_ADMIN — crear/listar/editar admins"
```

---

## Nota para el revisor final

Después de la Task 10, correr una vez más `cd apps/api && npm test` y `cd apps/web && npm test` + `npx next build` con el árbol completo mergeado — cada task verificó incrementalmente, pero conviene una pasada de punta a punta antes de pedir el deploy manual de Render (este plan toca `apps/api` en casi todas las tasks).
