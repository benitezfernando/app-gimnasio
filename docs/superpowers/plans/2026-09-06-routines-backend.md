# Routines Backend + Hard-Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el backend completo del bounded context `Routines` (plantillas, instancias, clonado, autorización por cartera) y la eliminación definitiva (hard-delete) de usuarios y plantillas — cierra Fase 1 del roadmap del HLD.

**Architecture:** Dos puertos de repositorio separados en `routines` (`RoutineTemplateRepositoryPort` sin cartera, `RoutineInstanceRepositoryPort` con cartera vía `CarteraRepositoryPort.existe()` de 3A). El hard-delete resuelve el cruce `identity → routines` con inversión de dependencias: `identity` declara `RoutinesCleanupPort`, `routines` lo implementa. Todo backend, sin UI — ese es el Plan 2.

**Tech Stack:** NestJS + Prisma + class-validator (ya en el repo, sin dependencias nuevas).

## Global Constraints

- Bounded context: código nuevo bajo `apps/api/src/routines/`, salvo el puerto `RoutinesCleanupPort` que vive en `apps/api/src/identity/application/ports/` (lo declara identity, lo implementa routines — ver Tarea 4).
- Dirección de dependencias: `routines → identity` y `routines → exercise-catalog`. Nunca al revés — `identity` y `exercise-catalog` no importan nada de `routines`, salvo el módulo Nest de routines en `IdentityModule` para obtener el provider de `RoutinesCleanupPort` (import de módulo, no de repos internos).
- `RoutineTemplateRepositoryPort`: nunca valida cartera — es propiedad exclusiva del profesor que la creó.
- `RoutineInstanceRepositoryPort`: toda operación de creación/lectura/edición valida `CarteraRepositoryPort.existe(profesorId, alumnoId)` contra la cartera **vigente**, nunca contra `RoutineInstance.profesorId` (que es trazabilidad, inmutable salvo por hard-delete).
- Convención de autorización (HLD §4): recurso de otro gym o inexistente → 404 (`UserNotFoundError`/`RoutineTemplateNotFoundError`/`RoutineInstanceNotFoundError`); recurso del mismo gym fuera de una relación conocida (cartera) → 403 (`AlumnoNotInCarteraError`); rol insuficiente → 403 (`InsufficientRoleError`), resuelto antes que cualquier otra validación.
- Convención de hard-delete (HLD §3, nueva): todo borrado físico exige que el recurso esté previamente inactivo (`activo: false` / `activa: false`) — nunca desde el estado activo.
- Máximo 50 ejercicios por plantilla/instancia, validado en el DTO (`@ArrayMaxSize(50)`) y en el caso de uso cuando la lista no llega por DTO (clonado desde plantilla).
- Edición de ejercicios: replace-all transaccional (`PUT`, borra+reinserta en una `$transaction`), nunca operaciones granulares — el `@@unique([templateId, orden])` / `@@unique([instanceId, orden])` rompería con reordenamientos incrementales.
- `peso`: `Decimal? @db.Decimal(5,2)` en el schema, `number | null` en los puertos/DTOs — la conversión Decimal↔number vive exclusivamente en los repositorios Prisma.
- El puerto `RoutinesCleanupPort.eliminarDatosDe` recibe `tx: Prisma.TransactionClient` — fuga deliberada de infraestructura en una interfaz de application, documentada in-line, aceptada por el mismo criterio que la transacción de alta con cartera del Bloque 3A (no se construye un Unit of Work genérico para un solo caso de uso).
- Ningún test debe pasar por la conversión Decimal real de Prisma en un mock — los tests unitarios de casos de uso usan `number | null` directamente contra los puertos (mockeados), la conversión Decimal solo se ejercita en la Tarea 11 (verificación contra DB real).
- Nomenclatura y comentarios en español, mismo estilo que el resto del repo.

---

## Task 1: Migración de schema — `peso` + `profesorId`/`origenTemplateId` nullable

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_routines_peso_and_nullable_profesor/migration.sql` (generada por Prisma)

**Interfaces:**

- Consumes: nada de tareas anteriores.
- Produces: `RoutineTemplateExercise.peso`, `RoutineInstanceExercise.peso` (`Decimal? @db.Decimal(5,2)`); `RoutineInstance.profesorId` nullable con `onDelete: SetNull`; `RoutineInstance.origenTemplateId` con `onDelete: SetNull` explícito (ya era el comportamiento implícito de Prisma al ser opcional, pero se deja explícito por claridad) — consumidos por todas las tareas siguientes.

- [ ] **Step 1: Modificar el schema**

En `apps/api/prisma/schema.prisma`, en `model RoutineTemplateExercise`, agregar el campo `peso` después de `repeticiones`:

```prisma
model RoutineTemplateExercise {
  id           String   @id @default(uuid())
  templateId   String
  exerciseId   String
  orden        Int
  series       Int
  repeticiones Int
  peso         Decimal? @db.Decimal(5, 2)
  descanso     Int
  notas        String?

  template RoutineTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  exercise Exercise        @relation(fields: [exerciseId], references: [id])

  @@unique([templateId, orden])
  @@index([exerciseId])
}
```

En `model RoutineInstanceExercise`, el mismo campo:

```prisma
model RoutineInstanceExercise {
  id           String   @id @default(uuid())
  instanceId   String
  exerciseId   String
  orden        Int
  series       Int
  repeticiones Int
  peso         Decimal? @db.Decimal(5, 2)
  descanso     Int
  notas        String?

  instance RoutineInstance @relation(fields: [instanceId], references: [id], onDelete: Cascade)
  exercise Exercise        @relation(fields: [exerciseId], references: [id])

  @@unique([instanceId, orden])
  @@index([exerciseId])
}
```

En `model RoutineInstance`, cambiar `profesorId` a nullable y agregar `onDelete: SetNull` explícito en ambas relaciones opcionales:

```prisma
model RoutineInstance {
  id               String    @id @default(uuid())
  gymId            String
  profesorId       String?
  alumnoId         String
  nombre           String
  origenTemplateId String?
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

- [ ] **Step 2: Validar el schema**

Run: `pnpm --filter api prisma:validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 3: Generar y aplicar la migración**

Run: `cd apps/api && npx prisma migrate dev --name routines_peso_and_nullable_profesor`
Expected: migración generada y aplicada contra la DB real. No hay filas de `RoutineInstance` en producción todavía (el bounded context está vacío) — la migración no debería requerir ningún `--force-reset` ni advertencia de pérdida de datos. Si Prisma pide confirmación por el cambio de nullability, es seguro continuar (tabla vacía).

- [ ] **Step 4: Confirmar que el resto de la suite sigue verde**

Run: `pnpm --filter api test`
Expected: los 151 tests existentes en PASS (cambio de schema puramente estructural, ningún código de aplicación usa `RoutineInstance` todavía).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(routines): peso en ejercicios + profesorId/origenTemplateId nullable"
```

---

## Task 2: `ExerciseRepositoryPort.findByIds` (evita N+1 en la rutina del alumno)

**Files:**

- Modify: `apps/api/src/exercise-catalog/application/ports/exercise-repository.port.ts`
- Modify: `apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise.repository.ts`
- Modify: `apps/api/src/exercise-catalog/exercise-catalog.module.ts`

**Interfaces:**

- Consumes: `ExerciseSummary`, `EXERCISE_REPOSITORY`, `PrismaService` (ya existen).
- Produces: `ExerciseRepositoryPort.findByIds(ids: string[]): Promise<ExerciseSummary[]>` y `EXERCISE_REPOSITORY` exportado por `ExerciseCatalogModule` — consumidos por `GetMiRutinaVigenteUseCase` (Tarea 8) y `GetAlumnoRutinaVigenteAsProfesorUseCase` (Tarea 8).

- [ ] **Step 1: Agregar el método al puerto**

En `apps/api/src/exercise-catalog/application/ports/exercise-repository.port.ts`, agregar a la interfaz `ExerciseRepositoryPort`:

```typescript
export interface ExerciseRepositoryPort {
  findMany(filter: ListExercisesFilter): Promise<ListExercisesResult>;
  findById(id: string): Promise<ExerciseDetail | null>;
  /**
   * Resuelve varios ejercicios en un solo query — lo usa Routines para
   * enriquecer una rutina completa (nombre/imageUrl/gifUrl por ejercicio)
   * sin hacer un query por cada línea de la rutina.
   */
  findByIds(ids: string[]): Promise<ExerciseSummary[]>;
}
```

- [ ] **Step 2: Implementar en el repositorio Prisma**

En `apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise.repository.ts`, agregar el método a la clase:

```typescript
  async findByIds(ids: string[]): Promise<ExerciseSummary[]> {
    if (ids.length === 0) {
      return [];
    }
    const exercises = await this.prisma.exercise.findMany({
      where: { id: { in: ids } },
      select: SELECT_SUMMARY,
    });
    return exercises as ExerciseSummary[];
  }
```

- [ ] **Step 3: Exportar `EXERCISE_REPOSITORY` desde el módulo**

En `apps/api/src/exercise-catalog/exercise-catalog.module.ts`, agregar `exports`:

```typescript
@Module({
  imports: [],
  controllers: [ExercisesController],
  providers: [
    { provide: EXERCISE_REPOSITORY, useClass: PrismaExerciseRepository },
    ListExercisesUseCase,
    GetExerciseUseCase,
  ],
  exports: [EXERCISE_REPOSITORY],
})
export class ExerciseCatalogModule {}
```

- [ ] **Step 4: Verificar que compila y no rompe nada**

Run: `pnpm --filter api build && pnpm --filter api test`
Expected: build limpio, 151/151 tests en PASS (nada consume `findByIds` todavía).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/exercise-catalog/application/ports/exercise-repository.port.ts \
        apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise.repository.ts \
        apps/api/src/exercise-catalog/exercise-catalog.module.ts
git commit -m "feat(exercise-catalog): findByIds para resolver rutinas sin N+1"
```

---

## Task 3: Helper `resolveUserInGym` + refactor de Cartera (3A)

**Files:**

- Create: `apps/api/src/identity/application/resolve-user-in-gym.ts`
- Create: `apps/api/src/identity/application/resolve-user-in-gym.spec.ts`
- Modify: `apps/api/src/identity/application/cartera/assign-profesor-to-alumno.use-case.ts`
- Modify: `apps/api/src/identity/application/cartera/remove-profesor-from-alumno.use-case.ts`
- Modify: `apps/api/src/identity/application/cartera/list-profesores-de-alumno.use-case.ts`

**Interfaces:**

- Consumes: `UserRepositoryPort`, `UserRecord`, `UserNotFoundError` (ya existen).
- Produces: `resolveUserInGym(userRepository, userId, gymId): Promise<UserRecord>` — consumido por los 3 casos de uso de Cartera refactorizados en esta tarea, y por todos los casos de uso nuevos de Routines/hard-delete en tareas siguientes.

- [ ] **Step 1: Escribir el test del helper**

Crear `apps/api/src/identity/application/resolve-user-in-gym.spec.ts`:

```typescript
import { resolveUserInGym } from './resolve-user-in-gym';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { UserNotFoundError } from './errors/user-not-found.error';
import { Role } from '../domain/role';

describe('resolveUserInGym', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;

  const usuario: UserRecord = {
    id: 'user-1',
    authUserId: 'auth-1',
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
  });

  it('devuelve el usuario si existe y es del gym pedido', async () => {
    userRepository.findById.mockResolvedValue(usuario);

    const resultado = await resolveUserInGym(userRepository, 'user-1', 'gym-1');

    expect(resultado).toEqual(usuario);
  });

  it('lanza UserNotFoundError si no existe', async () => {
    userRepository.findById.mockResolvedValue(null);

    await expect(resolveUserInGym(userRepository, 'no-existe', 'gym-1')).rejects.toThrow(
      UserNotFoundError,
    );
  });

  it('lanza UserNotFoundError (no otro tipo de error) si es de otro gym', async () => {
    userRepository.findById.mockResolvedValue({ ...usuario, gymId: 'gym-OTRO' });

    await expect(resolveUserInGym(userRepository, 'user-1', 'gym-1')).rejects.toThrow(
      UserNotFoundError,
    );
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm --filter api test -- resolve-user-in-gym`
Expected: FAIL — `Cannot find module './resolve-user-in-gym'`

- [ ] **Step 3: Implementar el helper**

Crear `apps/api/src/identity/application/resolve-user-in-gym.ts`:

```typescript
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { UserNotFoundError } from './errors/user-not-found.error';

/**
 * Resuelve un usuario por id y valida que sea del gym del invocador, en un
 * solo paso — patrón repetido en Cartera (3A) y ahora en Routines/hard-delete.
 * Un usuario de otro gym responde igual que uno inexistente (HLD §4,
 * convención anti-enumeración): nunca hay que distinguir los dos casos.
 */
export async function resolveUserInGym(
  userRepository: UserRepositoryPort,
  userId: string,
  gymId: string,
): Promise<UserRecord> {
  const user = await userRepository.findById(userId);
  if (!user || user.gymId !== gymId) {
    throw new UserNotFoundError(userId);
  }
  return user;
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pnpm --filter api test -- resolve-user-in-gym`
Expected: PASS (3 tests)

- [ ] **Step 5: Refactorizar `AssignProfesorToAlumnoUseCase`**

En `apps/api/src/identity/application/cartera/assign-profesor-to-alumno.use-case.ts`, reemplazar las dos resoluciones manuales por el helper. Reemplazar el `import` de `UserNotFoundError` por el de `resolveUserInGym`, y el cuerpo de `execute`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../domain/role';
import { AuthenticatedUser } from '../../domain/authenticated-user';
import {
  CARTERA_REPOSITORY,
  CarteraLink,
  CarteraRepositoryPort,
} from '../ports/cartera-repository.port';
import { USER_REPOSITORY, UserRepositoryPort } from '../ports/user-repository.port';
import { resolveUserInGym } from '../resolve-user-in-gym';
import { InsufficientRoleError } from '../errors/insufficient-role.error';
import { InvalidCarteraRoleError } from '../errors/invalid-cartera-role.error';
import { InactiveUserError } from '../errors/inactive-user.error';
import { CarteraLinkAlreadyExistsError } from '../errors/cartera-link-already-exists.error';

export interface AssignProfesorToAlumnoInput {
  invocadoPor: AuthenticatedUser;
  alumnoId: string;
  profesorId: string;
}

const ROLES_QUE_PUEDEN_GESTIONAR_CARTERA: Role[] = [Role.ADMIN];

/**
 * HU-03b — exclusivo de ADMIN. Un recurso de otro gym o inexistente
 * responde igual (UserNotFoundError, 404) para no habilitar enumeración
 * (HLD §4, "Convención de respuesta ante acceso denegado").
 */
@Injectable()
export class AssignProfesorToAlumnoUseCase {
  constructor(
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
  ) {}

  async execute(input: AssignProfesorToAlumnoInput): Promise<CarteraLink> {
    if (!ROLES_QUE_PUEDEN_GESTIONAR_CARTERA.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_GESTIONAR_CARTERA);
    }

    const profesor = await resolveUserInGym(
      this.userRepository,
      input.profesorId,
      input.invocadoPor.gymId,
    );
    if (profesor.role !== Role.PROFESOR) {
      throw new InvalidCarteraRoleError(input.profesorId, Role.PROFESOR);
    }
    if (!profesor.activo) {
      throw new InactiveUserError(input.profesorId);
    }

    const alumno = await resolveUserInGym(
      this.userRepository,
      input.alumnoId,
      input.invocadoPor.gymId,
    );
    if (alumno.role !== Role.ALUMNO) {
      throw new InvalidCarteraRoleError(input.alumnoId, Role.ALUMNO);
    }
    if (!alumno.activo) {
      throw new InactiveUserError(input.alumnoId);
    }

    const yaExiste = await this.carteraRepository.existe(input.profesorId, input.alumnoId);
    if (yaExiste) {
      throw new CarteraLinkAlreadyExistsError(input.profesorId, input.alumnoId);
    }

    return this.carteraRepository.crear({
      gymId: input.invocadoPor.gymId,
      profesorId: input.profesorId,
      alumnoId: input.alumnoId,
    });
  }
}
```

- [ ] **Step 6: Refactorizar `RemoveProfesorFromAlumnoUseCase`**

En `apps/api/src/identity/application/cartera/remove-profesor-from-alumno.use-case.ts`, mismo refactor — reemplazar el cuerpo completo:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../domain/role';
import { AuthenticatedUser } from '../../domain/authenticated-user';
import { CARTERA_REPOSITORY, CarteraRepositoryPort } from '../ports/cartera-repository.port';
import { USER_REPOSITORY, UserRepositoryPort } from '../ports/user-repository.port';
import { resolveUserInGym } from '../resolve-user-in-gym';
import { InsufficientRoleError } from '../errors/insufficient-role.error';
import { CarteraLinkNotFoundError } from '../errors/cartera-link-not-found.error';

export interface RemoveProfesorFromAlumnoInput {
  invocadoPor: AuthenticatedUser;
  alumnoId: string;
  profesorId: string;
}

const ROLES_QUE_PUEDEN_GESTIONAR_CARTERA: Role[] = [Role.ADMIN];

/**
 * HU-03b — exclusivo de ADMIN. A diferencia de `AssignProfesorToAlumnoUseCase`,
 * NUNCA valida `activo` de ninguno de los dos usuarios: quitar de la
 * cartera es limpieza administrativa sobre datos propios del ADMIN, no
 * "operar en nombre de" el usuario inactivo. Validarlo dejaría filas de
 * cartera imborrables cada vez que se desactiva a alguien (spec Bloque 3A
 * §4.2). No borra ninguna `RoutineInstance` ya asignada — solo esta fila.
 */
@Injectable()
export class RemoveProfesorFromAlumnoUseCase {
  constructor(
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
  ) {}

  async execute(input: RemoveProfesorFromAlumnoInput): Promise<void> {
    if (!ROLES_QUE_PUEDEN_GESTIONAR_CARTERA.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_GESTIONAR_CARTERA);
    }

    await resolveUserInGym(this.userRepository, input.alumnoId, input.invocadoPor.gymId);
    await resolveUserInGym(this.userRepository, input.profesorId, input.invocadoPor.gymId);

    const existe = await this.carteraRepository.existe(input.profesorId, input.alumnoId);
    if (!existe) {
      throw new CarteraLinkNotFoundError(input.profesorId, input.alumnoId);
    }

    await this.carteraRepository.eliminar(input.profesorId, input.alumnoId);
  }
}
```

- [ ] **Step 7: Refactorizar `ListProfesoresDeAlumnoUseCase`**

En `apps/api/src/identity/application/cartera/list-profesores-de-alumno.use-case.ts`, reemplazar el cuerpo completo:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../domain/role';
import { AuthenticatedUser } from '../../domain/authenticated-user';
import { CARTERA_REPOSITORY, CarteraRepositoryPort } from '../ports/cartera-repository.port';
import { USER_REPOSITORY, UserRepositoryPort, UserRecord } from '../ports/user-repository.port';
import { resolveUserInGym } from '../resolve-user-in-gym';
import { InsufficientRoleError } from '../errors/insufficient-role.error';

export interface ListProfesoresDeAlumnoInput {
  invocadoPor: AuthenticatedUser;
  alumnoId: string;
}

const ROLES_QUE_PUEDEN_VER_CARTERA_AJENA: Role[] = [Role.ADMIN];

@Injectable()
export class ListProfesoresDeAlumnoUseCase {
  constructor(
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
  ) {}

  async execute(input: ListProfesoresDeAlumnoInput): Promise<UserRecord[]> {
    if (!ROLES_QUE_PUEDEN_VER_CARTERA_AJENA.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_VER_CARTERA_AJENA);
    }

    await resolveUserInGym(this.userRepository, input.alumnoId, input.invocadoPor.gymId);

    return this.carteraRepository.findProfesoresDeAlumno(input.alumnoId);
  }
}
```

- [ ] **Step 8: Confirmar que los tests existentes de los 3 casos de uso siguen pasando sin modificarlos**

Run: `pnpm --filter api test -- cartera`
Expected: PASS — los specs de `assign-profesor-to-alumno`, `remove-profesor-from-alumno` y `list-profesores-de-alumno` NO se tocan en esta tarea (el refactor es interno, el comportamiento observable es idéntico) y siguen en verde tal cual estaban.

- [ ] **Step 9: Suite completa de identity**

Run: `pnpm --filter api test -- identity`
Expected: PASS, sin regresiones.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/identity/application/resolve-user-in-gym.ts \
        apps/api/src/identity/application/resolve-user-in-gym.spec.ts \
        apps/api/src/identity/application/cartera/assign-profesor-to-alumno.use-case.ts \
        apps/api/src/identity/application/cartera/remove-profesor-from-alumno.use-case.ts \
        apps/api/src/identity/application/cartera/list-profesores-de-alumno.use-case.ts
git commit -m "refactor(identity): extraer resolveUserInGym, deuda de revisión final 3A"
```

---

## Task 4: `RoutinesCleanupPort` (declarado por identity) + errores de hard-delete de usuarios

**Files:**

- Create: `apps/api/src/identity/application/ports/routines-cleanup.port.ts`
- Create: `apps/api/src/identity/application/errors/user-not-inactive.error.ts`
- Create: `apps/api/src/identity/application/errors/cannot-target-admin.error.ts`

**Interfaces:**

- Consumes: `Role` (ya existe), `DomainError` (ya existe).
- Produces: `ROUTINES_CLEANUP` (Symbol), `RoutinesCleanupImpact`, `RoutinesCleanupPort` — consumidos por `PrismaRoutinesCleanupAdapter` (Tarea 10, en `routines`) y por `GetUserDeletionImpactUseCase`/`DeleteUserPermanentlyUseCase` (Tarea 10, en `identity`). `UserNotInactiveError`, `CannotTargetAdminError` — consumidos por `DeleteUserPermanentlyUseCase`.

- [ ] **Step 1: Escribir el puerto**

Crear `apps/api/src/identity/application/ports/routines-cleanup.port.ts`:

```typescript
import type { Prisma } from '@prisma/client';
import { Role } from '../../domain/role';

export const ROUTINES_CLEANUP = Symbol('ROUTINES_CLEANUP');

export interface RoutinesCleanupImpact {
  plantillasABorrar: number;
  instanciasABorrar: number;
  instanciasQueSobreviven: number;
}

/**
 * `identity` declara este puerto porque necesita que alguien limpie los
 * datos de Routines antes de borrar un `User` — pero `identity` nunca debe
 * depender de `routines` (HLD §2: la dirección es routines → identity).
 * `routines` es quien lo implementa (`PrismaRoutinesCleanupAdapter`), sin
 * invertir esa dirección: sigue siendo `routines` quien conoce a `identity`,
 * no al revés. `IdentityModule` importa el MÓDULO de Nest de `routines`
 * para obtener el provider — nunca accede a los repos internos de routines
 * directamente.
 *
 * `tx: Prisma.TransactionClient` es una fuga deliberada de infraestructura
 * en una interfaz de application layer — no es hexagonal puro. Se acepta
 * por el mismo criterio que la transacción de alta con cartera del Bloque
 * 3A: construir un Unit of Work genérico solo para este caso de uso es
 * sobre-ingeniería para un MVP de un gimnasio. El hard-delete completo
 * (routines → ProfesorAlumno → User) tiene que ser una única transacción,
 * y Prisma no tiene una abstracción que cruce repos sin pasar el mismo
 * `tx` explícitamente.
 */
export interface RoutinesCleanupPort {
  contarImpacto(userId: string, role: Role.PROFESOR | Role.ALUMNO): Promise<RoutinesCleanupImpact>;
  eliminarDatosDe(
    userId: string,
    role: Role.PROFESOR | Role.ALUMNO,
    tx: Prisma.TransactionClient,
  ): Promise<void>;
}
```

- [ ] **Step 2: Escribir los dos errores nuevos**

Crear `apps/api/src/identity/application/errors/user-not-inactive.error.ts`:

```typescript
import { DomainError } from '../../../shared-kernel/domain-error';

/**
 * Gate del hard-delete (HLD, "Convención de hard-delete"): el borrado
 * físico exige que el usuario ya esté desactivado — nunca desde el
 * estado activo.
 */
export class UserNotInactiveError extends DomainError {
  readonly httpStatus = 409;

  constructor(userId: string) {
    super(`El usuario '${userId}' está activo — desactivalo antes de eliminarlo definitivamente.`);
    this.name = 'UserNotInactiveError';
  }
}
```

Crear `apps/api/src/identity/application/errors/cannot-target-admin.error.ts`:

```typescript
import { DomainError } from '../../../shared-kernel/domain-error';

export class CannotTargetAdminError extends DomainError {
  readonly httpStatus = 400;

  constructor(userId: string) {
    super(`El usuario '${userId}' es ADMIN — no se puede eliminar por esta vía.`);
    this.name = 'CannotTargetAdminError';
  }
}
```

- [ ] **Step 3: Verificar que compila**

Run: `pnpm --filter api build`
Expected: build exitoso (nada todavía importa estos archivos).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/identity/application/ports/routines-cleanup.port.ts \
        apps/api/src/identity/application/errors/user-not-inactive.error.ts \
        apps/api/src/identity/application/errors/cannot-target-admin.error.ts
git commit -m "feat(identity): puerto RoutinesCleanupPort (DIP) + errores de hard-delete"
```

---

## Task 5: `RoutineTemplateRepositoryPort` + errores + `PrismaRoutineTemplateRepository`

**Files:**

- Create: `apps/api/src/routines/application/ports/routine-template-repository.port.ts`
- Create: `apps/api/src/routines/application/errors/routine-template-not-found.error.ts`
- Create: `apps/api/src/routines/application/errors/template-not-inactive.error.ts`
- Create: `apps/api/src/routines/application/errors/template-has-no-exercises.error.ts`
- Create: `apps/api/src/routines/application/errors/too-many-exercises.error.ts`
- Create: `apps/api/src/routines/infrastructure/persistence/prisma-routine-template.repository.ts`

**Interfaces:**

- Consumes: `PrismaService` (ya existe), `DomainError` (ya existe).
- Produces: `EjercicioItem` (tipo compartido, también usado por `RoutineInstanceRepositoryPort` en la Tarea 7), `ROUTINE_TEMPLATE_REPOSITORY` (Symbol), `RoutineTemplateSummary`, `RoutineTemplateDetail`, `RoutineTemplateRepositoryPort` con `findByProfesor`, `findById`, `create`, `update`, `delete`, `replaceExercises` — consumidos por los casos de uso de la Tarea 6 y por `AssignRoutineToAlumnoUseCase` (Tarea 8, para clonar). Los 4 errores — consumidos por la Tarea 6.

- [ ] **Step 1: Escribir el puerto**

Crear `apps/api/src/routines/application/ports/routine-template-repository.port.ts`:

```typescript
export const ROUTINE_TEMPLATE_REPOSITORY = Symbol('ROUTINE_TEMPLATE_REPOSITORY');

/**
 * Forma compartida de una línea de ejercicio — la usan tanto
 * `RoutineTemplateRepositoryPort` como `RoutineInstanceRepositoryPort`
 * (Tarea 7), porque el clonado plantilla→instancia copia esta forma 1:1.
 */
export interface EjercicioItem {
  exerciseId: string;
  orden: number;
  series: number;
  repeticiones: number;
  peso: number | null;
  descanso: number;
  notas: string | null;
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
  ejercicios: EjercicioItem[];
}

/**
 * Propiedad exclusiva del profesor que la creó — este puerto NUNCA valida
 * cartera (HLD §3 Routines). El chequeo de "es mía" (`profesorId ===
 * invocadoPor.id`) vive en los casos de uso, no acá.
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
  /** Replace-all transaccional — borra todas las líneas existentes y reinserta. */
  replaceExercises(templateId: string, ejercicios: EjercicioItem[]): Promise<void>;
}
```

- [ ] **Step 2: Escribir los 4 errores**

Crear `apps/api/src/routines/application/errors/routine-template-not-found.error.ts`:

```typescript
import { DomainError } from '../../../shared-kernel/domain-error';

export class RoutineTemplateNotFoundError extends DomainError {
  readonly httpStatus = 404;

  constructor(templateId: string) {
    super(`No existe una plantilla con id '${templateId}' que te pertenezca.`);
    this.name = 'RoutineTemplateNotFoundError';
  }
}
```

Crear `apps/api/src/routines/application/errors/template-not-inactive.error.ts`:

```typescript
import { DomainError } from '../../../shared-kernel/domain-error';

/** Gate del hard-delete de plantillas (PRD §6 regla 11, HU-07). */
export class TemplateNotInactiveError extends DomainError {
  readonly httpStatus = 409;

  constructor(templateId: string) {
    super(
      `La plantilla '${templateId}' está activa — desactivala antes de eliminarla definitivamente.`,
    );
    this.name = 'TemplateNotInactiveError';
  }
}
```

Crear `apps/api/src/routines/application/errors/template-has-no-exercises.error.ts`:

```typescript
import { DomainError } from '../../../shared-kernel/domain-error';

export class TemplateHasNoExercisesError extends DomainError {
  readonly httpStatus = 400;

  constructor(templateId: string) {
    super(
      `La plantilla '${templateId}' no tiene ejercicios — agregale al menos uno antes de asignarla (HU-04).`,
    );
    this.name = 'TemplateHasNoExercisesError';
  }
}
```

Crear `apps/api/src/routines/application/errors/too-many-exercises.error.ts`:

```typescript
import { DomainError } from '../../../shared-kernel/domain-error';

const MAX_EJERCICIOS = 50;

export class TooManyExercisesError extends DomainError {
  readonly httpStatus = 400;

  constructor(cantidad: number) {
    super(`No se pueden cargar ${cantidad} ejercicios — el máximo es ${MAX_EJERCICIOS}.`);
    this.name = 'TooManyExercisesError';
  }
}
```

- [ ] **Step 3: Implementar el repositorio Prisma**

Crear `apps/api/src/routines/infrastructure/persistence/prisma-routine-template.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import {
  EjercicioItem,
  RoutineTemplateDetail,
  RoutineTemplateRepositoryPort,
  RoutineTemplateSummary,
} from '../../application/ports/routine-template-repository.port';

const SELECT_SUMMARY = {
  id: true,
  gymId: true,
  profesorId: true,
  nombre: true,
  descripcion: true,
  activa: true,
} satisfies Prisma.RoutineTemplateSelect;

@Injectable()
export class PrismaRoutineTemplateRepository implements RoutineTemplateRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByProfesor(profesorId: string): Promise<RoutineTemplateSummary[]> {
    const templates = await this.prisma.routineTemplate.findMany({
      where: { profesorId },
      orderBy: { nombre: 'asc' },
      select: SELECT_SUMMARY,
    });
    return templates;
  }

  async findById(id: string): Promise<RoutineTemplateDetail | null> {
    const template = await this.prisma.routineTemplate.findUnique({
      where: { id },
      include: { ejercicios: { orderBy: { orden: 'asc' } } },
    });
    if (!template) return null;

    return {
      id: template.id,
      gymId: template.gymId,
      profesorId: template.profesorId,
      nombre: template.nombre,
      descripcion: template.descripcion,
      activa: template.activa,
      ejercicios: template.ejercicios.map(this.toEjercicioItem),
    };
  }

  async create(data: {
    gymId: string;
    profesorId: string;
    nombre: string;
    descripcion: string | null;
  }): Promise<RoutineTemplateSummary> {
    const template = await this.prisma.routineTemplate.create({
      data: {
        gymId: data.gymId,
        profesorId: data.profesorId,
        nombre: data.nombre,
        descripcion: data.descripcion,
      },
      select: SELECT_SUMMARY,
    });
    return template;
  }

  async update(
    id: string,
    data: { nombre?: string; descripcion?: string | null; activa?: boolean },
  ): Promise<RoutineTemplateSummary> {
    const template = await this.prisma.routineTemplate.update({
      where: { id },
      data,
      select: SELECT_SUMMARY,
    });
    return template;
  }

  async delete(id: string): Promise<void> {
    // Cascada de RoutineTemplateExercise es automática (onDelete: Cascade
    // en el schema). Las RoutineInstance que la referencien por
    // origenTemplateId quedan con ese campo en null automáticamente
    // (onDelete: SetNull) — no hace falta tocarlas acá.
    await this.prisma.routineTemplate.delete({ where: { id } });
  }

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
          descanso: e.descanso,
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
    descanso: number;
    notas: string | null;
  }): EjercicioItem {
    return {
      exerciseId: row.exerciseId,
      orden: row.orden,
      series: row.series,
      repeticiones: row.repeticiones,
      peso: row.peso === null ? null : row.peso.toNumber(),
      descanso: row.descanso,
      notas: row.notas,
    };
  }
}
```

- [ ] **Step 4: Verificar que compila**

Run: `pnpm --filter api build`
Expected: build exitoso.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routines/application/ports/routine-template-repository.port.ts \
        apps/api/src/routines/application/errors/routine-template-not-found.error.ts \
        apps/api/src/routines/application/errors/template-not-inactive.error.ts \
        apps/api/src/routines/application/errors/template-has-no-exercises.error.ts \
        apps/api/src/routines/application/errors/too-many-exercises.error.ts \
        apps/api/src/routines/infrastructure/persistence/prisma-routine-template.repository.ts
git commit -m "feat(routines): puerto y repositorio Prisma de RoutineTemplate"
```

---

## Task 6: Casos de uso de `RoutineTemplate`

**Files:**

- Create: `apps/api/src/routines/application/create-routine-template.use-case.ts`
- Create: `apps/api/src/routines/application/create-routine-template.use-case.spec.ts`
- Create: `apps/api/src/routines/application/list-routine-templates.use-case.ts`
- Create: `apps/api/src/routines/application/list-routine-templates.use-case.spec.ts`
- Create: `apps/api/src/routines/application/get-routine-template.use-case.ts`
- Create: `apps/api/src/routines/application/get-routine-template.use-case.spec.ts`
- Create: `apps/api/src/routines/application/update-routine-template.use-case.ts`
- Create: `apps/api/src/routines/application/update-routine-template.use-case.spec.ts`
- Create: `apps/api/src/routines/application/replace-template-exercises.use-case.ts`
- Create: `apps/api/src/routines/application/replace-template-exercises.use-case.spec.ts`
- Create: `apps/api/src/routines/application/delete-routine-template.use-case.ts`
- Create: `apps/api/src/routines/application/delete-routine-template.use-case.spec.ts`

**Interfaces:**

- Consumes: `ROUTINE_TEMPLATE_REPOSITORY`, `RoutineTemplateRepositoryPort`, `EjercicioItem`, `RoutineTemplateSummary`, `RoutineTemplateDetail` (Tarea 5); `RoutineTemplateNotFoundError`, `TemplateNotInactiveError`, `TooManyExercisesError` (Tarea 5); `Role`, `AuthenticatedUser`, `InsufficientRoleError` (ya existen en `identity`, importados directamente — `routines → identity` es la dirección permitida).
- Produces: `CreateRoutineTemplateUseCase.execute({ invocadoPor, nombre, descripcion? }): Promise<RoutineTemplateSummary>`, `ListRoutineTemplatesUseCase.execute({ invocadoPor }): Promise<RoutineTemplateSummary[]>`, `GetRoutineTemplateUseCase.execute({ invocadoPor, templateId }): Promise<RoutineTemplateDetail>`, `UpdateRoutineTemplateUseCase.execute({ invocadoPor, templateId, nombre?, descripcion?, activa? }): Promise<RoutineTemplateSummary>`, `ReplaceTemplateExercisesUseCase.execute({ invocadoPor, templateId, ejercicios }): Promise<void>`, `DeleteRoutineTemplateUseCase.execute({ invocadoPor, templateId }): Promise<void>` — consumidos por el controller de la Tarea 9 y por `AssignRoutineToAlumnoUseCase` (Tarea 8, vía el repo directamente, no vía `GetRoutineTemplateUseCase`).

Todos los casos de uso de esta tarea siguen el mismo esqueleto: rol PROFESOR primero, después resolver la plantilla y confirmar `template.profesorId === invocadoPor.id` (si no, `RoutineTemplateNotFoundError` — nunca un 403, ni siquiera puede saber si existe una plantilla ajena).

- [ ] **Step 1: Test de `CreateRoutineTemplateUseCase`**

Crear `apps/api/src/routines/application/create-routine-template.use-case.spec.ts`:

```typescript
import { Role } from '../../identity/domain/role';
import { CreateRoutineTemplateUseCase } from './create-routine-template.use-case';
import { RoutineTemplateRepositoryPort } from './ports/routine-template-repository.port';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';

describe('CreateRoutineTemplateUseCase', () => {
  let templateRepository: jest.Mocked<RoutineTemplateRepositoryPort>;
  let useCase: CreateRoutineTemplateUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };

  beforeEach(() => {
    templateRepository = {
      findByProfesor: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      replaceExercises: jest.fn(),
    };
    useCase = new CreateRoutineTemplateUseCase(templateRepository);
  });

  it('rechaza si quien invoca no es PROFESOR', async () => {
    await expect(useCase.execute({ invocadoPor: admin, nombre: 'Full body' })).rejects.toThrow(
      InsufficientRoleError,
    );
    expect(templateRepository.create).not.toHaveBeenCalled();
  });

  it('crea la plantilla con el gymId y profesorId del invocador', async () => {
    templateRepository.create.mockResolvedValue({
      id: 'tpl-1',
      gymId: 'gym-1',
      profesorId: 'prof-1',
      nombre: 'Full body',
      descripcion: null,
      activa: true,
    });

    const resultado = await useCase.execute({ invocadoPor: profesor, nombre: 'Full body' });

    expect(templateRepository.create).toHaveBeenCalledWith({
      gymId: 'gym-1',
      profesorId: 'prof-1',
      nombre: 'Full body',
      descripcion: null,
    });
    expect(resultado.id).toBe('tpl-1');
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm --filter api test -- create-routine-template`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `CreateRoutineTemplateUseCase`**

Crear `apps/api/src/routines/application/create-routine-template.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../identity/domain/role';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import {
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateRepositoryPort,
  RoutineTemplateSummary,
} from './ports/routine-template-repository.port';

export interface CreateRoutineTemplateInput {
  invocadoPor: AuthenticatedUser;
  nombre: string;
  descripcion?: string;
}

const ROLES_QUE_PUEDEN_CREAR: Role[] = [Role.PROFESOR];

@Injectable()
export class CreateRoutineTemplateUseCase {
  constructor(
    @Inject(ROUTINE_TEMPLATE_REPOSITORY)
    private readonly templateRepository: RoutineTemplateRepositoryPort,
  ) {}

  async execute(input: CreateRoutineTemplateInput): Promise<RoutineTemplateSummary> {
    if (!ROLES_QUE_PUEDEN_CREAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_CREAR);
    }

    return this.templateRepository.create({
      gymId: input.invocadoPor.gymId,
      profesorId: input.invocadoPor.id,
      nombre: input.nombre,
      descripcion: input.descripcion ?? null,
    });
  }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm --filter api test -- create-routine-template`
Expected: PASS (2 tests)

- [ ] **Step 5: Test de `ListRoutineTemplatesUseCase`**

Crear `apps/api/src/routines/application/list-routine-templates.use-case.spec.ts`:

```typescript
import { Role } from '../../identity/domain/role';
import { ListRoutineTemplatesUseCase } from './list-routine-templates.use-case';
import { RoutineTemplateRepositoryPort } from './ports/routine-template-repository.port';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';

describe('ListRoutineTemplatesUseCase', () => {
  let templateRepository: jest.Mocked<RoutineTemplateRepositoryPort>;
  let useCase: ListRoutineTemplatesUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };

  beforeEach(() => {
    templateRepository = {
      findByProfesor: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      replaceExercises: jest.fn(),
    };
    useCase = new ListRoutineTemplatesUseCase(templateRepository);
  });

  it('rechaza si quien invoca no es PROFESOR', async () => {
    await expect(useCase.execute({ invocadoPor: admin })).rejects.toThrow(InsufficientRoleError);
  });

  it('lista las plantillas del profesor autenticado, nunca de un profesorId externo', async () => {
    templateRepository.findByProfesor.mockResolvedValue([
      {
        id: 'tpl-1',
        gymId: 'gym-1',
        profesorId: 'prof-1',
        nombre: 'Full body',
        descripcion: null,
        activa: true,
      },
    ]);

    const resultado = await useCase.execute({ invocadoPor: profesor });

    expect(templateRepository.findByProfesor).toHaveBeenCalledWith('prof-1');
    expect(resultado).toHaveLength(1);
  });
});
```

- [ ] **Step 6: Ejecutar y verificar que falla, luego implementar**

Run: `pnpm --filter api test -- list-routine-templates` → FAIL.

Crear `apps/api/src/routines/application/list-routine-templates.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../identity/domain/role';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import {
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateRepositoryPort,
  RoutineTemplateSummary,
} from './ports/routine-template-repository.port';

export interface ListRoutineTemplatesInput {
  invocadoPor: AuthenticatedUser;
}

const ROLES_QUE_PUEDEN_LISTAR: Role[] = [Role.PROFESOR];

@Injectable()
export class ListRoutineTemplatesUseCase {
  constructor(
    @Inject(ROUTINE_TEMPLATE_REPOSITORY)
    private readonly templateRepository: RoutineTemplateRepositoryPort,
  ) {}

  async execute(input: ListRoutineTemplatesInput): Promise<RoutineTemplateSummary[]> {
    if (!ROLES_QUE_PUEDEN_LISTAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_LISTAR);
    }
    return this.templateRepository.findByProfesor(input.invocadoPor.id);
  }
}
```

Run: `pnpm --filter api test -- list-routine-templates` → PASS (2 tests).

- [ ] **Step 7: Test de `GetRoutineTemplateUseCase`**

Crear `apps/api/src/routines/application/get-routine-template.use-case.spec.ts`:

```typescript
import { Role } from '../../identity/domain/role';
import { GetRoutineTemplateUseCase } from './get-routine-template.use-case';
import {
  RoutineTemplateRepositoryPort,
  RoutineTemplateDetail,
} from './ports/routine-template-repository.port';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';

describe('GetRoutineTemplateUseCase', () => {
  let templateRepository: jest.Mocked<RoutineTemplateRepositoryPort>;
  let useCase: GetRoutineTemplateUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const otroProfesor = { id: 'prof-2', gymId: 'gym-1', role: Role.PROFESOR };

  const detalle: RoutineTemplateDetail = {
    id: 'tpl-1',
    gymId: 'gym-1',
    profesorId: 'prof-1',
    nombre: 'Full body',
    descripcion: null,
    activa: true,
    ejercicios: [],
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
    useCase = new GetRoutineTemplateUseCase(templateRepository);
  });

  it('rechaza si quien invoca no es PROFESOR', async () => {
    await expect(
      useCase.execute({
        invocadoPor: { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN },
        templateId: 'tpl-1',
      }),
    ).rejects.toThrow(InsufficientRoleError);
  });

  it('lanza RoutineTemplateNotFoundError si no existe', async () => {
    templateRepository.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({ invocadoPor: profesor, templateId: 'no-existe' }),
    ).rejects.toThrow(RoutineTemplateNotFoundError);
  });

  it('lanza RoutineTemplateNotFoundError (no 403) si la plantilla es de otro profesor', async () => {
    templateRepository.findById.mockResolvedValue(detalle);
    await expect(
      useCase.execute({ invocadoPor: otroProfesor, templateId: 'tpl-1' }),
    ).rejects.toThrow(RoutineTemplateNotFoundError);
  });

  it('devuelve el detalle si es del profesor invocador', async () => {
    templateRepository.findById.mockResolvedValue(detalle);
    const resultado = await useCase.execute({ invocadoPor: profesor, templateId: 'tpl-1' });
    expect(resultado).toEqual(detalle);
  });
});
```

- [ ] **Step 8: Ejecutar y verificar que falla, luego implementar**

Run: `pnpm --filter api test -- get-routine-template` → FAIL.

Crear `apps/api/src/routines/application/get-routine-template.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../identity/domain/role';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import {
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateDetail,
  RoutineTemplateRepositoryPort,
} from './ports/routine-template-repository.port';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';

export interface GetRoutineTemplateInput {
  invocadoPor: AuthenticatedUser;
  templateId: string;
}

const ROLES_QUE_PUEDEN_VER: Role[] = [Role.PROFESOR];

@Injectable()
export class GetRoutineTemplateUseCase {
  constructor(
    @Inject(ROUTINE_TEMPLATE_REPOSITORY)
    private readonly templateRepository: RoutineTemplateRepositoryPort,
  ) {}

  async execute(input: GetRoutineTemplateInput): Promise<RoutineTemplateDetail> {
    if (!ROLES_QUE_PUEDEN_VER.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_VER);
    }

    const template = await this.templateRepository.findById(input.templateId);
    if (!template || template.profesorId !== input.invocadoPor.id) {
      throw new RoutineTemplateNotFoundError(input.templateId);
    }

    return template;
  }
}
```

Run: `pnpm --filter api test -- get-routine-template` → PASS (4 tests).

- [ ] **Step 9: Test de `UpdateRoutineTemplateUseCase`**

Crear `apps/api/src/routines/application/update-routine-template.use-case.spec.ts`:

```typescript
import { Role } from '../../identity/domain/role';
import { UpdateRoutineTemplateUseCase } from './update-routine-template.use-case';
import {
  RoutineTemplateRepositoryPort,
  RoutineTemplateDetail,
} from './ports/routine-template-repository.port';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';

describe('UpdateRoutineTemplateUseCase', () => {
  let templateRepository: jest.Mocked<RoutineTemplateRepositoryPort>;
  let useCase: UpdateRoutineTemplateUseCase;

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

  beforeEach(() => {
    templateRepository = {
      findByProfesor: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      replaceExercises: jest.fn(),
    };
    useCase = new UpdateRoutineTemplateUseCase(templateRepository);
  });

  it('lanza RoutineTemplateNotFoundError si no es del profesor invocador', async () => {
    templateRepository.findById.mockResolvedValue({ ...detalle, profesorId: 'prof-OTRO' });
    await expect(
      useCase.execute({ invocadoPor: profesor, templateId: 'tpl-1', nombre: 'Nuevo nombre' }),
    ).rejects.toThrow(RoutineTemplateNotFoundError);
    expect(templateRepository.update).not.toHaveBeenCalled();
  });

  it('actualiza nombre/descripcion/activa si es del profesor invocador', async () => {
    templateRepository.findById.mockResolvedValue(detalle);
    templateRepository.update.mockResolvedValue({
      ...detalle,
      nombre: 'Nuevo nombre',
      activa: false,
    });

    const resultado = await useCase.execute({
      invocadoPor: profesor,
      templateId: 'tpl-1',
      nombre: 'Nuevo nombre',
      activa: false,
    });

    expect(templateRepository.update).toHaveBeenCalledWith('tpl-1', {
      nombre: 'Nuevo nombre',
      descripcion: undefined,
      activa: false,
    });
    expect(resultado.nombre).toBe('Nuevo nombre');
  });
});
```

- [ ] **Step 10: Ejecutar y verificar que falla, luego implementar**

Run: `pnpm --filter api test -- update-routine-template` → FAIL.

Crear `apps/api/src/routines/application/update-routine-template.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../identity/domain/role';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import {
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateRepositoryPort,
  RoutineTemplateSummary,
} from './ports/routine-template-repository.port';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';

export interface UpdateRoutineTemplateInput {
  invocadoPor: AuthenticatedUser;
  templateId: string;
  nombre?: string;
  descripcion?: string;
  activa?: boolean;
}

const ROLES_QUE_PUEDEN_EDITAR: Role[] = [Role.PROFESOR];

@Injectable()
export class UpdateRoutineTemplateUseCase {
  constructor(
    @Inject(ROUTINE_TEMPLATE_REPOSITORY)
    private readonly templateRepository: RoutineTemplateRepositoryPort,
  ) {}

  async execute(input: UpdateRoutineTemplateInput): Promise<RoutineTemplateSummary> {
    if (!ROLES_QUE_PUEDEN_EDITAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_EDITAR);
    }

    const template = await this.templateRepository.findById(input.templateId);
    if (!template || template.profesorId !== input.invocadoPor.id) {
      throw new RoutineTemplateNotFoundError(input.templateId);
    }

    return this.templateRepository.update(input.templateId, {
      nombre: input.nombre,
      descripcion: input.descripcion,
      activa: input.activa,
    });
  }
}
```

Run: `pnpm --filter api test -- update-routine-template` → PASS (2 tests).

- [ ] **Step 11: Test de `ReplaceTemplateExercisesUseCase`**

Crear `apps/api/src/routines/application/replace-template-exercises.use-case.spec.ts`:

```typescript
import { Role } from '../../identity/domain/role';
import { ReplaceTemplateExercisesUseCase } from './replace-template-exercises.use-case';
import {
  RoutineTemplateRepositoryPort,
  RoutineTemplateDetail,
} from './ports/routine-template-repository.port';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';
import { TooManyExercisesError } from './errors/too-many-exercises.error';

describe('ReplaceTemplateExercisesUseCase', () => {
  let templateRepository: jest.Mocked<RoutineTemplateRepositoryPort>;
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
    descanso: 60,
    notas: null,
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
    useCase = new ReplaceTemplateExercisesUseCase(templateRepository);
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
});
```

- [ ] **Step 12: Ejecutar y verificar que falla, luego implementar**

Run: `pnpm --filter api test -- replace-template-exercises` → FAIL.

Crear `apps/api/src/routines/application/replace-template-exercises.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../identity/domain/role';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import {
  EjercicioItem,
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateRepositoryPort,
} from './ports/routine-template-repository.port';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';
import { TooManyExercisesError } from './errors/too-many-exercises.error';

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

    await this.templateRepository.replaceExercises(input.templateId, input.ejercicios);
  }
}
```

Run: `pnpm --filter api test -- replace-template-exercises` → PASS (3 tests).

- [ ] **Step 13: Test de `DeleteRoutineTemplateUseCase`**

Crear `apps/api/src/routines/application/delete-routine-template.use-case.spec.ts`:

```typescript
import { Role } from '../../identity/domain/role';
import { DeleteRoutineTemplateUseCase } from './delete-routine-template.use-case';
import {
  RoutineTemplateRepositoryPort,
  RoutineTemplateDetail,
} from './ports/routine-template-repository.port';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';
import { TemplateNotInactiveError } from './errors/template-not-inactive.error';

describe('DeleteRoutineTemplateUseCase', () => {
  let templateRepository: jest.Mocked<RoutineTemplateRepositoryPort>;
  let useCase: DeleteRoutineTemplateUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };

  const detalleActiva: RoutineTemplateDetail = {
    id: 'tpl-1',
    gymId: 'gym-1',
    profesorId: 'prof-1',
    nombre: 'Full body',
    descripcion: null,
    activa: true,
    ejercicios: [],
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
    useCase = new DeleteRoutineTemplateUseCase(templateRepository);
  });

  it('lanza RoutineTemplateNotFoundError si no es del profesor invocador', async () => {
    templateRepository.findById.mockResolvedValue({ ...detalleActiva, profesorId: 'prof-OTRO' });
    await expect(useCase.execute({ invocadoPor: profesor, templateId: 'tpl-1' })).rejects.toThrow(
      RoutineTemplateNotFoundError,
    );
  });

  it('lanza TemplateNotInactiveError si la plantilla está activa (gate del hard-delete)', async () => {
    templateRepository.findById.mockResolvedValue(detalleActiva);
    await expect(useCase.execute({ invocadoPor: profesor, templateId: 'tpl-1' })).rejects.toThrow(
      TemplateNotInactiveError,
    );
    expect(templateRepository.delete).not.toHaveBeenCalled();
  });

  it('elimina si está desactivada', async () => {
    templateRepository.findById.mockResolvedValue({ ...detalleActiva, activa: false });
    await useCase.execute({ invocadoPor: profesor, templateId: 'tpl-1' });
    expect(templateRepository.delete).toHaveBeenCalledWith('tpl-1');
  });
});
```

- [ ] **Step 14: Ejecutar y verificar que falla, luego implementar**

Run: `pnpm --filter api test -- delete-routine-template` → FAIL.

Crear `apps/api/src/routines/application/delete-routine-template.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../identity/domain/role';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import {
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateRepositoryPort,
} from './ports/routine-template-repository.port';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';
import { TemplateNotInactiveError } from './errors/template-not-inactive.error';

export interface DeleteRoutineTemplateInput {
  invocadoPor: AuthenticatedUser;
  templateId: string;
}

const ROLES_QUE_PUEDEN_ELIMINAR: Role[] = [Role.PROFESOR];

/** Gate del hard-delete (HLD, "Convención de hard-delete", PRD §6 regla 11). */
@Injectable()
export class DeleteRoutineTemplateUseCase {
  constructor(
    @Inject(ROUTINE_TEMPLATE_REPOSITORY)
    private readonly templateRepository: RoutineTemplateRepositoryPort,
  ) {}

  async execute(input: DeleteRoutineTemplateInput): Promise<void> {
    if (!ROLES_QUE_PUEDEN_ELIMINAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_ELIMINAR);
    }

    const template = await this.templateRepository.findById(input.templateId);
    if (!template || template.profesorId !== input.invocadoPor.id) {
      throw new RoutineTemplateNotFoundError(input.templateId);
    }

    if (template.activa) {
      throw new TemplateNotInactiveError(input.templateId);
    }

    await this.templateRepository.delete(input.templateId);
  }
}
```

Run: `pnpm --filter api test -- delete-routine-template` → PASS (3 tests).

- [ ] **Step 15: Suite completa de routines**

Run: `pnpm --filter api test -- routines`
Expected: PASS, 6 suites nuevas, 16 tests (2+2+4+2+3+3).

- [ ] **Step 16: Commit**

```bash
git add apps/api/src/routines/application/create-routine-template.use-case.ts \
        apps/api/src/routines/application/create-routine-template.use-case.spec.ts \
        apps/api/src/routines/application/list-routine-templates.use-case.ts \
        apps/api/src/routines/application/list-routine-templates.use-case.spec.ts \
        apps/api/src/routines/application/get-routine-template.use-case.ts \
        apps/api/src/routines/application/get-routine-template.use-case.spec.ts \
        apps/api/src/routines/application/update-routine-template.use-case.ts \
        apps/api/src/routines/application/update-routine-template.use-case.spec.ts \
        apps/api/src/routines/application/replace-template-exercises.use-case.ts \
        apps/api/src/routines/application/replace-template-exercises.use-case.spec.ts \
        apps/api/src/routines/application/delete-routine-template.use-case.ts \
        apps/api/src/routines/application/delete-routine-template.use-case.spec.ts
git commit -m "feat(routines): casos de uso de RoutineTemplate (HU-04, HU-07)"
```

---

## Task 7: `RoutineInstanceRepositoryPort` + errores + `PrismaRoutineInstanceRepository`

**Files:**

- Create: `apps/api/src/routines/application/ports/routine-instance-repository.port.ts`
- Create: `apps/api/src/routines/application/errors/routine-instance-not-found.error.ts`
- Create: `apps/api/src/routines/application/errors/alumno-not-in-cartera.error.ts`
- Create: `apps/api/src/routines/application/errors/invalid-routine-instance-input.error.ts`
- Create: `apps/api/src/routines/infrastructure/persistence/prisma-routine-instance.repository.ts`

**Interfaces:**

- Consumes: `EjercicioItem` (Tarea 5), `PrismaService` (ya existe), `DomainError` (ya existe).
- Produces: `ROUTINE_INSTANCE_REPOSITORY` (Symbol), `RoutineInstanceDetail`, `RoutineInstanceRepositoryPort` con `findVigentePorAlumno`, `findById`, `crear`, `update`, `replaceExercises` — consumidos por los casos de uso de la Tarea 8. Los 3 errores — consumidos por la Tarea 8.

- [ ] **Step 1: Escribir el puerto**

Crear `apps/api/src/routines/application/ports/routine-instance-repository.port.ts`:

```typescript
import { EjercicioItem } from './routine-template-repository.port';

export const ROUTINE_INSTANCE_REPOSITORY = Symbol('ROUTINE_INSTANCE_REPOSITORY');

export interface RoutineInstanceDetail {
  id: string;
  gymId: string;
  profesorId: string | null;
  alumnoId: string;
  nombre: string;
  origenTemplateId: string | null;
  vigenteDesde: Date;
  vigenteHasta: Date | null;
  activa: boolean;
  ejercicios: EjercicioItem[];
}

/**
 * Ninguno de estos métodos valida cartera — eso vive en los casos de uso
 * (Tarea 8), vía `CarteraRepositoryPort.existe()` de Identity/3A. El repo
 * solo ejecuta la query.
 */
export interface RoutineInstanceRepositoryPort {
  findVigentePorAlumno(alumnoId: string): Promise<RoutineInstanceDetail | null>;
  findById(id: string): Promise<RoutineInstanceDetail | null>;
  /**
   * Transaccional: si el alumno ya tiene una instancia vigente, la archiva
   * (`activa: false`, `vigenteHasta: now`) y crea la nueva en la misma
   * `$transaction` — nunca deja al alumno con dos vigentes ni sin ninguna
   * a mitad de camino.
   */
  crear(data: {
    gymId: string;
    profesorId: string;
    alumnoId: string;
    nombre: string;
    origenTemplateId: string | null;
    ejercicios: EjercicioItem[];
  }): Promise<RoutineInstanceDetail>;
  update(id: string, data: { nombre?: string }): Promise<RoutineInstanceDetail>;
  /** Replace-all transaccional — igual criterio que `RoutineTemplateRepositoryPort`. */
  replaceExercises(instanceId: string, ejercicios: EjercicioItem[]): Promise<void>;
}
```

- [ ] **Step 2: Escribir los 3 errores**

Crear `apps/api/src/routines/application/errors/routine-instance-not-found.error.ts`:

```typescript
import { DomainError } from '../../../shared-kernel/domain-error';

export class RoutineInstanceNotFoundError extends DomainError {
  readonly httpStatus = 404;

  constructor(instanceId: string) {
    super(`No existe una instancia de rutina con id '${instanceId}' accesible para vos.`);
    this.name = 'RoutineInstanceNotFoundError';
  }
}
```

Crear `apps/api/src/routines/application/errors/alumno-not-in-cartera.error.ts`:

```typescript
import { DomainError } from '../../../shared-kernel/domain-error';

/**
 * El alumno existe y es del mismo gym (si no, sería
 * `UserNotFoundError`, 404) pero no está en la cartera del profesor
 * invocador — HLD §4, la excepción explícita a la convención 404: acá NO
 * hay filtración porque el profesor ya sabe que el alumno existe
 * (comparten gym).
 */
export class AlumnoNotInCarteraError extends DomainError {
  readonly httpStatus = 403;

  constructor(alumnoId: string) {
    super(`El alumno '${alumnoId}' no está en tu cartera.`);
    this.name = 'AlumnoNotInCarteraError';
  }
}
```

Crear `apps/api/src/routines/application/errors/invalid-routine-instance-input.error.ts`:

```typescript
import { DomainError } from '../../../shared-kernel/domain-error';

export class InvalidRoutineInstanceInputError extends DomainError {
  readonly httpStatus = 400;

  constructor() {
    super(
      'Hay que enviar exactamente uno de los dos: origenTemplateId (asignar desde plantilla) o ejercicios (armar desde cero).',
    );
    this.name = 'InvalidRoutineInstanceInputError';
  }
}
```

- [ ] **Step 3: Implementar el repositorio Prisma**

Crear `apps/api/src/routines/infrastructure/persistence/prisma-routine-instance.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import { EjercicioItem } from '../../application/ports/routine-template-repository.port';
import {
  RoutineInstanceDetail,
  RoutineInstanceRepositoryPort,
} from '../../application/ports/routine-instance-repository.port';

@Injectable()
export class PrismaRoutineInstanceRepository implements RoutineInstanceRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findVigentePorAlumno(alumnoId: string): Promise<RoutineInstanceDetail | null> {
    const instance = await this.prisma.routineInstance.findFirst({
      where: { alumnoId, activa: true },
      include: { ejercicios: { orderBy: { orden: 'asc' } } },
    });
    return instance ? this.toDetail(instance) : null;
  }

  async findById(id: string): Promise<RoutineInstanceDetail | null> {
    const instance = await this.prisma.routineInstance.findUnique({
      where: { id },
      include: { ejercicios: { orderBy: { orden: 'asc' } } },
    });
    return instance ? this.toDetail(instance) : null;
  }

  async crear(data: {
    gymId: string;
    profesorId: string;
    alumnoId: string;
    nombre: string;
    origenTemplateId: string | null;
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
          ejercicios: {
            create: data.ejercicios.map((e) => ({
              exerciseId: e.exerciseId,
              orden: e.orden,
              series: e.series,
              repeticiones: e.repeticiones,
              peso: e.peso === null ? null : new Prisma.Decimal(e.peso),
              descanso: e.descanso,
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

  async update(id: string, data: { nombre?: string }): Promise<RoutineInstanceDetail> {
    const instance = await this.prisma.routineInstance.update({
      where: { id },
      data,
      include: { ejercicios: { orderBy: { orden: 'asc' } } },
    });
    return this.toDetail(instance);
  }

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
          descanso: e.descanso,
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
      descanso: number;
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
        descanso: e.descanso,
        notas: e.notas,
      })),
    };
  }
}
```

- [ ] **Step 4: Verificar que compila**

Run: `pnpm --filter api build`
Expected: build exitoso.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routines/application/ports/routine-instance-repository.port.ts \
        apps/api/src/routines/application/errors/routine-instance-not-found.error.ts \
        apps/api/src/routines/application/errors/alumno-not-in-cartera.error.ts \
        apps/api/src/routines/application/errors/invalid-routine-instance-input.error.ts \
        apps/api/src/routines/infrastructure/persistence/prisma-routine-instance.repository.ts
git commit -m "feat(routines): puerto y repositorio Prisma de RoutineInstance"
```

---

## Task 8: Casos de uso de `RoutineInstance`

**Files:**

- Create: `apps/api/src/routines/application/assign-routine-to-alumno.use-case.ts`
- Create: `apps/api/src/routines/application/assign-routine-to-alumno.use-case.spec.ts`
- Create: `apps/api/src/routines/application/update-routine-instance.use-case.ts`
- Create: `apps/api/src/routines/application/update-routine-instance.use-case.spec.ts`
- Create: `apps/api/src/routines/application/replace-instance-exercises.use-case.ts`
- Create: `apps/api/src/routines/application/replace-instance-exercises.use-case.spec.ts`
- Create: `apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.ts`
- Create: `apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.spec.ts`
- Create: `apps/api/src/routines/application/get-mi-rutina-vigente.use-case.ts`
- Create: `apps/api/src/routines/application/get-mi-rutina-vigente.use-case.spec.ts`

**Interfaces:**

- Consumes: `ROUTINE_INSTANCE_REPOSITORY`, `RoutineInstanceRepositoryPort`, `RoutineInstanceDetail` (Tarea 7); `RoutineInstanceNotFoundError`, `AlumnoNotInCarteraError`, `InvalidRoutineInstanceInputError` (Tarea 7); `ROUTINE_TEMPLATE_REPOSITORY`, `RoutineTemplateRepositoryPort`, `EjercicioItem` (Tarea 5); `RoutineTemplateNotFoundError`, `TemplateHasNoExercisesError`, `TooManyExercisesError` (Tarea 5); `CARTERA_REPOSITORY`, `CarteraRepositoryPort` (3A, importado desde `identity`); `USER_REPOSITORY`, `UserRepositoryPort`, `resolveUserInGym` (identity, Tarea 3); `EXERCISE_REPOSITORY`, `ExerciseRepositoryPort`, `ExerciseSummary` (Tarea 2, importado desde `exercise-catalog`); `Role`, `AuthenticatedUser`, `InsufficientRoleError` (identity).
- Produces: `AssignRoutineToAlumnoUseCase.execute(input): Promise<RoutineInstanceDetail>`, `UpdateRoutineInstanceUseCase.execute(input): Promise<RoutineInstanceDetail>`, `ReplaceInstanceExercisesUseCase.execute(input): Promise<void>`, `GetAlumnoRutinaVigenteAsProfesorUseCase.execute(input): Promise<RutinaVigenteOutput>`, `GetMiRutinaVigenteUseCase.execute(input): Promise<RutinaVigenteOutput | null>` (`RutinaVigenteOutput` definido en este archivo, exportado para reuso) — consumidos por el controller de la Tarea 9.

**Patrón de autorización repetido en los primeros 3 casos de uso** (rol PROFESOR, después cartera): resolver el alumno con `resolveUserInGym` (→ 404 si no existe/otro gym), después `CarteraRepositoryPort.existe(invocadoPor.id, alumnoId)` (→ 403 `AlumnoNotInCarteraError` si no).

- [ ] **Step 1: Test de `AssignRoutineToAlumnoUseCase`**

Crear `apps/api/src/routines/application/assign-routine-to-alumno.use-case.spec.ts`:

```typescript
import { Role } from '../../identity/domain/role';
import { AssignRoutineToAlumnoUseCase } from './assign-routine-to-alumno.use-case';
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
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import { UserNotFoundError } from '../../identity/application/errors/user-not-found.error';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';
import { InvalidRoutineInstanceInputError } from './errors/invalid-routine-instance-input.error';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';
import { TemplateHasNoExercisesError } from './errors/template-has-no-exercises.error';
import { TooManyExercisesError } from './errors/too-many-exercises.error';

describe('AssignRoutineToAlumnoUseCase', () => {
  let instanceRepository: jest.Mocked<RoutineInstanceRepositoryPort>;
  let templateRepository: jest.Mocked<RoutineTemplateRepositoryPort>;
  let carteraRepository: jest.Mocked<CarteraRepositoryPort>;
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let useCase: AssignRoutineToAlumnoUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };

  const alumno: UserRecord = {
    id: 'alum-1',
    authUserId: 'auth-alum',
    gymId: 'gym-1',
    username: 'juan.perez',
    nombre: 'Juan Perez',
    role: Role.ALUMNO,
    activo: true,
  };

  const unEjercicio = {
    exerciseId: 'ex-1',
    orden: 1,
    series: 3,
    repeticiones: 10,
    peso: null,
    descanso: 60,
    notas: null,
  };

  const template: RoutineTemplateDetail = {
    id: 'tpl-1',
    gymId: 'gym-1',
    profesorId: 'prof-1',
    nombre: 'Full body',
    descripcion: null,
    activa: true,
    ejercicios: [unEjercicio],
  };

  const instanciaCreada: RoutineInstanceDetail = {
    id: 'inst-1',
    gymId: 'gym-1',
    profesorId: 'prof-1',
    alumnoId: 'alum-1',
    nombre: 'Full body',
    origenTemplateId: 'tpl-1',
    vigenteDesde: new Date(),
    vigenteHasta: null,
    activa: true,
    ejercicios: [unEjercicio],
  };

  beforeEach(() => {
    instanceRepository = {
      findVigentePorAlumno: jest.fn(),
      findById: jest.fn(),
      crear: jest.fn(),
      update: jest.fn(),
      replaceExercises: jest.fn(),
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
    useCase = new AssignRoutineToAlumnoUseCase(
      instanceRepository,
      templateRepository,
      carteraRepository,
      userRepository,
    );
  });

  it('rechaza si quien invoca no es PROFESOR', async () => {
    await expect(
      useCase.execute({
        invocadoPor: admin,
        alumnoId: 'alum-1',
        nombre: 'Full body',
        origenTemplateId: 'tpl-1',
      }),
    ).rejects.toThrow(InsufficientRoleError);
  });

  it('rechaza con InvalidRoutineInstanceInputError si vienen origenTemplateId Y ejercicios', async () => {
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        alumnoId: 'alum-1',
        nombre: 'Full body',
        origenTemplateId: 'tpl-1',
        ejercicios: [unEjercicio],
      }),
    ).rejects.toThrow(InvalidRoutineInstanceInputError);
  });

  it('rechaza con InvalidRoutineInstanceInputError si no viene ninguno de los dos', async () => {
    await expect(
      useCase.execute({ invocadoPor: profesor, alumnoId: 'alum-1', nombre: 'Full body' }),
    ).rejects.toThrow(InvalidRoutineInstanceInputError);
  });

  it('rechaza con UserNotFoundError si el alumno no existe o es de otro gym', async () => {
    userRepository.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        alumnoId: 'no-existe',
        nombre: 'Full body',
        origenTemplateId: 'tpl-1',
      }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('rechaza con AlumnoNotInCarteraError si el alumno es del mismo gym pero no está en la cartera', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(false);
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        alumnoId: 'alum-1',
        nombre: 'Full body',
        origenTemplateId: 'tpl-1',
      }),
    ).rejects.toThrow(AlumnoNotInCarteraError);
  });

  it('rechaza con RoutineTemplateNotFoundError si la plantilla no es del profesor', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(true);
    templateRepository.findById.mockResolvedValue({ ...template, profesorId: 'prof-OTRO' });
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        alumnoId: 'alum-1',
        nombre: 'Full body',
        origenTemplateId: 'tpl-1',
      }),
    ).rejects.toThrow(RoutineTemplateNotFoundError);
  });

  it('rechaza con TemplateHasNoExercisesError si la plantilla no tiene ejercicios', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(true);
    templateRepository.findById.mockResolvedValue({ ...template, ejercicios: [] });
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        alumnoId: 'alum-1',
        nombre: 'Full body',
        origenTemplateId: 'tpl-1',
      }),
    ).rejects.toThrow(TemplateHasNoExercisesError);
  });

  it('rechaza con TooManyExercisesError si arma desde cero con más de 50', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(true);
    const cincuentaYUno = Array.from({ length: 51 }, (_, i) => ({ ...unEjercicio, orden: i + 1 }));

    await expect(
      useCase.execute({
        invocadoPor: profesor,
        alumnoId: 'alum-1',
        nombre: 'Custom',
        ejercicios: cincuentaYUno,
      }),
    ).rejects.toThrow(TooManyExercisesError);
  });

  it('clona los ejercicios de la plantilla y crea la instancia', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(true);
    templateRepository.findById.mockResolvedValue(template);
    instanceRepository.crear.mockResolvedValue(instanciaCreada);

    const resultado = await useCase.execute({
      invocadoPor: profesor,
      alumnoId: 'alum-1',
      nombre: 'Full body',
      origenTemplateId: 'tpl-1',
    });

    expect(instanceRepository.crear).toHaveBeenCalledWith({
      gymId: 'gym-1',
      profesorId: 'prof-1',
      alumnoId: 'alum-1',
      nombre: 'Full body',
      origenTemplateId: 'tpl-1',
      ejercicios: [unEjercicio],
    });
    expect(resultado).toEqual(instanciaCreada);
  });

  it('arma desde cero con los ejercicios provistos, sin origenTemplateId', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(true);
    instanceRepository.crear.mockResolvedValue({ ...instanciaCreada, origenTemplateId: null });

    await useCase.execute({
      invocadoPor: profesor,
      alumnoId: 'alum-1',
      nombre: 'Custom',
      ejercicios: [unEjercicio],
    });

    expect(templateRepository.findById).not.toHaveBeenCalled();
    expect(instanceRepository.crear).toHaveBeenCalledWith({
      gymId: 'gym-1',
      profesorId: 'prof-1',
      alumnoId: 'alum-1',
      nombre: 'Custom',
      origenTemplateId: null,
      ejercicios: [unEjercicio],
    });
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm --filter api test -- assign-routine-to-alumno`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `AssignRoutineToAlumnoUseCase`**

Crear `apps/api/src/routines/application/assign-routine-to-alumno.use-case.ts`:

```typescript
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
import {
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
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';
import { TemplateHasNoExercisesError } from './errors/template-has-no-exercises.error';
import { TooManyExercisesError } from './errors/too-many-exercises.error';

const MAX_EJERCICIOS = 50;

export interface AssignRoutineToAlumnoInput {
  invocadoPor: AuthenticatedUser;
  alumnoId: string;
  nombre: string;
  origenTemplateId?: string;
  ejercicios?: EjercicioItem[];
}

const ROLES_QUE_PUEDEN_ASIGNAR: Role[] = [Role.PROFESOR];

/**
 * HU-05. Exactamente uno de `origenTemplateId`/`ejercicios` — asignar
 * desde plantilla (clona 1:1) o armar desde cero. Autoriza contra la
 * cartera vigente del invocador, nunca contra `RoutineInstance.profesorId`
 * de una instancia anterior (acá se está creando una nueva).
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
  ) {}

  async execute(input: AssignRoutineToAlumnoInput): Promise<RoutineInstanceDetail> {
    if (!ROLES_QUE_PUEDEN_ASIGNAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_ASIGNAR);
    }

    const tieneOrigen = Boolean(input.origenTemplateId);
    const tieneEjerciciosPropios = Boolean(input.ejercicios && input.ejercicios.length > 0);
    if (tieneOrigen === tieneEjerciciosPropios) {
      throw new InvalidRoutineInstanceInputError();
    }

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

    let ejercicios: EjercicioItem[];
    if (input.origenTemplateId) {
      const template = await this.templateRepository.findById(input.origenTemplateId);
      if (!template || template.profesorId !== input.invocadoPor.id) {
        throw new RoutineTemplateNotFoundError(input.origenTemplateId);
      }
      if (template.ejercicios.length === 0) {
        throw new TemplateHasNoExercisesError(template.id);
      }
      ejercicios = template.ejercicios;
    } else {
      ejercicios = input.ejercicios!;
      if (ejercicios.length > MAX_EJERCICIOS) {
        throw new TooManyExercisesError(ejercicios.length);
      }
    }

    return this.instanceRepository.crear({
      gymId: input.invocadoPor.gymId,
      profesorId: input.invocadoPor.id,
      alumnoId: input.alumnoId,
      nombre: input.nombre,
      origenTemplateId: input.origenTemplateId ?? null,
      ejercicios,
    });
  }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm --filter api test -- assign-routine-to-alumno`
Expected: PASS (10 tests)

- [ ] **Step 5: Test de `UpdateRoutineInstanceUseCase`**

Crear `apps/api/src/routines/application/update-routine-instance.use-case.spec.ts`:

```typescript
import { Role } from '../../identity/domain/role';
import { UpdateRoutineInstanceUseCase } from './update-routine-instance.use-case';
import {
  RoutineInstanceRepositoryPort,
  RoutineInstanceDetail,
} from './ports/routine-instance-repository.port';
import { CarteraRepositoryPort } from '../../identity/application/ports/cartera-repository.port';
import { RoutineInstanceNotFoundError } from './errors/routine-instance-not-found.error';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';

describe('UpdateRoutineInstanceUseCase', () => {
  let instanceRepository: jest.Mocked<RoutineInstanceRepositoryPort>;
  let carteraRepository: jest.Mocked<CarteraRepositoryPort>;
  let useCase: UpdateRoutineInstanceUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const otroProfesor = { id: 'prof-2', gymId: 'gym-1', role: Role.PROFESOR };

  const instancia: RoutineInstanceDetail = {
    id: 'inst-1',
    gymId: 'gym-1',
    profesorId: 'prof-1',
    alumnoId: 'alum-1',
    nombre: 'Full body',
    origenTemplateId: null,
    vigenteDesde: new Date(),
    vigenteHasta: null,
    activa: true,
    ejercicios: [],
  };

  beforeEach(() => {
    instanceRepository = {
      findVigentePorAlumno: jest.fn(),
      findById: jest.fn(),
      crear: jest.fn(),
      update: jest.fn(),
      replaceExercises: jest.fn(),
    };
    carteraRepository = {
      existe: jest.fn(),
      crear: jest.fn(),
      eliminar: jest.fn(),
      findAlumnosDeProfesor: jest.fn(),
      findProfesoresDeAlumno: jest.fn(),
    };
    useCase = new UpdateRoutineInstanceUseCase(instanceRepository, carteraRepository);
  });

  it('lanza RoutineInstanceNotFoundError si no existe', async () => {
    instanceRepository.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({ invocadoPor: profesor, instanceId: 'no-existe', nombre: 'Nuevo' }),
    ).rejects.toThrow(RoutineInstanceNotFoundError);
  });

  it('permite editar si el alumno de la instancia está en la cartera del invocador, aunque otro profesor la haya creado', async () => {
    instanceRepository.findById.mockResolvedValue(instancia);
    carteraRepository.existe.mockResolvedValue(true);
    instanceRepository.update.mockResolvedValue({ ...instancia, nombre: 'Actualizada' });

    const resultado = await useCase.execute({
      invocadoPor: otroProfesor,
      instanceId: 'inst-1',
      nombre: 'Actualizada',
    });

    expect(carteraRepository.existe).toHaveBeenCalledWith('prof-2', 'alum-1');
    expect(resultado.nombre).toBe('Actualizada');
  });

  it('rechaza con AlumnoNotInCarteraError si el alumno no está en la cartera del invocador', async () => {
    instanceRepository.findById.mockResolvedValue(instancia);
    carteraRepository.existe.mockResolvedValue(false);
    await expect(
      useCase.execute({ invocadoPor: otroProfesor, instanceId: 'inst-1', nombre: 'Actualizada' }),
    ).rejects.toThrow(AlumnoNotInCarteraError);
  });
});
```

- [ ] **Step 6: Ejecutar y verificar que falla, luego implementar**

Run: `pnpm --filter api test -- update-routine-instance` → FAIL.

Crear `apps/api/src/routines/application/update-routine-instance.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import {
  CARTERA_REPOSITORY,
  CarteraRepositoryPort,
} from '../../identity/application/ports/cartera-repository.port';
import {
  ROUTINE_INSTANCE_REPOSITORY,
  RoutineInstanceDetail,
  RoutineInstanceRepositoryPort,
} from './ports/routine-instance-repository.port';
import { RoutineInstanceNotFoundError } from './errors/routine-instance-not-found.error';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';

export interface UpdateRoutineInstanceInput {
  invocadoPor: AuthenticatedUser;
  instanceId: string;
  nombre?: string;
}

/**
 * Autoriza contra la cartera VIGENTE (¿el alumno de esta instancia está
 * en la cartera del invocador hoy?), nunca contra `instance.profesorId`
 * (quién la creó). Si el alumno tiene 2 profesores, cualquiera de los dos
 * puede editar la misma instancia — HLD §3 Routines.
 */
@Injectable()
export class UpdateRoutineInstanceUseCase {
  constructor(
    @Inject(ROUTINE_INSTANCE_REPOSITORY)
    private readonly instanceRepository: RoutineInstanceRepositoryPort,
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
  ) {}

  async execute(input: UpdateRoutineInstanceInput): Promise<RoutineInstanceDetail> {
    const instance = await this.instanceRepository.findById(input.instanceId);
    if (!instance) {
      throw new RoutineInstanceNotFoundError(input.instanceId);
    }

    const enCartera = await this.carteraRepository.existe(input.invocadoPor.id, instance.alumnoId);
    if (!enCartera) {
      throw new AlumnoNotInCarteraError(instance.alumnoId);
    }

    return this.instanceRepository.update(input.instanceId, { nombre: input.nombre });
  }
}
```

Run: `pnpm --filter api test -- update-routine-instance` → PASS (3 tests).

- [ ] **Step 7: Test de `ReplaceInstanceExercisesUseCase`**

Crear `apps/api/src/routines/application/replace-instance-exercises.use-case.spec.ts`:

```typescript
import {
  RoutineInstanceRepositoryPort,
  RoutineInstanceDetail,
} from './ports/routine-instance-repository.port';
import { CarteraRepositoryPort } from '../../identity/application/ports/cartera-repository.port';
import { Role } from '../../identity/domain/role';
import { ReplaceInstanceExercisesUseCase } from './replace-instance-exercises.use-case';
import { RoutineInstanceNotFoundError } from './errors/routine-instance-not-found.error';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';
import { TooManyExercisesError } from './errors/too-many-exercises.error';

describe('ReplaceInstanceExercisesUseCase', () => {
  let instanceRepository: jest.Mocked<RoutineInstanceRepositoryPort>;
  let carteraRepository: jest.Mocked<CarteraRepositoryPort>;
  let useCase: ReplaceInstanceExercisesUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };

  const instancia: RoutineInstanceDetail = {
    id: 'inst-1',
    gymId: 'gym-1',
    profesorId: 'prof-1',
    alumnoId: 'alum-1',
    nombre: 'Full body',
    origenTemplateId: null,
    vigenteDesde: new Date(),
    vigenteHasta: null,
    activa: true,
    ejercicios: [],
  };

  const unEjercicio = {
    exerciseId: 'ex-1',
    orden: 1,
    series: 3,
    repeticiones: 10,
    peso: 20,
    descanso: 60,
    notas: null,
  };

  beforeEach(() => {
    instanceRepository = {
      findVigentePorAlumno: jest.fn(),
      findById: jest.fn(),
      crear: jest.fn(),
      update: jest.fn(),
      replaceExercises: jest.fn(),
    };
    carteraRepository = {
      existe: jest.fn(),
      crear: jest.fn(),
      eliminar: jest.fn(),
      findAlumnosDeProfesor: jest.fn(),
      findProfesoresDeAlumno: jest.fn(),
    };
    useCase = new ReplaceInstanceExercisesUseCase(instanceRepository, carteraRepository);
  });

  it('lanza RoutineInstanceNotFoundError si no existe', async () => {
    instanceRepository.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        instanceId: 'no-existe',
        ejercicios: [unEjercicio],
      }),
    ).rejects.toThrow(RoutineInstanceNotFoundError);
  });

  it('lanza AlumnoNotInCarteraError si el alumno no está en la cartera del invocador', async () => {
    instanceRepository.findById.mockResolvedValue(instancia);
    carteraRepository.existe.mockResolvedValue(false);
    await expect(
      useCase.execute({ invocadoPor: profesor, instanceId: 'inst-1', ejercicios: [unEjercicio] }),
    ).rejects.toThrow(AlumnoNotInCarteraError);
  });

  it('lanza TooManyExercisesError si vienen más de 50', async () => {
    instanceRepository.findById.mockResolvedValue(instancia);
    carteraRepository.existe.mockResolvedValue(true);
    const cincuentaYUno = Array.from({ length: 51 }, (_, i) => ({ ...unEjercicio, orden: i + 1 }));

    await expect(
      useCase.execute({ invocadoPor: profesor, instanceId: 'inst-1', ejercicios: cincuentaYUno }),
    ).rejects.toThrow(TooManyExercisesError);
  });

  it('reemplaza los ejercicios si todo es válido', async () => {
    instanceRepository.findById.mockResolvedValue(instancia);
    carteraRepository.existe.mockResolvedValue(true);

    await useCase.execute({
      invocadoPor: profesor,
      instanceId: 'inst-1',
      ejercicios: [unEjercicio],
    });

    expect(instanceRepository.replaceExercises).toHaveBeenCalledWith('inst-1', [unEjercicio]);
  });
});
```

- [ ] **Step 8: Ejecutar y verificar que falla, luego implementar**

Run: `pnpm --filter api test -- replace-instance-exercises` → FAIL.

Crear `apps/api/src/routines/application/replace-instance-exercises.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import {
  CARTERA_REPOSITORY,
  CarteraRepositoryPort,
} from '../../identity/application/ports/cartera-repository.port';
import {
  EjercicioItem,
  ROUTINE_INSTANCE_REPOSITORY,
  RoutineInstanceRepositoryPort,
} from './ports/routine-instance-repository.port';
import { RoutineInstanceNotFoundError } from './errors/routine-instance-not-found.error';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';
import { TooManyExercisesError } from './errors/too-many-exercises.error';

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
  ) {}

  async execute(input: ReplaceInstanceExercisesInput): Promise<void> {
    const instance = await this.instanceRepository.findById(input.instanceId);
    if (!instance) {
      throw new RoutineInstanceNotFoundError(input.instanceId);
    }

    const enCartera = await this.carteraRepository.existe(input.invocadoPor.id, instance.alumnoId);
    if (!enCartera) {
      throw new AlumnoNotInCarteraError(instance.alumnoId);
    }

    if (input.ejercicios.length > MAX_EJERCICIOS) {
      throw new TooManyExercisesError(input.ejercicios.length);
    }

    await this.instanceRepository.replaceExercises(input.instanceId, input.ejercicios);
  }
}
```

Run: `pnpm --filter api test -- replace-instance-exercises` → PASS (4 tests).

- [ ] **Step 9: Test de `GetAlumnoRutinaVigenteAsProfesorUseCase` y `GetMiRutinaVigenteUseCase`**

Ambos comparten la lógica de resolución de ejercicios contra `ExerciseRepositoryPort.findByIds` — se definen juntos porque `RutinaVigenteOutput` es el mismo tipo de salida.

Crear `apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.spec.ts`:

```typescript
import { Role } from '../../identity/domain/role';
import { GetAlumnoRutinaVigenteAsProfesorUseCase } from './get-alumno-rutina-vigente-as-profesor.use-case';
import {
  RoutineInstanceRepositoryPort,
  RoutineInstanceDetail,
} from './ports/routine-instance-repository.port';
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
        descanso: 60,
        notas: null,
      },
    ],
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
      crear: jest.fn(),
      update: jest.fn(),
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
});
```

- [ ] **Step 10: Ejecutar y verificar que falla, luego implementar**

Run: `pnpm --filter api test -- get-alumno-rutina-vigente-as-profesor` → FAIL.

Crear `apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.ts`:

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
  descanso: number;
  notas: string | null;
}

export interface RutinaVigenteOutput {
  id: string;
  nombre: string;
  ejercicios: RutinaVigenteEjercicioResuelto[];
}

@Injectable()
export class GetAlumnoRutinaVigenteAsProfesorUseCase {
  constructor(
    @Inject(ROUTINE_INSTANCE_REPOSITORY)
    private readonly instanceRepository: RoutineInstanceRepositoryPort,
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
  ) {}

  async execute(input: GetAlumnoRutinaVigenteAsProfesorInput): Promise<RutinaVigenteOutput | null> {
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

    return this.resolverRutina(instancia.id, instancia.nombre, instancia.ejercicios);
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
      descanso: number;
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
          descanso: e.descanso,
          notas: e.notas,
        };
      }),
    };
  }
}
```

Run: `pnpm --filter api test -- get-alumno-rutina-vigente-as-profesor` → PASS (4 tests).

- [ ] **Step 11: Test de `GetMiRutinaVigenteUseCase`**

Crear `apps/api/src/routines/application/get-mi-rutina-vigente.use-case.spec.ts`:

```typescript
import { Role } from '../../identity/domain/role';
import { GetMiRutinaVigenteUseCase } from './get-mi-rutina-vigente.use-case';
import {
  RoutineInstanceRepositoryPort,
  RoutineInstanceDetail,
} from './ports/routine-instance-repository.port';
import {
  ExerciseRepositoryPort,
  ExerciseSummary,
} from '../../exercise-catalog/application/ports/exercise-repository.port';

describe('GetMiRutinaVigenteUseCase', () => {
  let instanceRepository: jest.Mocked<RoutineInstanceRepositoryPort>;
  let exerciseRepository: jest.Mocked<ExerciseRepositoryPort>;
  let useCase: GetMiRutinaVigenteUseCase;

  const alumno = { id: 'alum-1', gymId: 'gym-1', role: Role.ALUMNO };

  const instancia: RoutineInstanceDetail = {
    id: 'inst-1',
    gymId: 'gym-1',
    profesorId: 'prof-1',
    alumnoId: 'alum-1',
    nombre: 'Full body',
    origenTemplateId: null,
    vigenteDesde: new Date(),
    vigenteHasta: null,
    activa: true,
    ejercicios: [
      {
        exerciseId: 'ex-1',
        orden: 1,
        series: 3,
        repeticiones: 10,
        peso: null,
        descanso: 60,
        notas: null,
      },
    ],
  };

  const ejercicioResuelto: ExerciseSummary = {
    id: 'ex-1',
    nombre: 'Sentadilla',
    imageUrl: null,
    gifUrl: 'https://x/anim.gif',
    parteCuerpo: 'upper legs',
    grupoMuscular: 'quads',
    equipamiento: 'barbell',
  };

  beforeEach(() => {
    instanceRepository = {
      findVigentePorAlumno: jest.fn(),
      findById: jest.fn(),
      crear: jest.fn(),
      update: jest.fn(),
      replaceExercises: jest.fn(),
    };
    exerciseRepository = { findMany: jest.fn(), findById: jest.fn(), findByIds: jest.fn() };
    useCase = new GetMiRutinaVigenteUseCase(instanceRepository, exerciseRepository);
  });

  it('siempre resuelve la rutina del propio invocadoPor.id, nunca de un alumnoId ajeno', async () => {
    instanceRepository.findVigentePorAlumno.mockResolvedValue(instancia);
    exerciseRepository.findByIds.mockResolvedValue([ejercicioResuelto]);

    await useCase.execute({ invocadoPor: alumno });

    expect(instanceRepository.findVigentePorAlumno).toHaveBeenCalledWith('alum-1');
  });

  it('devuelve null si no hay rutina vigente (HU-08, estado vacío)', async () => {
    instanceRepository.findVigentePorAlumno.mockResolvedValue(null);

    const resultado = await useCase.execute({ invocadoPor: alumno });

    expect(resultado).toBeNull();
  });
});
```

- [ ] **Step 12: Ejecutar y verificar que falla, luego implementar**

Run: `pnpm --filter api test -- get-mi-rutina-vigente` → FAIL.

Crear `apps/api/src/routines/application/get-mi-rutina-vigente.use-case.ts`:

```typescript
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
import { RutinaVigenteOutput } from './get-alumno-rutina-vigente-as-profesor.use-case';

export interface GetMiRutinaVigenteInput {
  invocadoPor: AuthenticatedUser;
}

/** HU-08 — el ALUMNO ve siempre SU PROPIA rutina, nunca un alumnoId externo. */
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

    const catalogados = await this.exerciseRepository.findByIds(
      instancia.ejercicios.map((e) => e.exerciseId),
    );
    const porId = new Map(catalogados.map((e) => [e.id, e]));

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
          descanso: e.descanso,
          notas: e.notas,
        };
      }),
    };
  }
}
```

Run: `pnpm --filter api test -- get-mi-rutina-vigente` → PASS (2 tests).

- [ ] **Step 13: Suite completa de routines**

Run: `pnpm --filter api test -- routines`
Expected: PASS — suma las 6 suites de Templates (Tarea 6) + las 5 de Instances de esta tarea.

- [ ] **Step 14: Commit**

```bash
git add apps/api/src/routines/application/assign-routine-to-alumno.use-case.ts \
        apps/api/src/routines/application/assign-routine-to-alumno.use-case.spec.ts \
        apps/api/src/routines/application/update-routine-instance.use-case.ts \
        apps/api/src/routines/application/update-routine-instance.use-case.spec.ts \
        apps/api/src/routines/application/replace-instance-exercises.use-case.ts \
        apps/api/src/routines/application/replace-instance-exercises.use-case.spec.ts \
        apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.ts \
        apps/api/src/routines/application/get-alumno-rutina-vigente-as-profesor.use-case.spec.ts \
        apps/api/src/routines/application/get-mi-rutina-vigente.use-case.ts \
        apps/api/src/routines/application/get-mi-rutina-vigente.use-case.spec.ts
git commit -m "feat(routines): casos de uso de RoutineInstance (HU-05, HU-06, HU-08)"
```

---

## Task 9: HTTP — DTOs, controllers y wiring de `RoutinesModule`

**Files:**

- Create: `apps/api/src/routines/infrastructure/http/dto/create-routine-template.dto.ts`
- Create: `apps/api/src/routines/infrastructure/http/dto/update-routine-template.dto.ts`
- Create: `apps/api/src/routines/infrastructure/http/dto/ejercicio.dto.ts`
- Create: `apps/api/src/routines/infrastructure/http/dto/replace-exercises.dto.ts`
- Create: `apps/api/src/routines/infrastructure/http/dto/create-routine-instance.dto.ts`
- Create: `apps/api/src/routines/infrastructure/http/dto/update-routine-instance.dto.ts`
- Create: `apps/api/src/routines/infrastructure/http/routine-templates.controller.ts`
- Create: `apps/api/src/routines/infrastructure/http/routine-instances.controller.ts`
- Create: `apps/api/src/routines/infrastructure/http/routines.controller.ts`
- Create: `apps/api/src/routines/infrastructure/http/routine-templates.controller.e2e.spec.ts`
- Create: `apps/api/src/routines/infrastructure/http/routine-instances.controller.e2e.spec.ts`
- Modify: `apps/api/src/routines/routines.module.ts`

**Interfaces:**

- Consumes: los 11 casos de uso de las Tareas 6 y 8; `ROUTINE_TEMPLATE_REPOSITORY`/`PrismaRoutineTemplateRepository` (Tarea 5); `ROUTINE_INSTANCE_REPOSITORY`/`PrismaRoutineInstanceRepository` (Tarea 7); `EXERCISE_REPOSITORY` (exportado por `ExerciseCatalogModule`, Tarea 2); `CARTERA_REPOSITORY`/`USER_REPOSITORY` (exportados por `IdentityModule`, ya existentes); `Roles`, `Role`, `AuthenticatedUser` (identity).
- Produces: los 12 endpoints HTTP del spec §4.5, y `RoutinesModule` exportando `ROUTINE_TEMPLATE_REPOSITORY`/`ROUTINE_INSTANCE_REPOSITORY` (los va a necesitar la Tarea 10 para el adapter de cleanup, que vive en el mismo módulo así que no hace falta exportarlos fuera de `routines` — pero si `RoutinesCleanupPort` se registra en este mismo módulo, no hace falta ninguna exportación nueva).

- [ ] **Step 1: DTO de ejercicio (compartido)**

Crear `apps/api/src/routines/infrastructure/http/dto/ejercicio.dto.ts`:

```typescript
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

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
  @IsInt()
  @Min(0)
  peso?: number;

  @IsInt()
  @Min(0)
  descanso!: number;

  @IsOptional()
  @IsString()
  notas?: string;
}
```

- [ ] **Step 2: DTO de replace-exercises (compartido entre templates e instances)**

Crear `apps/api/src/routines/infrastructure/http/dto/replace-exercises.dto.ts`:

```typescript
import { Type } from 'class-transformer';
import { ArrayMaxSize, ValidateNested } from 'class-validator';
import { EjercicioDto } from './ejercicio.dto';

export class ReplaceExercisesDto {
  @ValidateNested({ each: true })
  @Type(() => EjercicioDto)
  @ArrayMaxSize(50)
  ejercicios!: EjercicioDto[];
}
```

- [ ] **Step 3: DTOs de plantilla**

Crear `apps/api/src/routines/infrastructure/http/dto/create-routine-template.dto.ts`:

```typescript
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateRoutineTemplateDto {
  @IsString()
  @MinLength(2)
  nombre!: string;

  @IsOptional()
  @IsString()
  descripcion?: string;
}
```

Crear `apps/api/src/routines/infrastructure/http/dto/update-routine-template.dto.ts`:

```typescript
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateRoutineTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  nombre?: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}
```

- [ ] **Step 4: DTOs de instancia**

Crear `apps/api/src/routines/infrastructure/http/dto/create-routine-instance.dto.ts`:

```typescript
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
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
  @ValidateNested({ each: true })
  @Type(() => EjercicioDto)
  @ArrayMaxSize(50)
  ejercicios?: EjercicioDto[];
}
```

Crear `apps/api/src/routines/infrastructure/http/dto/update-routine-instance.dto.ts`:

```typescript
import { IsString, MinLength } from 'class-validator';

export class UpdateRoutineInstanceDto {
  @IsString()
  @MinLength(2)
  nombre!: string;
}
```

- [ ] **Step 5: `RoutineTemplatesController`**

Crear `apps/api/src/routines/infrastructure/http/routine-templates.controller.ts`:

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../../identity/infrastructure/decorators/roles.decorator';
import { Role } from '../../../identity/domain/role';
import { AuthenticatedUser } from '../../../identity/domain/authenticated-user';
import { CreateRoutineTemplateUseCase } from '../../application/create-routine-template.use-case';
import { ListRoutineTemplatesUseCase } from '../../application/list-routine-templates.use-case';
import { GetRoutineTemplateUseCase } from '../../application/get-routine-template.use-case';
import { UpdateRoutineTemplateUseCase } from '../../application/update-routine-template.use-case';
import { ReplaceTemplateExercisesUseCase } from '../../application/replace-template-exercises.use-case';
import { DeleteRoutineTemplateUseCase } from '../../application/delete-routine-template.use-case';
import { CreateRoutineTemplateDto } from './dto/create-routine-template.dto';
import { UpdateRoutineTemplateDto } from './dto/update-routine-template.dto';
import { ReplaceExercisesDto } from './dto/replace-exercises.dto';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@Controller('routine-templates')
@Roles(Role.PROFESOR)
export class RoutineTemplatesController {
  constructor(
    private readonly createUseCase: CreateRoutineTemplateUseCase,
    private readonly listUseCase: ListRoutineTemplatesUseCase,
    private readonly getUseCase: GetRoutineTemplateUseCase,
    private readonly updateUseCase: UpdateRoutineTemplateUseCase,
    private readonly replaceExercisesUseCase: ReplaceTemplateExercisesUseCase,
    private readonly deleteUseCase: DeleteRoutineTemplateUseCase,
  ) {}

  @Post()
  async create(@Body() dto: CreateRoutineTemplateDto, @Req() req: RequestWithUser) {
    return this.createUseCase.execute({
      invocadoPor: req.user,
      nombre: dto.nombre,
      descripcion: dto.descripcion,
    });
  }

  @Get()
  async list(@Req() req: RequestWithUser) {
    return this.listUseCase.execute({ invocadoPor: req.user });
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.getUseCase.execute({ invocadoPor: req.user, templateId: id });
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRoutineTemplateDto,
    @Req() req: RequestWithUser,
  ) {
    return this.updateUseCase.execute({
      invocadoPor: req.user,
      templateId: id,
      nombre: dto.nombre,
      descripcion: dto.descripcion,
      activa: dto.activa,
    });
  }

  @Put(':id/exercises')
  @HttpCode(204)
  async replaceExercises(
    @Param('id') id: string,
    @Body() dto: ReplaceExercisesDto,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    await this.replaceExercisesUseCase.execute({
      invocadoPor: req.user,
      templateId: id,
      ejercicios: dto.ejercicios,
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string, @Req() req: RequestWithUser): Promise<void> {
    await this.deleteUseCase.execute({ invocadoPor: req.user, templateId: id });
  }
}
```

- [ ] **Step 6: `RoutineInstancesController`**

Crear `apps/api/src/routines/infrastructure/http/routine-instances.controller.ts`:

```typescript
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../../identity/infrastructure/decorators/roles.decorator';
import { Role } from '../../../identity/domain/role';
import { AuthenticatedUser } from '../../../identity/domain/authenticated-user';
import { AssignRoutineToAlumnoUseCase } from '../../application/assign-routine-to-alumno.use-case';
import { UpdateRoutineInstanceUseCase } from '../../application/update-routine-instance.use-case';
import { ReplaceInstanceExercisesUseCase } from '../../application/replace-instance-exercises.use-case';
import { CreateRoutineInstanceDto } from './dto/create-routine-instance.dto';
import { UpdateRoutineInstanceDto } from './dto/update-routine-instance.dto';
import { ReplaceExercisesDto } from './dto/replace-exercises.dto';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@Controller('routine-instances')
@Roles(Role.PROFESOR)
export class RoutineInstancesController {
  constructor(
    private readonly assignUseCase: AssignRoutineToAlumnoUseCase,
    private readonly updateUseCase: UpdateRoutineInstanceUseCase,
    private readonly replaceExercisesUseCase: ReplaceInstanceExercisesUseCase,
  ) {}

  @Post()
  async create(@Body() dto: CreateRoutineInstanceDto, @Req() req: RequestWithUser) {
    return this.assignUseCase.execute({
      invocadoPor: req.user,
      alumnoId: dto.alumnoId,
      nombre: dto.nombre,
      origenTemplateId: dto.origenTemplateId,
      ejercicios: dto.ejercicios,
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

  @Put(':id/exercises')
  @HttpCode(204)
  async replaceExercises(
    @Param('id') id: string,
    @Body() dto: ReplaceExercisesDto,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    await this.replaceExercisesUseCase.execute({
      invocadoPor: req.user,
      instanceId: id,
      ejercicios: dto.ejercicios,
    });
  }
}
```

- [ ] **Step 7: `RoutinesController` (los dos GET de rutina vigente)**

Crear `apps/api/src/routines/infrastructure/http/routines.controller.ts`:

```typescript
import { Controller, Get, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../../identity/infrastructure/decorators/roles.decorator';
import { Role } from '../../../identity/domain/role';
import { AuthenticatedUser } from '../../../identity/domain/authenticated-user';
import { GetAlumnoRutinaVigenteAsProfesorUseCase } from '../../application/get-alumno-rutina-vigente-as-profesor.use-case';
import { GetMiRutinaVigenteUseCase } from '../../application/get-mi-rutina-vigente.use-case';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

/**
 * Sub-recursos de usuario, no de rutina — mismo patrón que
 * `CarteraController` de 3A (prefijo `users`, archivo separado).
 */
@Controller('users')
export class RoutinesController {
  constructor(
    private readonly getAlumnoRutinaUseCase: GetAlumnoRutinaVigenteAsProfesorUseCase,
    private readonly getMiRutinaUseCase: GetMiRutinaVigenteUseCase,
  ) {}

  @Get(':alumnoId/rutina-vigente')
  @Roles(Role.PROFESOR)
  async rutinaDeAlumno(@Param('alumnoId') alumnoId: string, @Req() req: RequestWithUser) {
    return this.getAlumnoRutinaUseCase.execute({ invocadoPor: req.user, alumnoId });
  }

  @Get('me/rutina-vigente')
  @Roles(Role.ALUMNO)
  async miRutina(@Req() req: RequestWithUser) {
    return this.getMiRutinaUseCase.execute({ invocadoPor: req.user });
  }
}
```

- [ ] **Step 8: Wirear `RoutinesModule`**

Reemplazar el contenido completo de `apps/api/src/routines/routines.module.ts`. **Esta tarea NO registra `RoutinesCleanupPort`** — eso lo agrega la Tarea 10, que crea el adapter; hacerlo acá crearía una referencia a un archivo que todavía no existe.

```typescript
import { Module } from '@nestjs/common';
import { ROUTINE_TEMPLATE_REPOSITORY } from './application/ports/routine-template-repository.port';
import { ROUTINE_INSTANCE_REPOSITORY } from './application/ports/routine-instance-repository.port';
import { PrismaRoutineTemplateRepository } from './infrastructure/persistence/prisma-routine-template.repository';
import { PrismaRoutineInstanceRepository } from './infrastructure/persistence/prisma-routine-instance.repository';
import { CreateRoutineTemplateUseCase } from './application/create-routine-template.use-case';
import { ListRoutineTemplatesUseCase } from './application/list-routine-templates.use-case';
import { GetRoutineTemplateUseCase } from './application/get-routine-template.use-case';
import { UpdateRoutineTemplateUseCase } from './application/update-routine-template.use-case';
import { ReplaceTemplateExercisesUseCase } from './application/replace-template-exercises.use-case';
import { DeleteRoutineTemplateUseCase } from './application/delete-routine-template.use-case';
import { AssignRoutineToAlumnoUseCase } from './application/assign-routine-to-alumno.use-case';
import { UpdateRoutineInstanceUseCase } from './application/update-routine-instance.use-case';
import { ReplaceInstanceExercisesUseCase } from './application/replace-instance-exercises.use-case';
import { GetAlumnoRutinaVigenteAsProfesorUseCase } from './application/get-alumno-rutina-vigente-as-profesor.use-case';
import { GetMiRutinaVigenteUseCase } from './application/get-mi-rutina-vigente.use-case';
import { RoutineTemplatesController } from './infrastructure/http/routine-templates.controller';
import { RoutineInstancesController } from './infrastructure/http/routine-instances.controller';
import { RoutinesController } from './infrastructure/http/routines.controller';

@Module({
  imports: [],
  controllers: [RoutineTemplatesController, RoutineInstancesController, RoutinesController],
  providers: [
    { provide: ROUTINE_TEMPLATE_REPOSITORY, useClass: PrismaRoutineTemplateRepository },
    { provide: ROUTINE_INSTANCE_REPOSITORY, useClass: PrismaRoutineInstanceRepository },
    CreateRoutineTemplateUseCase,
    ListRoutineTemplatesUseCase,
    GetRoutineTemplateUseCase,
    UpdateRoutineTemplateUseCase,
    ReplaceTemplateExercisesUseCase,
    DeleteRoutineTemplateUseCase,
    AssignRoutineToAlumnoUseCase,
    UpdateRoutineInstanceUseCase,
    ReplaceInstanceExercisesUseCase,
    GetAlumnoRutinaVigenteAsProfesorUseCase,
    GetMiRutinaVigenteUseCase,
  ],
})
export class RoutinesModule {}
```

- [ ] **Step 9: e2e de `RoutineTemplatesController`**

Crear `apps/api/src/routines/infrastructure/http/routine-templates.controller.e2e.spec.ts`:

```typescript
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { RoutineTemplatesController } from './routine-templates.controller';
import { CreateRoutineTemplateUseCase } from '../../application/create-routine-template.use-case';
import { ListRoutineTemplatesUseCase } from '../../application/list-routine-templates.use-case';
import { GetRoutineTemplateUseCase } from '../../application/get-routine-template.use-case';
import { UpdateRoutineTemplateUseCase } from '../../application/update-routine-template.use-case';
import { ReplaceTemplateExercisesUseCase } from '../../application/replace-template-exercises.use-case';
import { DeleteRoutineTemplateUseCase } from '../../application/delete-routine-template.use-case';
import {
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateRepositoryPort,
  RoutineTemplateDetail,
} from '../../application/ports/routine-template-repository.port';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
  UserRecord,
} from '../../../identity/application/ports/user-repository.port';
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

const TEST_SUPABASE_URL = 'https://e2e-routine-templates.supabase.co';

jest.mock('jose', () => {
  const actual = jest.requireActual('jose');
  return { ...actual, createRemoteJWKSet: jest.fn() };
});

const { createRemoteJWKSet: mockCreateRemoteJWKSet } = jest.requireMock('jose') as {
  createRemoteJWKSet: jest.Mock;
};

describe('/routine-templates (e2e)', () => {
  let app: INestApplication;
  let claves: TestJwtKeys;

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
    nombre: 'Juan',
    role: Role.ALUMNO,
    activo: true,
  };

  const templateBase: RoutineTemplateDetail = {
    id: 'tpl-1',
    gymId: 'gym-A',
    profesorId: 'prof-1',
    nombre: 'Full body',
    descripcion: null,
    activa: false,
    ejercicios: [],
  };

  const fakeTemplateRepository: RoutineTemplateRepositoryPort = {
    findByProfesor: jest.fn(async () => [templateBase]),
    findById: jest.fn(async (id: string) => (id === 'tpl-1' ? templateBase : null)),
    create: jest.fn(async (data) => ({ id: 'tpl-2', descripcion: null, activa: true, ...data })),
    update: jest.fn(async (id, data) => ({ ...templateBase, id, ...data })),
    delete: jest.fn(async () => undefined),
    replaceExercises: jest.fn(async () => undefined),
  };

  const fakeUserRepository: Pick<UserRepositoryPort, 'findByAuthUserId'> = {
    findByAuthUserId: async (authUserId: string) => {
      if (authUserId === 'auth-prof') return profesor;
      if (authUserId === 'auth-alum') return alumno;
      return null;
    },
  };

  function firmarTokenPara(sub: string): Promise<string> {
    return signTestToken(claves.privateKey, { issuer: `${TEST_SUPABASE_URL}/auth/v1`, sub });
  }

  beforeAll(async () => {
    process.env.SUPABASE_URL = TEST_SUPABASE_URL;
    claves = await buildTestJwtKeys();
    mockCreateRemoteJWKSet.mockReturnValue(claves.jwks);

    const moduleRef = await Test.createTestingModule({
      controllers: [RoutineTemplatesController],
      providers: [
        CreateRoutineTemplateUseCase,
        ListRoutineTemplatesUseCase,
        GetRoutineTemplateUseCase,
        UpdateRoutineTemplateUseCase,
        ReplaceTemplateExercisesUseCase,
        DeleteRoutineTemplateUseCase,
        { provide: ROUTINE_TEMPLATE_REPOSITORY, useValue: fakeTemplateRepository },
        { provide: USER_REPOSITORY, useValue: fakeUserRepository },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: GymScopeGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rechaza sin token (401)', async () => {
    await request(app.getHttpServer()).get('/routine-templates').expect(401);
  });

  it('un ALUMNO no puede acceder (403) — el controller entero es @Roles(PROFESOR)', async () => {
    const token = await firmarTokenPara('auth-alum');
    await request(app.getHttpServer())
      .get('/routine-templates')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('PROFESOR crea una plantilla — 201', async () => {
    const token = await firmarTokenPara('auth-prof');
    const res = await request(app.getHttpServer())
      .post('/routine-templates')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Piernas' })
      .expect(201);

    expect(res.body).toMatchObject({ nombre: 'Piernas' });
  });

  it('rechaza el borrado (409) si la plantilla está activa', async () => {
    (fakeTemplateRepository.findById as jest.Mock).mockResolvedValueOnce({
      ...templateBase,
      activa: true,
    });
    const token = await firmarTokenPara('auth-prof');
    await request(app.getHttpServer())
      .delete('/routine-templates/tpl-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });

  it('acepta el borrado (204) si la plantilla ya está desactivada', async () => {
    const token = await firmarTokenPara('auth-prof');
    await request(app.getHttpServer())
      .delete('/routine-templates/tpl-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
  });

  it('rechaza más de 50 ejercicios en el replace-all (400, ValidationPipe)', async () => {
    const token = await firmarTokenPara('auth-prof');
    const cincuentaYUno = Array.from({ length: 51 }, (_, i) => ({
      exerciseId: 'ex-1',
      orden: i + 1,
      series: 3,
      repeticiones: 10,
      descanso: 60,
    }));
    await request(app.getHttpServer())
      .put('/routine-templates/tpl-1/exercises')
      .set('Authorization', `Bearer ${token}`)
      .send({ ejercicios: cincuentaYUno })
      .expect(400);
  });
});
```

- [ ] **Step 10: Ejecutar el e2e y verificar que pasa**

Run: `pnpm --filter api test -- routine-templates.controller`
Expected: PASS (6 tests)

- [ ] **Step 11: e2e de `RoutineInstancesController`**

Crear `apps/api/src/routines/infrastructure/http/routine-instances.controller.e2e.spec.ts`:

```typescript
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { RoutineInstancesController } from './routine-instances.controller';
import { AssignRoutineToAlumnoUseCase } from '../../application/assign-routine-to-alumno.use-case';
import { UpdateRoutineInstanceUseCase } from '../../application/update-routine-instance.use-case';
import { ReplaceInstanceExercisesUseCase } from '../../application/replace-instance-exercises.use-case';
import {
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateRepositoryPort,
} from '../../application/ports/routine-template-repository.port';
import {
  ROUTINE_INSTANCE_REPOSITORY,
  RoutineInstanceRepositoryPort,
  RoutineInstanceDetail,
} from '../../application/ports/routine-instance-repository.port';
import {
  CARTERA_REPOSITORY,
  CarteraRepositoryPort,
} from '../../../identity/application/ports/cartera-repository.port';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
  UserRecord,
} from '../../../identity/application/ports/user-repository.port';
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

const TEST_SUPABASE_URL = 'https://e2e-routine-instances.supabase.co';

jest.mock('jose', () => {
  const actual = jest.requireActual('jose');
  return { ...actual, createRemoteJWKSet: jest.fn() };
});

const { createRemoteJWKSet: mockCreateRemoteJWKSet } = jest.requireMock('jose') as {
  createRemoteJWKSet: jest.Mock;
};

describe('/routine-instances (e2e)', () => {
  let app: INestApplication;
  let claves: TestJwtKeys;

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
    nombre: 'Juan',
    role: Role.ALUMNO,
    activo: true,
  };

  const instanciaBase: RoutineInstanceDetail = {
    id: 'inst-1',
    gymId: 'gym-A',
    profesorId: 'prof-1',
    alumnoId: 'alum-1',
    nombre: 'Full body',
    origenTemplateId: null,
    vigenteDesde: new Date(),
    vigenteHasta: null,
    activa: true,
    ejercicios: [],
  };

  const fakeInstanceRepository: RoutineInstanceRepositoryPort = {
    findVigentePorAlumno: jest.fn(async () => instanciaBase),
    findById: jest.fn(async (id: string) => (id === 'inst-1' ? instanciaBase : null)),
    crear: jest.fn(async (data) => ({ ...instanciaBase, ...data })),
    update: jest.fn(async (id, data) => ({ ...instanciaBase, id, ...data })),
    replaceExercises: jest.fn(async () => undefined),
  };

  const fakeTemplateRepository: Pick<RoutineTemplateRepositoryPort, 'findById'> = {
    findById: jest.fn(async () => null),
  };

  const fakeCarteraRepository: Pick<CarteraRepositoryPort, 'existe'> = {
    existe: jest.fn(async () => true),
  };

  const fakeUserRepository: Pick<UserRepositoryPort, 'findByAuthUserId' | 'findById'> = {
    findByAuthUserId: async (authUserId: string) => (authUserId === 'auth-prof' ? profesor : null),
    findById: async (id: string) => (id === 'alum-1' ? alumno : null),
  };

  function firmarToken(): Promise<string> {
    return signTestToken(claves.privateKey, {
      issuer: `${TEST_SUPABASE_URL}/auth/v1`,
      sub: 'auth-prof',
    });
  }

  beforeAll(async () => {
    process.env.SUPABASE_URL = TEST_SUPABASE_URL;
    claves = await buildTestJwtKeys();
    mockCreateRemoteJWKSet.mockReturnValue(claves.jwks);

    const moduleRef = await Test.createTestingModule({
      controllers: [RoutineInstancesController],
      providers: [
        AssignRoutineToAlumnoUseCase,
        UpdateRoutineInstanceUseCase,
        ReplaceInstanceExercisesUseCase,
        { provide: ROUTINE_INSTANCE_REPOSITORY, useValue: fakeInstanceRepository },
        { provide: ROUTINE_TEMPLATE_REPOSITORY, useValue: fakeTemplateRepository },
        { provide: CARTERA_REPOSITORY, useValue: fakeCarteraRepository },
        { provide: USER_REPOSITORY, useValue: fakeUserRepository },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: GymScopeGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('PROFESOR arma una instancia desde cero — 201', async () => {
    const token = await firmarToken();
    const res = await request(app.getHttpServer())
      .post('/routine-instances')
      .set('Authorization', `Bearer ${token}`)
      .send({
        alumnoId: 'alum-1',
        nombre: 'Custom',
        ejercicios: [{ exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, descanso: 60 }],
      })
      .expect(201);

    expect(res.body).toMatchObject({ nombre: 'Custom' });
  });

  it('rechaza (400, ValidationPipe) si vienen origenTemplateId Y ejercicios juntos — no, el DTO permite ambos opcionales; el 400 real lo tira el caso de uso', async () => {
    const token = await firmarToken();
    const res = await request(app.getHttpServer())
      .post('/routine-instances')
      .set('Authorization', `Bearer ${token}`)
      .send({
        alumnoId: 'alum-1',
        nombre: 'Custom',
        origenTemplateId: 'tpl-1',
        ejercicios: [{ exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, descanso: 60 }],
      })
      .expect(400);

    expect(res.body.error).toBe('InvalidRoutineInstanceInputError');
  });

  it('rechaza (403, AlumnoNotInCarteraError) si el alumno no está en la cartera', async () => {
    (fakeCarteraRepository.existe as jest.Mock).mockResolvedValueOnce(false);
    const token = await firmarToken();
    const res = await request(app.getHttpServer())
      .post('/routine-instances')
      .set('Authorization', `Bearer ${token}`)
      .send({
        alumnoId: 'alum-1',
        nombre: 'Custom',
        ejercicios: [{ exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, descanso: 60 }],
      })
      .expect(403);

    expect(res.body.error).toBe('AlumnoNotInCarteraError');
  });
});
```

- [ ] **Step 12: Ejecutar el e2e y verificar que pasa**

Run: `pnpm --filter api test -- routine-instances.controller`
Expected: PASS (3 tests)

- [ ] **Step 13: Suite completa y build**

Run: `pnpm --filter api test && pnpm --filter api build && pnpm --filter api prisma:validate`
Expected: los tres exitosos — `RoutinesModule` de esta tarea no depende de nada de la Tarea 10 (el `RoutinesCleanupPort` se registra ahí, en un `Module.imports`/`providers` que esta tarea no toca).

- [ ] **Step 14: Commit**

```bash
git add apps/api/src/routines/infrastructure/http apps/api/src/routines/routines.module.ts
git commit -m "feat(routines): endpoints HTTP de templates, instances y rutina vigente"
```

---

## Task 10: Hard-delete de usuarios — adapter DIP + casos de uso + HTTP + wiring cruzado

**Files:**

- Create: `apps/api/src/routines/infrastructure/persistence/prisma-routines-cleanup.adapter.ts`
- Modify: `apps/api/src/routines/routines.module.ts`
- Create: `apps/api/src/identity/application/get-user-deletion-impact.use-case.ts`
- Create: `apps/api/src/identity/application/get-user-deletion-impact.use-case.spec.ts`
- Create: `apps/api/src/identity/application/delete-user-permanently.use-case.ts`
- Create: `apps/api/src/identity/application/delete-user-permanently.use-case.spec.ts`
- Modify: `apps/api/src/identity/infrastructure/http/users.controller.ts`
- Modify: `apps/api/src/identity/identity.module.ts`

**Interfaces:**

- Consumes: `ROUTINES_CLEANUP`, `RoutinesCleanupPort`, `RoutinesCleanupImpact` (Tarea 4); `UserNotInactiveError`, `CannotTargetAdminError` (Tarea 4); `resolveUserInGym` (Tarea 3); `CARTERA_REPOSITORY`, `CarteraRepositoryPort`, `USER_REPOSITORY`, `UserRepositoryPort`, `AUTH_PROVIDER`, `AuthProviderPort`, `PrismaService`, `Role`, `AuthenticatedUser`, `InsufficientRoleError` (ya existen).
- Produces: `PrismaRoutinesCleanupAdapter` (implementa `RoutinesCleanupPort`); `GetUserDeletionImpactUseCase.execute(input): Promise<DeletionImpact>`; `DeleteUserPermanentlyUseCase.execute(input): Promise<{ advertencia?: string }>`; `GET /users/:id/deletion-impact`, `DELETE /users/:id/permanent` — consumidos por la UI de admin en el Plan 2.

- [ ] **Step 1: Implementar `PrismaRoutinesCleanupAdapter`**

Crear `apps/api/src/routines/infrastructure/persistence/prisma-routines-cleanup.adapter.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import { Role } from '../../../identity/domain/role';
import {
  RoutinesCleanupImpact,
  RoutinesCleanupPort,
} from '../../../identity/application/ports/routines-cleanup.port';

/**
 * Implementa el puerto que declara `identity` (DIP, ver
 * routines-cleanup.port.ts) — `routines` conoce a `identity` (dirección
 * permitida), nunca al revés.
 */
@Injectable()
export class PrismaRoutinesCleanupAdapter implements RoutinesCleanupPort {
  constructor(private readonly prisma: PrismaService) {}

  async contarImpacto(
    userId: string,
    role: Role.PROFESOR | Role.ALUMNO,
  ): Promise<RoutinesCleanupImpact> {
    if (role === Role.ALUMNO) {
      const instanciasABorrar = await this.prisma.routineInstance.count({
        where: { alumnoId: userId },
      });
      return { plantillasABorrar: 0, instanciasABorrar, instanciasQueSobreviven: 0 };
    }

    const plantillasABorrar = await this.prisma.routineTemplate.count({
      where: { profesorId: userId },
    });

    const instancias = await this.prisma.routineInstance.findMany({
      where: { profesorId: userId },
      select: { alumnoId: true },
    });

    let instanciasABorrar = 0;
    let instanciasQueSobreviven = 0;
    for (const instancia of instancias) {
      const tieneOtroProfesor = await this.prisma.profesorAlumno.findFirst({
        where: { alumnoId: instancia.alumnoId, profesorId: { not: userId } },
      });
      if (tieneOtroProfesor) {
        instanciasQueSobreviven += 1;
      } else {
        instanciasABorrar += 1;
      }
    }

    return { plantillasABorrar, instanciasABorrar, instanciasQueSobreviven };
  }

  async eliminarDatosDe(
    userId: string,
    role: Role.PROFESOR | Role.ALUMNO,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (role === Role.ALUMNO) {
      // Cascada de RoutineInstanceExercise es automática (onDelete: Cascade).
      await tx.routineInstance.deleteMany({ where: { alumnoId: userId } });
      return;
    }

    // Sus plantillas se borran siempre — cascada de ejercicios automática.
    // Las RoutineInstance que las referenciaban por origenTemplateId
    // quedan con ese campo en null automáticamente (onDelete: SetNull).
    await tx.routineTemplate.deleteMany({ where: { profesorId: userId } });

    const instancias = await tx.routineInstance.findMany({
      where: { profesorId: userId },
      select: { id: true, alumnoId: true },
    });

    for (const instancia of instancias) {
      const tieneOtroProfesor = await tx.profesorAlumno.findFirst({
        where: { alumnoId: instancia.alumnoId, profesorId: { not: userId } },
      });
      if (tieneOtroProfesor) {
        await tx.routineInstance.update({
          where: { id: instancia.id },
          data: { profesorId: null },
        });
      } else {
        await tx.routineInstance.delete({ where: { id: instancia.id } });
      }
    }
  }
}
```

- [ ] **Step 2: Registrar el adapter en `RoutinesModule`**

En `apps/api/src/routines/routines.module.ts`, agregar el import y sumar el provider + `exports`:

```typescript
import { ROUTINES_CLEANUP } from '../identity/application/ports/routines-cleanup.port';
import { PrismaRoutinesCleanupAdapter } from './infrastructure/persistence/prisma-routines-cleanup.adapter';
```

En el array `providers`, agregar:

```typescript
    { provide: ROUTINES_CLEANUP, useClass: PrismaRoutinesCleanupAdapter },
```

Y agregar al `@Module`:

```typescript
  exports: [ROUTINES_CLEANUP],
```

- [ ] **Step 3: `IdentityModule` importa `RoutinesModule`**

En `apps/api/src/identity/identity.module.ts`, agregar el import:

```typescript
import { RoutinesModule } from '../routines/routines.module';
```

Y en `imports`:

```typescript
  imports: [RoutinesModule],
```

Esto le da a `IdentityModule` acceso al provider de `ROUTINES_CLEANUP` que exporta `RoutinesModule` — sin que `identity` importe ningún archivo de `routines` fuera de su módulo Nest.

- [ ] **Step 4: Test de `GetUserDeletionImpactUseCase`**

Crear `apps/api/src/identity/application/get-user-deletion-impact.use-case.spec.ts`:

```typescript
import { Role } from '../domain/role';
import { GetUserDeletionImpactUseCase } from './get-user-deletion-impact.use-case';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { CarteraRepositoryPort } from './ports/cartera-repository.port';
import { RoutinesCleanupPort } from './ports/routines-cleanup.port';
import { InsufficientRoleError } from './errors/insufficient-role.error';
import { CannotTargetAdminError } from './errors/cannot-target-admin.error';

describe('GetUserDeletionImpactUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let carteraRepository: jest.Mocked<CarteraRepositoryPort>;
  let routinesCleanup: jest.Mocked<RoutinesCleanupPort>;
  let useCase: GetUserDeletionImpactUseCase;

  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };
  const profesorInvocador = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };

  const profesorObjetivo: UserRecord = {
    id: 'prof-2',
    authUserId: 'auth-p2',
    gymId: 'gym-1',
    username: 'prof2',
    nombre: 'Profe Dos',
    role: Role.PROFESOR,
    activo: false,
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
    carteraRepository = {
      existe: jest.fn(),
      crear: jest.fn(),
      eliminar: jest.fn(),
      findAlumnosDeProfesor: jest.fn(),
      findProfesoresDeAlumno: jest.fn(),
    };
    routinesCleanup = { contarImpacto: jest.fn(), eliminarDatosDe: jest.fn() };
    useCase = new GetUserDeletionImpactUseCase(userRepository, carteraRepository, routinesCleanup);
  });

  it('rechaza si quien invoca no es ADMIN', async () => {
    await expect(
      useCase.execute({ invocadoPor: profesorInvocador, userId: 'prof-2' }),
    ).rejects.toThrow(InsufficientRoleError);
  });

  it('rechaza con CannotTargetAdminError si el objetivo es ADMIN', async () => {
    userRepository.findById.mockResolvedValue({ ...profesorObjetivo, role: Role.ADMIN });
    await expect(useCase.execute({ invocadoPor: admin, userId: 'prof-2' })).rejects.toThrow(
      CannotTargetAdminError,
    );
  });

  it('combina el impacto de routines con los vínculos de cartera', async () => {
    userRepository.findById.mockResolvedValue(profesorObjetivo);
    routinesCleanup.contarImpacto.mockResolvedValue({
      plantillasABorrar: 2,
      instanciasABorrar: 1,
      instanciasQueSobreviven: 3,
    });
    carteraRepository.findAlumnosDeProfesor.mockResolvedValue([
      {
        id: 'a1',
        authUserId: 'x',
        gymId: 'gym-1',
        username: 'a1',
        nombre: 'A1',
        role: Role.ALUMNO,
        activo: true,
      },
    ]);

    const resultado = await useCase.execute({ invocadoPor: admin, userId: 'prof-2' });

    expect(routinesCleanup.contarImpacto).toHaveBeenCalledWith('prof-2', Role.PROFESOR);
    expect(resultado).toEqual({
      plantillasABorrar: 2,
      instanciasABorrar: 1,
      instanciasQueSobreviven: 3,
      vinculosDeCarteraABorrar: 1,
    });
  });
});
```

- [ ] **Step 5: Ejecutar y verificar que falla**

Run: `pnpm --filter api test -- get-user-deletion-impact`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 6: Implementar `GetUserDeletionImpactUseCase`**

Crear `apps/api/src/identity/application/get-user-deletion-impact.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../domain/role';
import { AuthenticatedUser } from '../domain/authenticated-user';
import { USER_REPOSITORY, UserRepositoryPort } from './ports/user-repository.port';
import { CARTERA_REPOSITORY, CarteraRepositoryPort } from './ports/cartera-repository.port';
import { ROUTINES_CLEANUP, RoutinesCleanupPort } from './ports/routines-cleanup.port';
import { resolveUserInGym } from './resolve-user-in-gym';
import { InsufficientRoleError } from './errors/insufficient-role.error';
import { CannotTargetAdminError } from './errors/cannot-target-admin.error';

export interface GetUserDeletionImpactInput {
  invocadoPor: AuthenticatedUser;
  userId: string;
}

export interface DeletionImpact {
  plantillasABorrar: number;
  instanciasABorrar: number;
  instanciasQueSobreviven: number;
  vinculosDeCarteraABorrar: number;
}

const ROLES_QUE_PUEDEN_VER_IMPACTO: Role[] = [Role.ADMIN];

/** Alimenta el diálogo de impacto de HU-03c antes de confirmar el hard-delete. */
@Injectable()
export class GetUserDeletionImpactUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
    @Inject(ROUTINES_CLEANUP) private readonly routinesCleanup: RoutinesCleanupPort,
  ) {}

  async execute(input: GetUserDeletionImpactInput): Promise<DeletionImpact> {
    if (!ROLES_QUE_PUEDEN_VER_IMPACTO.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_VER_IMPACTO);
    }

    const objetivo = await resolveUserInGym(
      this.userRepository,
      input.userId,
      input.invocadoPor.gymId,
    );
    if (objetivo.role === Role.ADMIN) {
      throw new CannotTargetAdminError(objetivo.id);
    }

    const role = objetivo.role as Role.PROFESOR | Role.ALUMNO;
    const impactoRoutines = await this.routinesCleanup.contarImpacto(objetivo.id, role);
    const vinculos =
      role === Role.PROFESOR
        ? await this.carteraRepository.findAlumnosDeProfesor(objetivo.id)
        : await this.carteraRepository.findProfesoresDeAlumno(objetivo.id);

    return { ...impactoRoutines, vinculosDeCarteraABorrar: vinculos.length };
  }
}
```

- [ ] **Step 7: Ejecutar y verificar que pasa**

Run: `pnpm --filter api test -- get-user-deletion-impact`
Expected: PASS (3 tests)

- [ ] **Step 8: Test de `DeleteUserPermanentlyUseCase`**

Crear `apps/api/src/identity/application/delete-user-permanently.use-case.spec.ts`:

```typescript
import { Role } from '../domain/role';
import { DeleteUserPermanentlyUseCase } from './delete-user-permanently.use-case';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { RoutinesCleanupPort } from './ports/routines-cleanup.port';
import { AuthProviderPort } from './ports/auth-provider.port';
import { InsufficientRoleError } from './errors/insufficient-role.error';
import { CannotTargetAdminError } from './errors/cannot-target-admin.error';
import { UserNotInactiveError } from './errors/user-not-inactive.error';

describe('DeleteUserPermanentlyUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let routinesCleanup: jest.Mocked<RoutinesCleanupPort>;
  let authProvider: jest.Mocked<AuthProviderPort>;
  let prisma: {
    $transaction: jest.Mock;
    profesorAlumno: { deleteMany: jest.Mock };
    user: { delete: jest.Mock };
  };
  let useCase: DeleteUserPermanentlyUseCase;

  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };
  const profesorInvocador = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };

  const alumnoInactivo: UserRecord = {
    id: 'alum-1',
    authUserId: 'auth-a1',
    gymId: 'gym-1',
    username: 'juan.perez',
    nombre: 'Juan',
    role: Role.ALUMNO,
    activo: false,
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
    routinesCleanup = { contarImpacto: jest.fn(), eliminarDatosDe: jest.fn() };
    authProvider = {
      createStaffUser: jest.fn(),
      createAlumnoUser: jest.fn(),
      signInStaff: jest.fn(),
      signInAlumno: jest.fn(),
      refreshSession: jest.fn(),
      deleteAuthUser: jest.fn(),
    };
    prisma = {
      $transaction: jest.fn(async (cb) => cb(prisma)),
      profesorAlumno: { deleteMany: jest.fn() },
      user: { delete: jest.fn() },
    };
    useCase = new DeleteUserPermanentlyUseCase(
      userRepository,
      routinesCleanup,
      authProvider,
      prisma as never,
    );
  });

  it('rechaza si quien invoca no es ADMIN', async () => {
    await expect(
      useCase.execute({ invocadoPor: profesorInvocador, userId: 'alum-1' }),
    ).rejects.toThrow(InsufficientRoleError);
  });

  it('rechaza con CannotTargetAdminError si el objetivo es ADMIN', async () => {
    userRepository.findById.mockResolvedValue({
      ...alumnoInactivo,
      role: Role.ADMIN,
      activo: false,
    });
    await expect(useCase.execute({ invocadoPor: admin, userId: 'alum-1' })).rejects.toThrow(
      CannotTargetAdminError,
    );
  });

  it('rechaza con UserNotInactiveError si el objetivo está activo (gate del hard-delete)', async () => {
    userRepository.findById.mockResolvedValue({ ...alumnoInactivo, activo: true });
    await expect(useCase.execute({ invocadoPor: admin, userId: 'alum-1' })).rejects.toThrow(
      UserNotInactiveError,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('elimina en transacción y borra auth.users — sin advertencia si todo sale bien', async () => {
    userRepository.findById.mockResolvedValue(alumnoInactivo);
    authProvider.deleteAuthUser.mockResolvedValue(undefined);

    const resultado = await useCase.execute({ invocadoPor: admin, userId: 'alum-1' });

    expect(routinesCleanup.eliminarDatosDe).toHaveBeenCalledWith('alum-1', Role.ALUMNO, prisma);
    expect(prisma.profesorAlumno.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ profesorId: 'alum-1' }, { alumnoId: 'alum-1' }] },
    });
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'alum-1' } });
    expect(authProvider.deleteAuthUser).toHaveBeenCalledWith('auth-a1');
    expect(resultado).toEqual({});
  });

  it('devuelve una advertencia si auth.users falla tras el reintento, sin lanzar', async () => {
    userRepository.findById.mockResolvedValue(alumnoInactivo);
    authProvider.deleteAuthUser.mockRejectedValue(new Error('Supabase caído'));

    const resultado = await useCase.execute({ invocadoPor: admin, userId: 'alum-1' });

    expect(authProvider.deleteAuthUser).toHaveBeenCalledTimes(2);
    expect(resultado.advertencia).toContain('auth-a1');
  });
});
```

- [ ] **Step 9: Ejecutar y verificar que falla**

Run: `pnpm --filter api test -- delete-user-permanently`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 10: Implementar `DeleteUserPermanentlyUseCase`**

Crear `apps/api/src/identity/application/delete-user-permanently.use-case.ts`:

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Role } from '../domain/role';
import { AuthenticatedUser } from '../domain/authenticated-user';
import { USER_REPOSITORY, UserRepositoryPort } from './ports/user-repository.port';
import { ROUTINES_CLEANUP, RoutinesCleanupPort } from './ports/routines-cleanup.port';
import { AUTH_PROVIDER, AuthProviderPort } from './ports/auth-provider.port';
import { resolveUserInGym } from './resolve-user-in-gym';
import { InsufficientRoleError } from './errors/insufficient-role.error';
import { CannotTargetAdminError } from './errors/cannot-target-admin.error';
import { UserNotInactiveError } from './errors/user-not-inactive.error';
import { PrismaService } from '../../shared-kernel/prisma.service';

export interface DeleteUserPermanentlyInput {
  invocadoPor: AuthenticatedUser;
  userId: string;
}

export interface DeleteUserPermanentlyOutput {
  advertencia?: string;
}

const ROLES_QUE_PUEDEN_ELIMINAR: Role[] = [Role.ADMIN];

/**
 * Hard-delete real (PRD §6 regla 10, HU-03c). `PrismaService` inyectado
 * directamente acá (no vía un repo) porque este caso de uso ES la raíz de
 * la transacción cross-context — orquesta `RoutinesCleanupPort` (DIP) más
 * `ProfesorAlumno` y `User`, todo en una `$transaction`. Fuga de
 * infraestructura deliberada, mismo criterio que la transacción de alta
 * con cartera del Bloque 3A: no se construye un Unit of Work genérico
 * para un solo caso de uso.
 */
@Injectable()
export class DeleteUserPermanentlyUseCase {
  private readonly logger = new Logger(DeleteUserPermanentlyUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    @Inject(ROUTINES_CLEANUP) private readonly routinesCleanup: RoutinesCleanupPort,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProviderPort,
    private readonly prisma: PrismaService,
  ) {}

  async execute(input: DeleteUserPermanentlyInput): Promise<DeleteUserPermanentlyOutput> {
    if (!ROLES_QUE_PUEDEN_ELIMINAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_ELIMINAR);
    }

    const objetivo = await resolveUserInGym(
      this.userRepository,
      input.userId,
      input.invocadoPor.gymId,
    );
    if (objetivo.role === Role.ADMIN) {
      throw new CannotTargetAdminError(objetivo.id);
    }
    if (objetivo.activo) {
      throw new UserNotInactiveError(objetivo.id);
    }

    const role = objetivo.role as Role.PROFESOR | Role.ALUMNO;
    await this.prisma.$transaction(async (tx) => {
      await this.routinesCleanup.eliminarDatosDe(objetivo.id, role, tx);
      await tx.profesorAlumno.deleteMany({
        where: { OR: [{ profesorId: objetivo.id }, { alumnoId: objetivo.id }] },
      });
      await tx.user.delete({ where: { id: objetivo.id } });
    });

    // Después de la transacción de Prisma, nunca antes: si algo falla acá,
    // el huérfano en auth.users queda inerte (sin fila User, JwtAuthGuard
    // lo rechaza siempre) — nunca un usuario fantasma que pueda loguearse.
    for (let intento = 0; intento < 2; intento += 1) {
      try {
        await this.authProvider.deleteAuthUser(objetivo.authUserId);
        return {};
      } catch {
        // Reintenta una vez más antes de rendirse.
      }
    }

    this.logger.error(
      `Huérfano en auth.users tras hard-delete: authUserId=${objetivo.authUserId} (username=${objetivo.username})`,
    );
    return {
      advertencia: `El usuario se eliminó correctamente pero no se pudo borrar de auth.users (authUserId: ${objetivo.authUserId}). Requiere limpieza manual — ver HLD §6.`,
    };
  }
}
```

- [ ] **Step 11: Ejecutar y verificar que pasa**

Run: `pnpm --filter api test -- delete-user-permanently`
Expected: PASS (5 tests)

- [ ] **Step 12: HTTP — agregar los dos endpoints a `UsersController`**

En `apps/api/src/identity/infrastructure/http/users.controller.ts`, agregar los imports:

```typescript
import { GetUserDeletionImpactUseCase } from '../../application/get-user-deletion-impact.use-case';
import { DeleteUserPermanentlyUseCase } from '../../application/delete-user-permanently.use-case';
```

Agregar los dos casos de uso al constructor (junto a los 3 existentes):

```typescript
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly listUsersUseCase: ListUsersUseCase,
    private readonly deactivateUserUseCase: DeactivateUserUseCase,
    private readonly getUserDeletionImpactUseCase: GetUserDeletionImpactUseCase,
    private readonly deleteUserPermanentlyUseCase: DeleteUserPermanentlyUseCase,
  ) {}
```

Y agregar los dos endpoints nuevos, después de `deactivate`:

```typescript
  @Get(':id/deletion-impact')
  @Roles(Role.ADMIN)
  async deletionImpact(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.getUserDeletionImpactUseCase.execute({ invocadoPor: req.user, userId: id });
  }

  @Delete(':id/permanent')
  @Roles(Role.ADMIN)
  @HttpCode(200)
  async deletePermanently(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.deleteUserPermanentlyUseCase.execute({ invocadoPor: req.user, userId: id });
  }
```

Y agregar `Delete`, `HttpCode` a los imports de `@nestjs/common` en la primera línea del archivo (ya importa `BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req` — sumar `Delete, HttpCode`).

- [ ] **Step 13: Wirear los 2 casos de uso en `IdentityModule`**

En `apps/api/src/identity/identity.module.ts`, agregar los imports:

```typescript
import { GetUserDeletionImpactUseCase } from './application/get-user-deletion-impact.use-case';
import { DeleteUserPermanentlyUseCase } from './application/delete-user-permanently.use-case';
```

Y sumarlos al array `providers` (junto a `DeactivateUserUseCase`):

```typescript
    GetUserDeletionImpactUseCase,
    DeleteUserPermanentlyUseCase,
```

- [ ] **Step 14: Suite completa, build y prisma:validate**

Run: `pnpm --filter api test && pnpm --filter api build && pnpm --filter api prisma:validate`
Expected: los tres exitosos. Este es el primer punto donde TODO el backend de Routines + hard-delete compila junto — si algo de la Tarea 9 quedó mal secuenciado, se revela acá.

- [ ] **Step 15: Commit**

```bash
git add apps/api/src/routines/infrastructure/persistence/prisma-routines-cleanup.adapter.ts \
        apps/api/src/routines/routines.module.ts \
        apps/api/src/identity/application/get-user-deletion-impact.use-case.ts \
        apps/api/src/identity/application/get-user-deletion-impact.use-case.spec.ts \
        apps/api/src/identity/application/delete-user-permanently.use-case.ts \
        apps/api/src/identity/application/delete-user-permanently.use-case.spec.ts \
        apps/api/src/identity/infrastructure/http/users.controller.ts \
        apps/api/src/identity/identity.module.ts
git commit -m "feat(identity): hard-delete de usuarios (HU-03c) — adapter DIP + casos de uso + HTTP"
```

---

## Task 11: Verificación final end-to-end

**Files:** ninguno nuevo — tarea de verificación, sin cambios de código salvo lo que un hallazgo real obligue a corregir.

**Interfaces:**

- Consumes: todo lo producido por las Tareas 1-10.
- Produces: confirmación de que el backend de Routines + hard-delete está listo para el Plan 2 (UI) y para revisión humana.

- [ ] **Step 1: Suite completa del backend**

Run: `pnpm --filter api test && pnpm --filter api build && pnpm --filter api prisma:validate`
Expected: los tres en verde.

- [ ] **Step 2: Grep de invariantes arquitectónicas**

Run: `grep -rn "from '.*routines" apps/api/src/identity/ apps/api/src/exercise-catalog/ | grep -v routines-cleanup.port | grep -v "identity.module.ts"`
Expected: sin resultados — la única referencia de `identity`/`exercise-catalog` a `routines` debe ser el `import { RoutinesModule } from '../routines/routines.module'` en `identity.module.ts` (para el DIP) y el propio `routines-cleanup.port.ts` (que vive en `identity` pero se referencia desde `routines`, no al revés). Cualquier otro resultado es una violación de la dirección de dependencias.

- [ ] **Step 3: Verificación manual contra Supabase real — flujo completo de HU-04/HU-05/HU-08**

Usando un profesor real y activo del gym (ya existente, sin crear ninguno nuevo salvo que haga falta), con `curl` o el cliente REST preferido:

1. `POST /routine-templates` con `{ "nombre": "Full body" }` → confirmar 201.
2. `PUT /routine-templates/:id/exercises` con 2-3 ejercicios reales del catálogo (`GET /exercises` para conseguir ids reales) → confirmar 204.
3. `POST /routine-instances` con `{ "alumnoId": "<id de un alumno en la cartera de este profesor>", "nombre": "Full body", "origenTemplateId": "<id de la plantilla>" }` → confirmar 201 con los ejercicios clonados.
4. Como el ALUMNO (loguearse con sus credenciales): `GET /users/me/rutina-vigente` → confirmar que devuelve la rutina con `nombre`/`imageUrl`/`gifUrl` resueltos por ejercicio, no solo `exerciseId`.
5. Confirmar en la DB real (`SELECT * FROM "RoutineInstance" WHERE "alumnoId" = '...'`) que hay una sola fila con `activa: true`.

- [ ] **Step 4: Verificación manual contra Supabase real — hard-delete**

Sobre un usuario de prueba desechable (nunca sobre un usuario real del gym): desactivarlo (`PATCH /users/:id/deactivate`), confirmar `GET /users/:id/deletion-impact` con números reales, ejecutar `DELETE /users/:id/permanent`, y confirmar en la DB que sus filas de `RoutineTemplate`/`RoutineInstance`/`ProfesorAlumno` desaparecieron según la cascada esperada, y que el usuario ya no existe ni en `User` ni en `auth.users`. Si se crea un usuario de prueba para esto, borrarlo al terminar siguiendo el mismo criterio de higiene de datos de test que en los bloques anteriores.

- [ ] **Step 5: Reportar el estado**

Sin commitear ni pushear nada adicional — la política del proyecto exige autorización explícita del usuario. Informar: conteo final de tests, resultado del grep de invariantes, resultado de las dos verificaciones manuales, y cualquier hallazgo que haya requerido un fix fuera de lo ya descrito en este plan.
