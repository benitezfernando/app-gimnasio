# Cartera ProfesorAlumno (Bloque 3A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modelar la relación muchos-a-muchos `ProfesorAlumno`, exponerla con sus casos de uso y HTTP, integrarla al alta de alumnos, darle una UI de gestión en `/admin`, y saldar la deuda técnica del proxy BFF — todo como prerequisito de autorización para el bounded context `Routines` (Bloque 3B).

**Architecture:** Todo el trabajo de backend vive en el bounded context `identity` (nunca en uno nuevo ni en `routines`), siguiendo exactamente los mismos patrones que ya existen ahí: puerto + Symbol de inyección, casos de uso que validan rol e invariantes de negocio, errores que extienden `DomainError`, un repositorio Prisma por puerto, HTTP mediante DTOs + controller + `@Roles()`. El único método que el Bloque 3B va a consumir de todo esto es `CarteraRepositoryPort.existe(profesorId, alumnoId)`.

**Tech Stack:** NestJS + Prisma + class-validator (backend, ya en el repo). Next.js App Router + Server Actions + Tailwind con el sistema de tokens del Bloque 2 (frontend, ya en el repo). Jest se agrega a `apps/web` en la Tarea 7 — no existía ningún test automatizado ahí todavía.

## Global Constraints

- Bounded context: `apps/api/src/identity/` — nunca crear un módulo `cartera` nuevo, nunca poner nada de esto en `apps/api/src/routines/`.
- `RoutineInstance.profesorId` (ya existe en el schema, no se toca en este plan) es y sigue siendo el creador, inmutable — este plan no lo usa para autorizar nada.
- Quitar de la cartera es `DELETE` físico de la fila `ProfesorAlumno` — nunca soft delete.
- `RemoveProfesorFromAlumnoUseCase` **nunca** valida `activo` de ninguno de los dos usuarios. `AssignProfesorToAlumnoUseCase` sí lo valida, para ambos.
- Desactivar un usuario (`DeactivateUserUseCase`, ya existe) no cambia en este plan — no toca filas de cartera.
- Convención de autorización de todo el sistema (HLD §4): recurso de **otro gym o inexistente → 404**, indistinguibles; recurso del propio gym vedado por una relación conocida (la cartera) → 403; rol insuficiente → 403 (via `RolesGuard`). Se implementa en los casos de uso, nunca en los guards.
- Todo error nuevo extiende `DomainError` de `apps/api/src/shared-kernel/domain-error.ts` — nunca agregar una rama al `DomainExceptionFilter`, que ya captura `DomainError` genéricamente.
- Cualquier `TestingModule` de e2e que ejercite un DTO con `@Type`/`@IsOptional` con default debe registrar `app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))` — sin esto los tests fallan por una razón ajena a lo que están probando (pasó en el Bloque 2, Task 6).
- No crear usuarios de prueba ad-hoc contra el Supabase real del gym. Si hiciera falta alguno para verificación manual, se borra al terminar (fila `User` primero, después `auth.users` — igual que la limpieza ya hecha en el Bloque 2, en ese orden porque acá SÍ se puede borrar `User` sin problema, es la baja de `auth.users` la que debe confirmarse después para no dejar huérfano de Auth sin fila; ver Tarea 8).
- Nomenclatura de identificadores, mensajes de error y comentarios: español informal (tuteo implícito en el código, como el resto del repo). Nombres de variables/métodos en español donde el resto del archivo ya lo hace (ej. `crearAlumno`, `invocadoPor`).

---

## Task 1: Modelo `ProfesorAlumno` y migración

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_profesor_alumno/migration.sql` (generado por Prisma, no se escribe a mano)

**Interfaces:**

- Consumes: nada de tareas anteriores.
- Produces: el modelo `ProfesorAlumno` en el cliente Prisma generado (`prisma.profesorAlumno.*`), consumido por la Tarea 2 (`PrismaCarteraRepository`) y la Tarea 4 (`PrismaUserRepository.create`, dentro de la transacción).

- [ ] **Step 1: Agregar el modelo `ProfesorAlumno` y las relaciones inversas en `User`**

En `apps/api/prisma/schema.prisma`, agregar este modelo nuevo después de `model User { ... }` (antes del comentario `// ExerciseCatalog`):

```prisma
// Cartera profesor↔alumno — relación muchos-a-muchos (PRD §6 regla 9,
// HLD §3 Identity). `gymId` es redundante con el de los dos User (todo
// usuario pertenece a un único gym), pero se guarda para poder scopear
// queries sin join, mismo criterio que el resto del schema.
model ProfesorAlumno {
  id         String   @id @default(uuid())
  gymId      String
  profesorId String
  alumnoId   String
  asignadoEn DateTime @default(now())

  profesor User @relation("CarteraDelProfesor", fields: [profesorId], references: [id])
  alumno   User @relation("ProfesoresDelAlumno", fields: [alumnoId], references: [id])

  @@unique([profesorId, alumnoId])
  @@index([gymId])
  @@index([alumnoId])
}
```

Y dentro de `model User { ... }`, agregar estas dos líneas junto a las relaciones de `RoutineTemplate`/`RoutineInstance` ya existentes:

```prisma
  alumnosAsignados    ProfesorAlumno[] @relation("CarteraDelProfesor")
  profesoresAsignados ProfesorAlumno[] @relation("ProfesoresDelAlumno")
```

Sin `onDelete: Cascade` en ninguna de las dos relaciones — los `User` nunca se borran físicamente (PRD regla 3), una cascada acá sería código muerto.

- [ ] **Step 2: Validar el schema**

Run: `pnpm --filter api prisma:validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 3: Generar y aplicar la migración**

Run: `cd apps/api && npx prisma migrate dev --name add_profesor_alumno`
Expected: crea `prisma/migrations/<timestamp>_add_profesor_alumno/migration.sql` con dos `CREATE TABLE`/`ALTER TABLE` (la tabla `ProfesorAlumno` y sus índices/constraint único), la aplica contra la DB configurada en `DATABASE_URL`/`DIRECT_URL`, y regenera el cliente Prisma. Es aditiva — no debe tocar ninguna fila existente.

- [ ] **Step 4: Confirmar que el resto de la suite sigue verde**

Run: `pnpm --filter api test`
Expected: los 119 tests existentes siguen en PASS (este cambio es puramente aditivo al schema, ningún código de aplicación lo usa todavía).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(identity): agregar modelo ProfesorAlumno (cartera M:N)"
```

---

## Task 2: Puerto de cartera, errores y repositorio Prisma

**Files:**

- Create: `apps/api/src/identity/application/ports/cartera-repository.port.ts`
- Create: `apps/api/src/identity/application/errors/cartera-link-already-exists.error.ts`
- Create: `apps/api/src/identity/application/errors/cartera-link-not-found.error.ts`
- Create: `apps/api/src/identity/application/errors/invalid-cartera-role.error.ts`
- Create: `apps/api/src/identity/application/errors/inactive-user.error.ts`
- Create: `apps/api/src/identity/infrastructure/persistence/prisma-cartera.repository.ts`

**Interfaces:**

- Consumes: `UserRecord` de `apps/api/src/identity/application/ports/user-repository.port.ts` (ya existe, sin cambios); `Role` de `apps/api/src/identity/domain/role.ts`; `DomainError` de `apps/api/src/shared-kernel/domain-error.ts`; `PrismaService` de `apps/api/src/shared-kernel/prisma.service.ts`; el modelo `ProfesorAlumno` de la Tarea 1.
- Produces: `CARTERA_REPOSITORY` (Symbol), `CarteraLink` (interfaz), `CarteraRepositoryPort` con `existe(profesorId: string, alumnoId: string): Promise<boolean>`, `crear(data: { gymId: string; profesorId: string; alumnoId: string }): Promise<CarteraLink>`, `eliminar(profesorId: string, alumnoId: string): Promise<void>`, `findAlumnosDeProfesor(profesorId: string): Promise<UserRecord[]>`, `findProfesoresDeAlumno(alumnoId: string): Promise<UserRecord[]>` — consumidos por la Tarea 3. Los cuatro errores — consumidos por la Tarea 3. `PrismaCarteraRepository` — wireado en `IdentityModule` en la Tarea 3.

- [ ] **Step 1: Escribir el puerto**

Crear `apps/api/src/identity/application/ports/cartera-repository.port.ts`:

```typescript
import { UserRecord } from './user-repository.port';

export const CARTERA_REPOSITORY = Symbol('CARTERA_REPOSITORY');

export interface CarteraLink {
  id: string;
  gymId: string;
  profesorId: string;
  alumnoId: string;
  asignadoEn: Date;
}

/**
 * Cartera profesor↔alumno (PRD §6 regla 9). `existe()` es la única
 * superficie que el bounded context Routines (Bloque 3B) necesita para
 * autorizar: nunca alcanza con compartir gymId, siempre hay que validar
 * contra esta relación.
 */
export interface CarteraRepositoryPort {
  existe(profesorId: string, alumnoId: string): Promise<boolean>;
  crear(data: { gymId: string; profesorId: string; alumnoId: string }): Promise<CarteraLink>;
  eliminar(profesorId: string, alumnoId: string): Promise<void>;
  findAlumnosDeProfesor(profesorId: string): Promise<UserRecord[]>;
  findProfesoresDeAlumno(alumnoId: string): Promise<UserRecord[]>;
}
```

- [ ] **Step 2: Escribir los cuatro errores**

Crear `apps/api/src/identity/application/errors/cartera-link-already-exists.error.ts`:

```typescript
import { DomainError } from '../../../shared-kernel/domain-error';

export class CarteraLinkAlreadyExistsError extends DomainError {
  readonly httpStatus = 409;

  constructor(profesorId: string, alumnoId: string) {
    super(`El profesor '${profesorId}' ya está asignado al alumno '${alumnoId}'.`);
    this.name = 'CarteraLinkAlreadyExistsError';
  }
}
```

Crear `apps/api/src/identity/application/errors/cartera-link-not-found.error.ts`:

```typescript
import { DomainError } from '../../../shared-kernel/domain-error';

export class CarteraLinkNotFoundError extends DomainError {
  readonly httpStatus = 404;

  constructor(profesorId: string, alumnoId: string) {
    super(`El profesor '${profesorId}' no está asignado al alumno '${alumnoId}'.`);
    this.name = 'CarteraLinkNotFoundError';
  }
}
```

Crear `apps/api/src/identity/application/errors/invalid-cartera-role.error.ts`:

```typescript
import { DomainError } from '../../../shared-kernel/domain-error';
import { Role } from '../../domain/role';

export class InvalidCarteraRoleError extends DomainError {
  readonly httpStatus = 400;

  constructor(userId: string, rolEsperado: Role) {
    super(`El usuario '${userId}' no tiene el rol '${rolEsperado}' requerido para la cartera.`);
    this.name = 'InvalidCarteraRoleError';
  }
}
```

Crear `apps/api/src/identity/application/errors/inactive-user.error.ts`:

```typescript
import { DomainError } from '../../../shared-kernel/domain-error';

/**
 * Solo la tira `AssignProfesorToAlumnoUseCase` — nunca
 * `RemoveProfesorFromAlumnoUseCase`. Quitar de la cartera es limpieza
 * administrativa del ADMIN sobre sus propios datos, no "operar en nombre
 * de" el usuario inactivo; bloquearlo dejaría filas de cartera
 * imborrables cada vez que se desactiva a alguien (ver spec Bloque 3A §4.2).
 */
export class InactiveUserError extends DomainError {
  readonly httpStatus = 409;

  constructor(userId: string) {
    super(`El usuario '${userId}' está desactivado.`);
    this.name = 'InactiveUserError';
  }
}
```

- [ ] **Step 3: Escribir el repositorio Prisma**

Crear `apps/api/src/identity/infrastructure/persistence/prisma-cartera.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { Role as PrismaRole } from '@prisma/client';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import { UserRecord } from '../../application/ports/user-repository.port';
import {
  CarteraLink,
  CarteraRepositoryPort,
} from '../../application/ports/cartera-repository.port';
import { Role } from '../../domain/role';

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
export class PrismaCarteraRepository implements CarteraRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async existe(profesorId: string, alumnoId: string): Promise<boolean> {
    const vinculo = await this.prisma.profesorAlumno.findUnique({
      where: { profesorId_alumnoId: { profesorId, alumnoId } },
    });
    return vinculo !== null;
  }

  async crear(data: { gymId: string; profesorId: string; alumnoId: string }): Promise<CarteraLink> {
    const creado = await this.prisma.profesorAlumno.create({ data });
    return {
      id: creado.id,
      gymId: creado.gymId,
      profesorId: creado.profesorId,
      alumnoId: creado.alumnoId,
      asignadoEn: creado.asignadoEn,
    };
  }

  async eliminar(profesorId: string, alumnoId: string): Promise<void> {
    await this.prisma.profesorAlumno.delete({
      where: { profesorId_alumnoId: { profesorId, alumnoId } },
    });
  }

  async findAlumnosDeProfesor(profesorId: string): Promise<UserRecord[]> {
    const vinculos = await this.prisma.profesorAlumno.findMany({
      where: { profesorId },
      include: { alumno: true },
      orderBy: { alumno: { nombre: 'asc' } },
    });
    return vinculos.map((v) => this.toUserRecord(v.alumno));
  }

  async findProfesoresDeAlumno(alumnoId: string): Promise<UserRecord[]> {
    const vinculos = await this.prisma.profesorAlumno.findMany({
      where: { alumnoId },
      include: { profesor: true },
      orderBy: { profesor: { nombre: 'asc' } },
    });
    return vinculos.map((v) => this.toUserRecord(v.profesor));
  }

  private toUserRecord(user: PrismaUserRow): UserRecord {
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

Nota de diseño: `crear()` no atrapa el error de unique-constraint (P2002) — a diferencia de `PrismaUserRepository.create()`. La Tarea 3 hace que `AssignProfesorToAlumnoUseCase` llame a `existe()` antes de `crear()`, así que el camino normal nunca llega a violar el constraint; una carrera real entre dos requests simultáneos del mismo ADMIN es un caso extremo aceptado sin manejo especial, mismo criterio que ya usa `DeactivateUserUseCase` con su propio `findById` previo.

- [ ] **Step 4: Verificar que compila**

Run: `pnpm --filter api build`
Expected: build exitoso, sin errores de TypeScript (nada todavía importa estos archivos, así que solo valida sintaxis/tipos propios).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/identity/application/ports/cartera-repository.port.ts \
        apps/api/src/identity/application/errors/cartera-link-already-exists.error.ts \
        apps/api/src/identity/application/errors/cartera-link-not-found.error.ts \
        apps/api/src/identity/application/errors/invalid-cartera-role.error.ts \
        apps/api/src/identity/application/errors/inactive-user.error.ts \
        apps/api/src/identity/infrastructure/persistence/prisma-cartera.repository.ts
git commit -m "feat(identity): puerto, errores y repositorio Prisma de cartera"
```

---

## Task 3: Casos de uso de cartera

**Files:**

- Create: `apps/api/src/identity/application/cartera/assign-profesor-to-alumno.use-case.ts`
- Create: `apps/api/src/identity/application/cartera/assign-profesor-to-alumno.use-case.spec.ts`
- Create: `apps/api/src/identity/application/cartera/remove-profesor-from-alumno.use-case.ts`
- Create: `apps/api/src/identity/application/cartera/remove-profesor-from-alumno.use-case.spec.ts`
- Create: `apps/api/src/identity/application/cartera/list-cartera.use-case.ts`
- Create: `apps/api/src/identity/application/cartera/list-cartera.use-case.spec.ts`
- Create: `apps/api/src/identity/application/cartera/list-profesores-de-alumno.use-case.ts`
- Create: `apps/api/src/identity/application/cartera/list-profesores-de-alumno.use-case.spec.ts`

**Interfaces:**

- Consumes: `CARTERA_REPOSITORY`/`CarteraRepositoryPort`/`CarteraLink` (Tarea 2); `USER_REPOSITORY`/`UserRepositoryPort`/`UserRecord` (ya existe); `AuthenticatedUser`, `Role` (ya existen); `InsufficientRoleError`, `UserNotFoundError` (ya existen); los cuatro errores de la Tarea 2.
- Produces: `AssignProfesorToAlumnoUseCase.execute(input: { invocadoPor: AuthenticatedUser; alumnoId: string; profesorId: string }): Promise<CarteraLink>`, `RemoveProfesorFromAlumnoUseCase.execute(input: { invocadoPor: AuthenticatedUser; alumnoId: string; profesorId: string }): Promise<void>`, `ListCarteraUseCase.execute(input: { invocadoPor: AuthenticatedUser }): Promise<UserRecord[]>`, `ListProfesoresDeAlumnoUseCase.execute(input: { invocadoPor: AuthenticatedUser; alumnoId: string }): Promise<UserRecord[]>` — consumidos por la Tarea 5 (controller).

- [ ] **Step 1: Escribir el test de `AssignProfesorToAlumnoUseCase`**

Crear `apps/api/src/identity/application/cartera/assign-profesor-to-alumno.use-case.spec.ts`:

```typescript
import { Role } from '../../domain/role';
import { AssignProfesorToAlumnoUseCase } from './assign-profesor-to-alumno.use-case';
import { CarteraRepositoryPort } from '../ports/cartera-repository.port';
import { UserRepositoryPort, UserRecord } from '../ports/user-repository.port';
import { InsufficientRoleError } from '../errors/insufficient-role.error';
import { UserNotFoundError } from '../errors/user-not-found.error';
import { InvalidCarteraRoleError } from '../errors/invalid-cartera-role.error';
import { InactiveUserError } from '../errors/inactive-user.error';
import { CarteraLinkAlreadyExistsError } from '../errors/cartera-link-already-exists.error';

describe('AssignProfesorToAlumnoUseCase', () => {
  let carteraRepository: jest.Mocked<CarteraRepositoryPort>;
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let useCase: AssignProfesorToAlumnoUseCase;

  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };
  const profesorInvocador = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };

  const profesor: UserRecord = {
    id: 'prof-2',
    authUserId: 'a-prof',
    gymId: 'gym-1',
    username: 'prof2',
    nombre: 'Profe Dos',
    role: Role.PROFESOR,
    activo: true,
  };

  const alumno: UserRecord = {
    id: 'alum-1',
    authUserId: 'a-alum',
    gymId: 'gym-1',
    username: 'juan.perez',
    nombre: 'Juan Perez',
    role: Role.ALUMNO,
    activo: true,
  };

  beforeEach(() => {
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
    useCase = new AssignProfesorToAlumnoUseCase(carteraRepository, userRepository);
  });

  it('rechaza si quien invoca no es ADMIN', async () => {
    await expect(
      useCase.execute({ invocadoPor: profesorInvocador, alumnoId: 'alum-1', profesorId: 'prof-2' }),
    ).rejects.toThrow(InsufficientRoleError);
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it('rechaza con UserNotFoundError si el profesor no existe', async () => {
    userRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ invocadoPor: admin, alumnoId: 'alum-1', profesorId: 'no-existe' }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('rechaza con UserNotFoundError (no 403) si el profesor es de otro gym', async () => {
    userRepository.findById.mockResolvedValue({ ...profesor, gymId: 'gym-OTRO' });

    await expect(
      useCase.execute({ invocadoPor: admin, alumnoId: 'alum-1', profesorId: 'prof-2' }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('rechaza con InvalidCarteraRoleError si el profesorId no tiene rol PROFESOR', async () => {
    userRepository.findById.mockResolvedValue({ ...profesor, role: Role.ALUMNO });

    await expect(
      useCase.execute({ invocadoPor: admin, alumnoId: 'alum-1', profesorId: 'prof-2' }),
    ).rejects.toThrow(InvalidCarteraRoleError);
  });

  it('rechaza con InactiveUserError si el profesor está desactivado', async () => {
    userRepository.findById.mockResolvedValue({ ...profesor, activo: false });

    await expect(
      useCase.execute({ invocadoPor: admin, alumnoId: 'alum-1', profesorId: 'prof-2' }),
    ).rejects.toThrow(InactiveUserError);
  });

  it('rechaza con UserNotFoundError si el alumno no existe', async () => {
    userRepository.findById.mockImplementation(async (id) => (id === 'prof-2' ? profesor : null));

    await expect(
      useCase.execute({ invocadoPor: admin, alumnoId: 'no-existe', profesorId: 'prof-2' }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('rechaza con InvalidCarteraRoleError si el alumnoId no tiene rol ALUMNO', async () => {
    userRepository.findById.mockImplementation(async (id) =>
      id === 'prof-2' ? profesor : { ...alumno, role: Role.PROFESOR },
    );

    await expect(
      useCase.execute({ invocadoPor: admin, alumnoId: 'alum-1', profesorId: 'prof-2' }),
    ).rejects.toThrow(InvalidCarteraRoleError);
  });

  it('rechaza con InactiveUserError si el alumno está desactivado', async () => {
    userRepository.findById.mockImplementation(async (id) =>
      id === 'prof-2' ? profesor : { ...alumno, activo: false },
    );

    await expect(
      useCase.execute({ invocadoPor: admin, alumnoId: 'alum-1', profesorId: 'prof-2' }),
    ).rejects.toThrow(InactiveUserError);
  });

  it('rechaza con CarteraLinkAlreadyExistsError si el vínculo ya existe', async () => {
    userRepository.findById.mockImplementation(async (id) => (id === 'prof-2' ? profesor : alumno));
    carteraRepository.existe.mockResolvedValue(true);

    await expect(
      useCase.execute({ invocadoPor: admin, alumnoId: 'alum-1', profesorId: 'prof-2' }),
    ).rejects.toThrow(CarteraLinkAlreadyExistsError);
    expect(carteraRepository.crear).not.toHaveBeenCalled();
  });

  it('crea el vínculo cuando todas las validaciones pasan', async () => {
    userRepository.findById.mockImplementation(async (id) => (id === 'prof-2' ? profesor : alumno));
    carteraRepository.existe.mockResolvedValue(false);
    const vinculoCreado = {
      id: 'link-1',
      gymId: 'gym-1',
      profesorId: 'prof-2',
      alumnoId: 'alum-1',
      asignadoEn: new Date(),
    };
    carteraRepository.crear.mockResolvedValue(vinculoCreado);

    const resultado = await useCase.execute({
      invocadoPor: admin,
      alumnoId: 'alum-1',
      profesorId: 'prof-2',
    });

    expect(carteraRepository.crear).toHaveBeenCalledWith({
      gymId: 'gym-1',
      profesorId: 'prof-2',
      alumnoId: 'alum-1',
    });
    expect(resultado).toEqual(vinculoCreado);
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm --filter api test -- assign-profesor-to-alumno`
Expected: FAIL — `Cannot find module './assign-profesor-to-alumno.use-case'`

- [ ] **Step 3: Implementar `AssignProfesorToAlumnoUseCase`**

Crear `apps/api/src/identity/application/cartera/assign-profesor-to-alumno.use-case.ts`:

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
import { InsufficientRoleError } from '../errors/insufficient-role.error';
import { UserNotFoundError } from '../errors/user-not-found.error';
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

    const profesor = await this.userRepository.findById(input.profesorId);
    if (!profesor || profesor.gymId !== input.invocadoPor.gymId) {
      throw new UserNotFoundError(input.profesorId);
    }
    if (profesor.role !== Role.PROFESOR) {
      throw new InvalidCarteraRoleError(input.profesorId, Role.PROFESOR);
    }
    if (!profesor.activo) {
      throw new InactiveUserError(input.profesorId);
    }

    const alumno = await this.userRepository.findById(input.alumnoId);
    if (!alumno || alumno.gymId !== input.invocadoPor.gymId) {
      throw new UserNotFoundError(input.alumnoId);
    }
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

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pnpm --filter api test -- assign-profesor-to-alumno`
Expected: PASS (10 tests)

- [ ] **Step 5: Escribir el test de `RemoveProfesorFromAlumnoUseCase`**

Crear `apps/api/src/identity/application/cartera/remove-profesor-from-alumno.use-case.spec.ts`:

```typescript
import { Role } from '../../domain/role';
import { RemoveProfesorFromAlumnoUseCase } from './remove-profesor-from-alumno.use-case';
import { CarteraRepositoryPort } from '../ports/cartera-repository.port';
import { UserRepositoryPort, UserRecord } from '../ports/user-repository.port';
import { InsufficientRoleError } from '../errors/insufficient-role.error';
import { UserNotFoundError } from '../errors/user-not-found.error';
import { CarteraLinkNotFoundError } from '../errors/cartera-link-not-found.error';

describe('RemoveProfesorFromAlumnoUseCase', () => {
  let carteraRepository: jest.Mocked<CarteraRepositoryPort>;
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let useCase: RemoveProfesorFromAlumnoUseCase;

  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };
  const profesorInvocador = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };

  const profesorDesactivado: UserRecord = {
    id: 'prof-2',
    authUserId: 'a-prof',
    gymId: 'gym-1',
    username: 'prof2',
    nombre: 'Profe Dos',
    role: Role.PROFESOR,
    activo: false,
  };

  const alumno: UserRecord = {
    id: 'alum-1',
    authUserId: 'a-alum',
    gymId: 'gym-1',
    username: 'juan.perez',
    nombre: 'Juan Perez',
    role: Role.ALUMNO,
    activo: true,
  };

  beforeEach(() => {
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
    useCase = new RemoveProfesorFromAlumnoUseCase(carteraRepository, userRepository);
  });

  it('rechaza si quien invoca no es ADMIN', async () => {
    await expect(
      useCase.execute({ invocadoPor: profesorInvocador, alumnoId: 'alum-1', profesorId: 'prof-2' }),
    ).rejects.toThrow(InsufficientRoleError);
  });

  it('rechaza con UserNotFoundError si el alumno no existe o es de otro gym', async () => {
    userRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ invocadoPor: admin, alumnoId: 'no-existe', profesorId: 'prof-2' }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('rechaza con CarteraLinkNotFoundError si el vínculo no existe', async () => {
    userRepository.findById.mockImplementation(async (id) =>
      id === 'prof-2' ? profesorDesactivado : alumno,
    );
    carteraRepository.existe.mockResolvedValue(false);

    await expect(
      useCase.execute({ invocadoPor: admin, alumnoId: 'alum-1', profesorId: 'prof-2' }),
    ).rejects.toThrow(CarteraLinkNotFoundError);
    expect(carteraRepository.eliminar).not.toHaveBeenCalled();
  });

  it('quita el vínculo aunque el profesor esté desactivado (no valida activo, a diferencia de Assign)', async () => {
    userRepository.findById.mockImplementation(async (id) =>
      id === 'prof-2' ? profesorDesactivado : alumno,
    );
    carteraRepository.existe.mockResolvedValue(true);

    await useCase.execute({ invocadoPor: admin, alumnoId: 'alum-1', profesorId: 'prof-2' });

    expect(carteraRepository.eliminar).toHaveBeenCalledWith('prof-2', 'alum-1');
  });
});
```

- [ ] **Step 6: Ejecutar el test y verificar que falla**

Run: `pnpm --filter api test -- remove-profesor-from-alumno`
Expected: FAIL — `Cannot find module './remove-profesor-from-alumno.use-case'`

- [ ] **Step 7: Implementar `RemoveProfesorFromAlumnoUseCase`**

Crear `apps/api/src/identity/application/cartera/remove-profesor-from-alumno.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../domain/role';
import { AuthenticatedUser } from '../../domain/authenticated-user';
import { CARTERA_REPOSITORY, CarteraRepositoryPort } from '../ports/cartera-repository.port';
import { USER_REPOSITORY, UserRepositoryPort } from '../ports/user-repository.port';
import { InsufficientRoleError } from '../errors/insufficient-role.error';
import { UserNotFoundError } from '../errors/user-not-found.error';
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

    const alumno = await this.userRepository.findById(input.alumnoId);
    if (!alumno || alumno.gymId !== input.invocadoPor.gymId) {
      throw new UserNotFoundError(input.alumnoId);
    }

    const profesor = await this.userRepository.findById(input.profesorId);
    if (!profesor || profesor.gymId !== input.invocadoPor.gymId) {
      throw new UserNotFoundError(input.profesorId);
    }

    const existe = await this.carteraRepository.existe(input.profesorId, input.alumnoId);
    if (!existe) {
      throw new CarteraLinkNotFoundError(input.profesorId, input.alumnoId);
    }

    await this.carteraRepository.eliminar(input.profesorId, input.alumnoId);
  }
}
```

- [ ] **Step 8: Ejecutar el test y verificar que pasa**

Run: `pnpm --filter api test -- remove-profesor-from-alumno`
Expected: PASS (4 tests)

- [ ] **Step 9: Escribir el test de `ListCarteraUseCase`**

Crear `apps/api/src/identity/application/cartera/list-cartera.use-case.spec.ts`:

```typescript
import { Role } from '../../domain/role';
import { ListCarteraUseCase } from './list-cartera.use-case';
import { CarteraRepositoryPort } from '../ports/cartera-repository.port';
import { UserRecord } from '../ports/user-repository.port';
import { InsufficientRoleError } from '../errors/insufficient-role.error';

describe('ListCarteraUseCase', () => {
  let carteraRepository: jest.Mocked<CarteraRepositoryPort>;
  let useCase: ListCarteraUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };

  const alumnos: UserRecord[] = [
    {
      id: 'alum-1',
      authUserId: 'a1',
      gymId: 'gym-1',
      username: 'juan.perez',
      nombre: 'Juan Perez',
      role: Role.ALUMNO,
      activo: true,
    },
  ];

  beforeEach(() => {
    carteraRepository = {
      existe: jest.fn(),
      crear: jest.fn(),
      eliminar: jest.fn(),
      findAlumnosDeProfesor: jest.fn(),
      findProfesoresDeAlumno: jest.fn(),
    };
    useCase = new ListCarteraUseCase(carteraRepository);
  });

  it('rechaza si quien invoca no es PROFESOR', async () => {
    await expect(useCase.execute({ invocadoPor: admin })).rejects.toThrow(InsufficientRoleError);
  });

  it('devuelve los alumnos del profesor autenticado, nunca de un profesorId externo', async () => {
    carteraRepository.findAlumnosDeProfesor.mockResolvedValue(alumnos);

    const resultado = await useCase.execute({ invocadoPor: profesor });

    expect(carteraRepository.findAlumnosDeProfesor).toHaveBeenCalledWith('prof-1');
    expect(resultado).toEqual(alumnos);
  });
});
```

- [ ] **Step 10: Ejecutar el test y verificar que falla**

Run: `pnpm --filter api test -- list-cartera`
Expected: FAIL — `Cannot find module './list-cartera.use-case'`

- [ ] **Step 11: Implementar `ListCarteraUseCase`**

Crear `apps/api/src/identity/application/cartera/list-cartera.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../domain/role';
import { AuthenticatedUser } from '../../domain/authenticated-user';
import { CARTERA_REPOSITORY, CarteraRepositoryPort } from '../ports/cartera-repository.port';
import { UserRecord } from '../ports/user-repository.port';
import { InsufficientRoleError } from '../errors/insufficient-role.error';

export interface ListCarteraInput {
  invocadoPor: AuthenticatedUser;
}

const ROLES_QUE_PUEDEN_VER_SU_CARTERA: Role[] = [Role.PROFESOR];

/**
 * Un PROFESOR ve siempre SU PROPIA cartera — `invocadoPor.id`, nunca un
 * `profesorId` que venga del cliente. No filtra por `activo`: la UI
 * decide qué hacer con alumnos desactivados en su lista.
 */
@Injectable()
export class ListCarteraUseCase {
  constructor(
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
  ) {}

  async execute(input: ListCarteraInput): Promise<UserRecord[]> {
    if (!ROLES_QUE_PUEDEN_VER_SU_CARTERA.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_VER_SU_CARTERA);
    }
    return this.carteraRepository.findAlumnosDeProfesor(input.invocadoPor.id);
  }
}
```

- [ ] **Step 12: Ejecutar el test y verificar que pasa**

Run: `pnpm --filter api test -- list-cartera`
Expected: PASS (2 tests)

- [ ] **Step 13: Escribir el test de `ListProfesoresDeAlumnoUseCase`**

Crear `apps/api/src/identity/application/cartera/list-profesores-de-alumno.use-case.spec.ts`:

```typescript
import { Role } from '../../domain/role';
import { ListProfesoresDeAlumnoUseCase } from './list-profesores-de-alumno.use-case';
import { CarteraRepositoryPort } from '../ports/cartera-repository.port';
import { UserRepositoryPort, UserRecord } from '../ports/user-repository.port';
import { InsufficientRoleError } from '../errors/insufficient-role.error';
import { UserNotFoundError } from '../errors/user-not-found.error';

describe('ListProfesoresDeAlumnoUseCase', () => {
  let carteraRepository: jest.Mocked<CarteraRepositoryPort>;
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let useCase: ListProfesoresDeAlumnoUseCase;

  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };
  const profesorInvocador = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };

  const alumno: UserRecord = {
    id: 'alum-1',
    authUserId: 'a-alum',
    gymId: 'gym-1',
    username: 'juan.perez',
    nombre: 'Juan Perez',
    role: Role.ALUMNO,
    activo: true,
  };

  const profesores: UserRecord[] = [
    {
      id: 'prof-2',
      authUserId: 'a-prof',
      gymId: 'gym-1',
      username: 'prof2',
      nombre: 'Profe Dos',
      role: Role.PROFESOR,
      activo: true,
    },
  ];

  beforeEach(() => {
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
    useCase = new ListProfesoresDeAlumnoUseCase(carteraRepository, userRepository);
  });

  it('rechaza si quien invoca no es ADMIN', async () => {
    await expect(
      useCase.execute({ invocadoPor: profesorInvocador, alumnoId: 'alum-1' }),
    ).rejects.toThrow(InsufficientRoleError);
  });

  it('rechaza con UserNotFoundError si el alumno no existe o es de otro gym', async () => {
    userRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute({ invocadoPor: admin, alumnoId: 'no-existe' })).rejects.toThrow(
      UserNotFoundError,
    );
  });

  it('devuelve los profesores asignados al alumno', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.findProfesoresDeAlumno.mockResolvedValue(profesores);

    const resultado = await useCase.execute({ invocadoPor: admin, alumnoId: 'alum-1' });

    expect(carteraRepository.findProfesoresDeAlumno).toHaveBeenCalledWith('alum-1');
    expect(resultado).toEqual(profesores);
  });
});
```

- [ ] **Step 14: Ejecutar el test y verificar que falla**

Run: `pnpm --filter api test -- list-profesores-de-alumno`
Expected: FAIL — `Cannot find module './list-profesores-de-alumno.use-case'`

- [ ] **Step 15: Implementar `ListProfesoresDeAlumnoUseCase`**

Crear `apps/api/src/identity/application/cartera/list-profesores-de-alumno.use-case.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../domain/role';
import { AuthenticatedUser } from '../../domain/authenticated-user';
import { CARTERA_REPOSITORY, CarteraRepositoryPort } from '../ports/cartera-repository.port';
import { USER_REPOSITORY, UserRepositoryPort, UserRecord } from '../ports/user-repository.port';
import { InsufficientRoleError } from '../errors/insufficient-role.error';
import { UserNotFoundError } from '../errors/user-not-found.error';

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

    const alumno = await this.userRepository.findById(input.alumnoId);
    if (!alumno || alumno.gymId !== input.invocadoPor.gymId) {
      throw new UserNotFoundError(input.alumnoId);
    }

    return this.carteraRepository.findProfesoresDeAlumno(input.alumnoId);
  }
}
```

- [ ] **Step 16: Ejecutar toda la suite de identity y verificar que todo pasa**

Run: `pnpm --filter api test -- identity`
Expected: PASS, todos los suites de `identity` en verde, incluyendo los 4 nuevos (10 + 4 + 2 + 3 = 19 tests nuevos).

- [ ] **Step 17: Commit**

```bash
git add apps/api/src/identity/application/cartera
git commit -m "feat(identity): casos de uso de cartera (assign/remove/list)"
```

---

## Task 4: Cartera automática al crear alumno desde un PROFESOR

**Files:**

- Modify: `apps/api/src/identity/application/ports/user-repository.port.ts`
- Modify: `apps/api/src/identity/application/create-user.use-case.ts`
- Modify: `apps/api/src/identity/application/create-user.use-case.spec.ts`
- Modify: `apps/api/src/identity/infrastructure/persistence/prisma-user.repository.ts`

**Interfaces:**

- Consumes: el modelo `ProfesorAlumno` de la Tarea 1 (dentro de la transacción de Prisma — no pasa por `CarteraRepositoryPort`, ver razón en el Step 3).
- Produces: `UserRepositoryPort.create(data, vinculoCartera?: { profesorId: string }): Promise<UserRecord>` — firma que ya no cambia para el resto del plan.

- [ ] **Step 1: Extender el puerto con el segundo parámetro opcional**

En `apps/api/src/identity/application/ports/user-repository.port.ts`, reemplazar la firma de `create`:

```typescript
  create(
    data: {
      gymId: string;
      authUserId: string;
      username: string;
      nombre: string;
      role: Role;
    },
    /**
     * Si viene seteado, crea también la fila de cartera `ProfesorAlumno`
     * en la misma transacción — el alta de un alumno por un PROFESOR
     * (HU-02) queda automáticamente en su cartera. Solo tiene sentido
     * cuando `data.role === Role.ALUMNO`; `CreateUserUseCase` es quien
     * decide cuándo pasarlo.
     */
    vinculoCartera?: { profesorId: string },
  ): Promise<UserRecord>;
```

- [ ] **Step 2: Escribir los dos tests nuevos en `create-user.use-case.spec.ts`**

Agregar este `describe` al final de `apps/api/src/identity/application/create-user.use-case.spec.ts`, antes del cierre del `describe('CreateUserUseCase', ...)`:

```typescript
describe('cartera automática al crear alumno (HU-02, regla 9)', () => {
  it('si el alta la hace un PROFESOR, pasa el vínculo de cartera a userRepository.create', async () => {
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

    await useCase.execute({
      role: Role.ALUMNO,
      nombre: 'Juan',
      apellido: 'Perez',
      invocadoPor: profesor,
    });

    expect(userRepository.create).toHaveBeenCalledWith(
      {
        gymId: 'gym-1',
        authUserId: 'auth-x',
        username: 'juan.perez',
        nombre: 'Juan Perez',
        role: Role.ALUMNO,
      },
      { profesorId: 'prof-1' },
    );
  });

  it('si el alta la hace un ADMIN, NO pasa ningún vínculo de cartera', async () => {
    userRepository.findByGymIdAndUsername.mockResolvedValue(null);
    authProvider.createAlumnoUser.mockResolvedValue({ authUserId: 'auth-y' });
    userRepository.create.mockResolvedValue({
      id: 'u2',
      authUserId: 'auth-y',
      gymId: 'gym-1',
      username: 'ana.gomez',
      nombre: 'Ana Gomez',
      role: Role.ALUMNO,
      activo: true,
    });

    await useCase.execute({
      role: Role.ALUMNO,
      nombre: 'Ana',
      apellido: 'Gomez',
      invocadoPor: admin,
    });

    expect(userRepository.create).toHaveBeenCalledWith({
      gymId: 'gym-1',
      authUserId: 'auth-y',
      username: 'ana.gomez',
      nombre: 'Ana Gomez',
      role: Role.ALUMNO,
    });
  });
});
```

- [ ] **Step 3: Ejecutar los tests y verificar que el primero falla**

Run: `pnpm --filter api test -- create-user.use-case`
Expected: FAIL en "si el alta la hace un PROFESOR..." (el use case todavía llama a `create` con un solo argumento siempre). El segundo test ("si el alta la hace un ADMIN...") ya pasa porque el comportamiento actual coincide con el esperado.

- [ ] **Step 4: Modificar `CreateUserUseCase.crearAlumno`**

En `apps/api/src/identity/application/create-user.use-case.ts`, reemplazar el método `crearAlumno`:

```typescript
  private async crearAlumno(gymId: string, input: CreateAlumnoInput): Promise<UserRecord> {
    const username = await this.generarUsernameDisponible(gymId, input.nombre, input.apellido);

    const { authUserId } = await this.authProvider.createAlumnoUser(gymId, username);

    // Cartera automática (HU-02, PRD regla 9): si quien da de alta al
    // alumno es un PROFESOR, ese alumno queda en su cartera desde el
    // primer momento. Si es ADMIN, no se crea ningún vínculo — la
    // asignación queda para HU-03b.
    const vinculoCartera =
      input.invocadoPor.role === Role.PROFESOR
        ? { profesorId: input.invocadoPor.id }
        : undefined;

    const datosUsuario = {
      gymId,
      authUserId,
      username,
      nombre: `${input.nombre} ${input.apellido}`,
      role: Role.ALUMNO,
    };

    try {
      return vinculoCartera
        ? await this.userRepository.create(datosUsuario, vinculoCartera)
        : await this.userRepository.create(datosUsuario);
    } catch (error) {
      // Best-effort: si falla, queda un usuario Supabase huérfano que hay
      // que limpiar manualmente — no existe (todavía) un mecanismo de
      // reconciliación asincrónica, está fuera de alcance de este fix.
      try {
        await this.authProvider.deleteAuthUser(authUserId);
      } catch {
        // Swallow: la compensación es best-effort, el error original manda.
      }
      throw error;
    }
  }
```

Nota: el `if/else` explícito al llamar a `create` (en vez de `create(datosUsuario, vinculoCartera)` siempre) es deliberado — pasar `undefined` como segundo argumento explícito cambia la aridad de la llamada y rompe las aserciones `toHaveBeenCalledWith(unSoloObjeto)` de los tests existentes de alta por ADMIN, que esperan exactamente un argumento.

- [ ] **Step 5: Ejecutar los tests y verificar que todos pasan**

Run: `pnpm --filter api test -- create-user.use-case`
Expected: PASS, incluyendo los 2 tests nuevos y todos los preexistentes sin modificar.

- [ ] **Step 6: Implementar la transacción en `PrismaUserRepository.create`**

En `apps/api/src/identity/infrastructure/persistence/prisma-user.repository.ts`, reemplazar el método `create`:

```typescript
  async create(
    data: {
      gymId: string;
      authUserId: string;
      username: string;
      nombre: string;
      role: Role;
    },
    vinculoCartera?: { profesorId: string },
  ): Promise<UserRecord> {
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const creado = await tx.user.create({
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

        if (vinculoCartera) {
          await tx.profesorAlumno.create({
            data: {
              gymId: data.gymId,
              profesorId: vinculoCartera.profesorId,
              alumnoId: creado.id,
            },
          });
        }

        return creado;
      });
      return this.toRecord(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DuplicateUsernameError(data.username, data.gymId);
      }
      throw error;
    }
  }
```

Razón de que la transacción viva acá y no invoque `CarteraRepositoryPort`: "dar de alta un alumno en la cartera del profesor" es una operación de negocio, y una transacción de Prisma no puede cruzar dos instancias de repositorio — necesita el mismo `tx` para ambos `create`. Ver spec Bloque 3A §4.4.

- [ ] **Step 7: Ejecutar toda la suite de identity**

Run: `pnpm --filter api test -- identity`
Expected: PASS, todos los suites en verde (los tests de `create-user.use-case.spec.ts` usan el repositorio mockeado, no ejercitan la transacción real de Prisma — eso se verifica en la Tarea 8 contra la DB real).

- [ ] **Step 8: Verificar el build completo**

Run: `pnpm --filter api build`
Expected: build exitoso — confirma que ningún otro consumidor de `UserRepositoryPort.create` (login, refresh, etc. no lo llaman) quedó roto por el cambio de firma.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/identity/application/ports/user-repository.port.ts \
        apps/api/src/identity/application/create-user.use-case.ts \
        apps/api/src/identity/application/create-user.use-case.spec.ts \
        apps/api/src/identity/infrastructure/persistence/prisma-user.repository.ts
git commit -m "feat(identity): cartera automática al crear alumno desde un PROFESOR"
```

---

## Task 5: HTTP — DTO, controller y wiring del módulo

**Files:**

- Create: `apps/api/src/identity/infrastructure/http/dto/assign-profesor.dto.ts`
- Create: `apps/api/src/identity/infrastructure/http/cartera.controller.ts`
- Create: `apps/api/src/identity/infrastructure/http/cartera.controller.e2e.spec.ts`
- Modify: `apps/api/src/identity/identity.module.ts`

**Interfaces:**

- Consumes: los 4 casos de uso de la Tarea 3; `toUserResponse` de `apps/api/src/identity/infrastructure/http/user-response.mapper.ts` (ya existe); `Roles` decorator y `Role` (ya existen); `AuthenticatedUser` (ya existe).
- Produces: `POST /users/:alumnoId/profesores` (201), `DELETE /users/:alumnoId/profesores/:profesorId` (204), `GET /users/:alumnoId/profesores` (200, `UserResponse[]`), `GET /users/me/alumnos` (200, `UserResponse[]`) — consumidos por la Tarea 6 (frontend) y por el Bloque 3B para lo que necesite leer cartera vía HTTP (si le hiciera falta; el chequeo de autorización en sí usa el puerto directamente, no HTTP).

- [ ] **Step 1: Escribir el DTO**

Crear `apps/api/src/identity/infrastructure/http/dto/assign-profesor.dto.ts`:

```typescript
import { IsNotEmpty, IsString } from 'class-validator';

export class AssignProfesorDto {
  @IsString()
  @IsNotEmpty()
  profesorId!: string;
}
```

- [ ] **Step 2: Escribir el e2e del controller**

Crear `apps/api/src/identity/infrastructure/http/cartera.controller.e2e.spec.ts`:

```typescript
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { CarteraController } from './cartera.controller';
import { AssignProfesorToAlumnoUseCase } from '../../application/cartera/assign-profesor-to-alumno.use-case';
import { RemoveProfesorFromAlumnoUseCase } from '../../application/cartera/remove-profesor-from-alumno.use-case';
import { ListCarteraUseCase } from '../../application/cartera/list-cartera.use-case';
import { ListProfesoresDeAlumnoUseCase } from '../../application/cartera/list-profesores-de-alumno.use-case';
import {
  CARTERA_REPOSITORY,
  CarteraRepositoryPort,
} from '../../application/ports/cartera-repository.port';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
  UserRecord,
} from '../../application/ports/user-repository.port';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { GymScopeGuard } from '../guards/gym-scope.guard';
import { Role } from '../../domain/role';
import { DomainExceptionFilter } from '../../../shared-kernel/domain-exception.filter';
import { buildTestJwtKeys, signTestToken, TestJwtKeys } from '../guards/testing/jwt-test-support';

const TEST_SUPABASE_URL = 'https://e2e-cartera-test.supabase.co';

jest.mock('jose', () => {
  const actual = jest.requireActual('jose');
  return { ...actual, createRemoteJWKSet: jest.fn() };
});

const { createRemoteJWKSet: mockCreateRemoteJWKSet } = jest.requireMock('jose') as {
  createRemoteJWKSet: jest.Mock;
};

describe('/users/:alumnoId/profesores (e2e)', () => {
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

  const profesorInvocador: UserRecord = {
    id: 'prof-1',
    authUserId: 'auth-prof',
    gymId: 'gym-A',
    username: 'prof1',
    nombre: 'Profe',
    role: Role.PROFESOR,
    activo: true,
  };

  const profesorAsignado: UserRecord = {
    id: 'prof-2',
    authUserId: 'auth-prof2',
    gymId: 'gym-A',
    username: 'prof2',
    nombre: 'Profe Dos',
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
    'auth-prof': profesorInvocador,
  };

  const fakeUserRepository: Pick<UserRepositoryPort, 'findByAuthUserId' | 'findById'> = {
    findByAuthUserId: async (authUserId: string) => usuariosPorAuthId[authUserId] ?? null,
    findById: async (id: string) => {
      if (id === profesorAsignado.id) return profesorAsignado;
      if (id === alumno.id) return alumno;
      return null;
    },
  };

  const fakeCarteraRepository: CarteraRepositoryPort = {
    existe: jest.fn(async () => false),
    crear: jest.fn(async (data) => ({ id: 'link-1', ...data, asignadoEn: new Date() })),
    eliminar: jest.fn(async () => undefined),
    findAlumnosDeProfesor: jest.fn(async () => [alumno]),
    findProfesoresDeAlumno: jest.fn(async () => [profesorAsignado]),
  };

  function firmarTokenPara(sub: string): Promise<string> {
    return signTestToken(claves.privateKey, {
      issuer: `${TEST_SUPABASE_URL}/auth/v1`,
      sub,
    });
  }

  beforeAll(async () => {
    process.env.SUPABASE_URL = TEST_SUPABASE_URL;
    claves = await buildTestJwtKeys();
    mockCreateRemoteJWKSet.mockReturnValue(claves.jwks);

    const moduleRef = await Test.createTestingModule({
      controllers: [CarteraController],
      providers: [
        AssignProfesorToAlumnoUseCase,
        RemoveProfesorFromAlumnoUseCase,
        ListCarteraUseCase,
        ListProfesoresDeAlumnoUseCase,
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

  it('rechaza sin token (401)', async () => {
    await request(app.getHttpServer()).post('/users/alum-1/profesores').expect(401);
  });

  it('un PROFESOR no puede asignar cartera (403) — es exclusivo de ADMIN', async () => {
    const token = await firmarTokenPara('auth-prof');
    await request(app.getHttpServer())
      .post('/users/alum-1/profesores')
      .set('Authorization', `Bearer ${token}`)
      .send({ profesorId: 'prof-2' })
      .expect(403);
  });

  it('ADMIN asigna un profesor a un alumno — 201 con el vínculo creado', async () => {
    const token = await firmarTokenPara('auth-admin');
    const res = await request(app.getHttpServer())
      .post('/users/alum-1/profesores')
      .set('Authorization', `Bearer ${token}`)
      .send({ profesorId: 'prof-2' })
      .expect(201);

    expect(res.body).toMatchObject({ profesorId: 'prof-2', alumnoId: 'alum-1' });
  });

  it('body sin profesorId es rechazado por el ValidationPipe (400)', async () => {
    const token = await firmarTokenPara('auth-admin');
    await request(app.getHttpServer())
      .post('/users/alum-1/profesores')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);
  });

  it('ADMIN quita un profesor de un alumno — 204 sin body', async () => {
    (fakeCarteraRepository.existe as jest.Mock).mockResolvedValueOnce(true);
    const token = await firmarTokenPara('auth-admin');
    await request(app.getHttpServer())
      .delete('/users/alum-1/profesores/prof-2')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
  });

  it('ADMIN lista los profesores de un alumno', async () => {
    const token = await firmarTokenPara('auth-admin');
    const res = await request(app.getHttpServer())
      .get('/users/alum-1/profesores')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual([
      {
        id: 'prof-2',
        gymId: 'gym-A',
        username: 'prof2',
        nombre: 'Profe Dos',
        role: 'PROFESOR',
        activo: true,
      },
    ]);
  });

  it('PROFESOR lista su propia cartera vía /users/me/alumnos', async () => {
    const token = await firmarTokenPara('auth-prof');
    const res = await request(app.getHttpServer())
      .get('/users/me/alumnos')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual([
      {
        id: 'alum-1',
        gymId: 'gym-A',
        username: 'juan.perez',
        nombre: 'Juan Perez',
        role: 'ALUMNO',
        activo: true,
      },
    ]);
  });

  it('ADMIN no puede ver /users/me/alumnos (403) — es exclusivo de PROFESOR', async () => {
    const token = await firmarTokenPara('auth-admin');
    await request(app.getHttpServer())
      .get('/users/me/alumnos')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});
```

- [ ] **Step 3: Ejecutar el test y verificar que falla**

Run: `pnpm --filter api test -- cartera.controller`
Expected: FAIL — `Cannot find module './cartera.controller'`

- [ ] **Step 4: Implementar el controller**

Crear `apps/api/src/identity/infrastructure/http/cartera.controller.ts`:

```typescript
import { Controller, Delete, Get, HttpCode, Param, Post, Body, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../../domain/role';
import { AuthenticatedUser } from '../../domain/authenticated-user';
import { AssignProfesorToAlumnoUseCase } from '../../application/cartera/assign-profesor-to-alumno.use-case';
import { RemoveProfesorFromAlumnoUseCase } from '../../application/cartera/remove-profesor-from-alumno.use-case';
import { ListCarteraUseCase } from '../../application/cartera/list-cartera.use-case';
import { ListProfesoresDeAlumnoUseCase } from '../../application/cartera/list-profesores-de-alumno.use-case';
import { AssignProfesorDto } from './dto/assign-profesor.dto';
import { toUserResponse } from './user-response.mapper';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

/**
 * Controller separado de `UsersController` (mismo prefijo `users`, Nest lo
 * permite) — gestión de cartera (HU-03b), no CRUD de usuarios. Rutas
 * literales (`me/alumnos`) y con param (`:alumnoId/profesores`) no
 * colisionan: difieren en el segundo segmento del path.
 */
@Controller('users')
export class CarteraController {
  constructor(
    private readonly assignProfesorToAlumnoUseCase: AssignProfesorToAlumnoUseCase,
    private readonly removeProfesorFromAlumnoUseCase: RemoveProfesorFromAlumnoUseCase,
    private readonly listCarteraUseCase: ListCarteraUseCase,
    private readonly listProfesoresDeAlumnoUseCase: ListProfesoresDeAlumnoUseCase,
  ) {}

  @Post(':alumnoId/profesores')
  @Roles(Role.ADMIN)
  async assign(
    @Param('alumnoId') alumnoId: string,
    @Body() dto: AssignProfesorDto,
    @Req() req: RequestWithUser,
  ) {
    return this.assignProfesorToAlumnoUseCase.execute({
      invocadoPor: req.user,
      alumnoId,
      profesorId: dto.profesorId,
    });
  }

  @Delete(':alumnoId/profesores/:profesorId')
  @Roles(Role.ADMIN)
  @HttpCode(204)
  async remove(
    @Param('alumnoId') alumnoId: string,
    @Param('profesorId') profesorId: string,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    await this.removeProfesorFromAlumnoUseCase.execute({
      invocadoPor: req.user,
      alumnoId,
      profesorId,
    });
  }

  @Get(':alumnoId/profesores')
  @Roles(Role.ADMIN)
  async listProfesoresDeAlumno(@Param('alumnoId') alumnoId: string, @Req() req: RequestWithUser) {
    const profesores = await this.listProfesoresDeAlumnoUseCase.execute({
      invocadoPor: req.user,
      alumnoId,
    });
    return profesores.map(toUserResponse);
  }

  @Get('me/alumnos')
  @Roles(Role.PROFESOR)
  async misAlumnos(@Req() req: RequestWithUser) {
    const alumnos = await this.listCarteraUseCase.execute({ invocadoPor: req.user });
    return alumnos.map(toUserResponse);
  }
}
```

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

Run: `pnpm --filter api test -- cartera.controller`
Expected: PASS (9 tests)

- [ ] **Step 6: Wirear el controller y los casos de uso en `IdentityModule`**

En `apps/api/src/identity/identity.module.ts`, agregar los imports y sumar al array de `providers` y `controllers`:

```typescript
import { CARTERA_REPOSITORY } from './application/ports/cartera-repository.port';
import { AssignProfesorToAlumnoUseCase } from './application/cartera/assign-profesor-to-alumno.use-case';
import { RemoveProfesorFromAlumnoUseCase } from './application/cartera/remove-profesor-from-alumno.use-case';
import { ListCarteraUseCase } from './application/cartera/list-cartera.use-case';
import { ListProfesoresDeAlumnoUseCase } from './application/cartera/list-profesores-de-alumno.use-case';
import { PrismaCarteraRepository } from './infrastructure/persistence/prisma-cartera.repository';
import { CarteraController } from './infrastructure/http/cartera.controller';
```

El array `controllers` queda:

```typescript
  controllers: [UsersController, AuthController, CarteraController],
```

El array `providers` gana estas líneas (junto a las de `USER_REPOSITORY`/`AUTH_PROVIDER` y los casos de uso ya existentes):

```typescript
    { provide: CARTERA_REPOSITORY, useClass: PrismaCarteraRepository },
    AssignProfesorToAlumnoUseCase,
    RemoveProfesorFromAlumnoUseCase,
    ListCarteraUseCase,
    ListProfesoresDeAlumnoUseCase,
```

Y `exports` queda:

```typescript
  exports: [USER_REPOSITORY, CARTERA_REPOSITORY],
```

(`CARTERA_REPOSITORY` se exporta ya en esta tarea, no en el Bloque 3B — es el handoff que deja listo este plan.)

- [ ] **Step 7: Ejecutar toda la suite de identity**

Run: `pnpm --filter api test -- identity`
Expected: PASS, todos los suites en verde.

- [ ] **Step 8: Ejecutar la suite completa y el build**

Run: `pnpm --filter api test && pnpm --filter api build && pnpm --filter api prisma:validate`
Expected: los tres comandos exitosos. El conteo total de tests del backend sube de 119 a 119 + 19 (Tarea 3) + 2 (Tarea 4) + 9 (Tarea 5) = 149.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/identity/infrastructure/http/dto/assign-profesor.dto.ts \
        apps/api/src/identity/infrastructure/http/cartera.controller.ts \
        apps/api/src/identity/infrastructure/http/cartera.controller.e2e.spec.ts \
        apps/api/src/identity/identity.module.ts
git commit -m "feat(identity): endpoints HTTP de cartera (POST/DELETE/GET profesores, GET me/alumnos)"
```

---

## Task 6: UI de admin — panel de cartera y migración a tokens

**Files:**

- Modify: `apps/web/app/tokens.css`
- Modify: `apps/web/tailwind.config.ts`
- Modify: `apps/web/app/(admin)/admin/actions.ts`
- Create: `apps/web/app/(admin)/admin/cartera-panel.tsx`
- Modify: `apps/web/app/(admin)/admin/users-list.tsx`
- Modify: `apps/web/app/(admin)/admin/page.tsx`
- Modify: `apps/web/app/(admin)/admin/create-alumno-form.tsx`
- Modify: `apps/web/app/(admin)/admin/create-profesor-form.tsx`

**Interfaces:**

- Consumes: `browserApiFetch`/`BrowserApiError` de `apps/web/lib/browser-api-client.ts` (ya existe, sin cambios); `apiFetch`/`ApiError` de `apps/web/lib/api-client.ts` (ya existe); los endpoints de la Tarea 5 (`POST/DELETE /users/:alumnoId/profesores`, `GET /users/:alumnoId/profesores`); los tokens `bg-surface`/`bg-surface-alt`/`text-text`/`text-text-muted`/`border-border`/`text-danger`/`bg-accent`/`text-accent-fg` (ya existen, Bloque 2).
- Produces: `--color-success` (token nuevo, consumido solo dentro de esta tarea); `CarteraPanel` (componente, consumido por `users-list.tsx` dentro de esta misma tarea); `assignProfesorAction`, `removeProfesorAction` (Server Actions, consumidas por `CarteraPanel`).

- [ ] **Step 1: Agregar el token `--color-success`**

En `apps/web/app/tokens.css`, agregar en el bloque `:root` (junto a `--color-danger`):

```css
--color-success: 22 163 74;
```

Y en el bloque `.dark`:

```css
--color-success: 74 222 128;
```

- [ ] **Step 2: Registrar el token en Tailwind**

En `apps/web/tailwind.config.ts`, agregar dentro de `theme.extend.colors` (junto a `danger`):

```typescript
        success: 'rgb(var(--color-success) / <alpha-value>)',
```

- [ ] **Step 3: Agregar las Server Actions de asignar/quitar profesor**

En `apps/web/app/(admin)/admin/actions.ts`, agregar al final del archivo:

```typescript
export async function assignProfesorAction(
  alumnoId: string,
  profesorId: string,
): Promise<{ error: string | null }> {
  try {
    await apiFetch(`/users/${alumnoId}/profesores`, {
      method: 'POST',
      body: JSON.stringify({ profesorId }),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: 'Error inesperado asignando el profesor.' };
  }

  revalidatePath('/admin');
  return { error: null };
}

export async function removeProfesorAction(
  alumnoId: string,
  profesorId: string,
): Promise<{ error: string | null }> {
  try {
    await apiFetch(`/users/${alumnoId}/profesores/${profesorId}`, { method: 'DELETE' });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: 'Error inesperado quitando el profesor.' };
  }

  revalidatePath('/admin');
  return { error: null };
}
```

- [ ] **Step 4: Crear el componente `CarteraPanel`**

Crear `apps/web/app/(admin)/admin/cartera-panel.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { browserApiFetch, BrowserApiError } from '../../../lib/browser-api-client';
import { assignProfesorAction, removeProfesorAction } from './actions';

interface UserRow {
  id: string;
  username: string;
  nombre: string;
  role: 'ADMIN' | 'PROFESOR' | 'ALUMNO';
  activo: boolean;
}

/**
 * Panel de gestión de cartera de un alumno (HU-03b), colgado de cada fila
 * de `UsersList`. Carga los profesores asignados on-demand al abrirse, vía
 * `browserApiFetch` — primer consumidor real del proxy `/api/proxy/*`
 * (deuda técnica anotada en HLD §6, saldada con el test de la Tarea 7).
 * Asignar/quitar van por Server Actions (mismo patrón que
 * `deactivateUserAction`); como la lista de acá abajo no sale de las
 * props del Server Component, se recarga a mano después de cada mutación
 * — `revalidatePath('/admin')` no llega a este estado local.
 */
export function CarteraPanel({
  alumno,
  profesoresDelGym,
}: {
  alumno: UserRow;
  profesoresDelGym: UserRow[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [asignados, setAsignados] = useState<UserRow[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profesorSeleccionado, setProfesorSeleccionado] = useState('');

  async function cargarAsignados() {
    setCargando(true);
    setError(null);
    try {
      const datos = await browserApiFetch<UserRow[]>(`users/${alumno.id}/profesores`);
      setAsignados(datos);
    } catch (err) {
      setError(err instanceof BrowserApiError ? err.message : 'Error cargando profesores.');
    } finally {
      setCargando(false);
    }
  }

  function toggle() {
    const siguiente = !abierto;
    setAbierto(siguiente);
    if (siguiente && asignados === null) {
      void cargarAsignados();
    }
  }

  async function asignar() {
    if (!profesorSeleccionado) return;
    setError(null);
    const resultado = await assignProfesorAction(alumno.id, profesorSeleccionado);
    if (resultado.error) {
      setError(resultado.error);
      return;
    }
    setProfesorSeleccionado('');
    await cargarAsignados();
  }

  async function quitar(profesorId: string) {
    setError(null);
    const resultado = await removeProfesorAction(alumno.id, profesorId);
    if (resultado.error) {
      setError(resultado.error);
      return;
    }
    await cargarAsignados();
  }

  const idsAsignados = new Set((asignados ?? []).map((p) => p.id));
  const disponibles = profesoresDelGym.filter((p) => !idsAsignados.has(p.id));

  return (
    <div className="mt-2">
      <button
        onClick={toggle}
        className="text-sm font-medium text-accent underline-offset-2 hover:underline"
      >
        Profesores {abierto ? '▲' : '▼'}
      </button>

      {abierto && (
        <div className="mt-2 rounded-lg border border-border bg-surface-alt p-3">
          {cargando && <p className="text-sm text-text-muted">Cargando...</p>}
          {error && (
            <p role="alert" className="mb-2 text-sm text-danger">
              {error}
            </p>
          )}

          {!cargando && asignados !== null && (
            <ul className="flex flex-col gap-2">
              {asignados.length === 0 && (
                <li className="text-sm text-text-muted">Sin profesores asignados</li>
              )}
              {asignados.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-text">{p.nombre}</span>
                  <button
                    onClick={() => quitar(p.id)}
                    aria-label={`Quitar a ${p.nombre}`}
                    className="min-h-8 min-w-8 rounded-full text-danger hover:bg-surface"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!cargando && disponibles.length > 0 && (
            <div className="mt-3 flex gap-2">
              <select
                value={profesorSeleccionado}
                onChange={(e) => setProfesorSeleccionado(e.target.value)}
                className="min-h-11 flex-1 rounded-lg border border-border bg-surface px-3 text-base text-text"
              >
                <option value="">Elegir profesor...</option>
                {disponibles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
              <button
                onClick={asignar}
                disabled={!profesorSeleccionado}
                className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50"
              >
                Asignar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Integrar `CarteraPanel` en `UsersList` y migrar la pantalla a tokens**

Reemplazar el contenido completo de `apps/web/app/(admin)/admin/users-list.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { deactivateUserAction } from './actions';
import { CarteraPanel } from './cartera-panel';

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
  const profesoresDelGym = usuariosIniciales.filter((u) => u.role === 'PROFESOR');

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
        className={`min-h-11 rounded-lg border border-danger/30 px-4 text-sm font-medium text-danger active:bg-danger/10 disabled:border-border disabled:text-text-muted ${className}`}
      >
        Desactivar
      </button>
    );
  }

  function EstadoBadge({ activo }: { activo: boolean }) {
    return (
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
          activo ? 'bg-success/15 text-success' : 'bg-surface-alt text-text-muted'
        }`}
      >
        {activo ? 'Activo' : 'Inactivo'}
      </span>
    );
  }

  return (
    <section className="rounded-2xl bg-surface p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-text">Usuarios del gym</h2>
        <label className="flex items-center gap-2 text-sm text-text">
          Filtrar por rol
          <select
            value={filtroRol}
            onChange={(e) => setFiltroRol(e.target.value as FiltroRol)}
            className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base text-text"
          >
            <option value="TODOS">Todos</option>
            <option value="ADMIN">Admin</option>
            <option value="PROFESOR">Profesor</option>
            <option value="ALUMNO">Alumno</option>
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      )}

      {/* Mobile: tarjetas apiladas (default, sin prefijo — oculto desde md:) */}
      <ul className="flex flex-col gap-3 md:hidden">
        {usuariosFiltrados.map((u) => (
          <li key={u.id} className="rounded-xl border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-text">{u.nombre}</p>
                <p className="text-sm text-text-muted">@{u.username}</p>
              </div>
              <EstadoBadge activo={u.activo} />
            </div>
            <p className="mt-2 text-sm text-text-muted">{ETIQUETA_ROL[u.role]}</p>
            {u.role === 'ALUMNO' && <CarteraPanel alumno={u} profesoresDelGym={profesoresDelGym} />}
            <BotonDesactivar u={u} className="mt-3 w-full" />
          </li>
        ))}
      </ul>

      {/* md: en adelante — tabla, columnas más aprovechables en pantalla ancha */}
      <table className="hidden w-full text-left md:table">
        <thead>
          <tr className="border-b border-border text-sm text-text-muted">
            <th className="py-2 font-medium">Usuario</th>
            <th className="py-2 font-medium">Nombre</th>
            <th className="py-2 font-medium">Rol</th>
            <th className="py-2 font-medium">Estado</th>
            <th className="py-2 font-medium">Cartera</th>
            <th className="py-2 font-medium">Acción</th>
          </tr>
        </thead>
        <tbody>
          {usuariosFiltrados.map((u) => (
            <tr key={u.id} className="border-b border-border last:border-0">
              <td className="py-3 text-sm text-text-muted">@{u.username}</td>
              <td className="py-3 text-text">{u.nombre}</td>
              <td className="py-3 text-text">{ETIQUETA_ROL[u.role]}</td>
              <td className="py-3">
                <EstadoBadge activo={u.activo} />
              </td>
              <td className="py-3">
                {u.role === 'ALUMNO' ? (
                  <CarteraPanel alumno={u} profesoresDelGym={profesoresDelGym} />
                ) : (
                  <span className="text-sm text-text-muted">—</span>
                )}
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

- [ ] **Step 6: Migrar `admin/page.tsx` a tokens**

Reemplazar el contenido de `apps/web/app/(admin)/admin/page.tsx`:

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
    <main className="min-h-dvh bg-surface-alt px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <h1 className="text-2xl font-semibold text-text">Panel Admin</h1>
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

- [ ] **Step 7: Migrar los dos formularios a tokens**

En `apps/web/app/(admin)/admin/create-alumno-form.tsx`, reemplazar `bg-white` → `bg-surface`, `text-neutral-900` → `text-text` (título y `INPUT_CLASSES`), `border-neutral-300` → `border-border`, `placeholder:text-neutral-400` → `placeholder:text-text-muted`, `focus:border-neutral-900` → `focus:border-accent`, `text-red-600` → `text-danger`, `bg-green-50` → `bg-success/10`, `text-green-800` → `text-success`. El botón (`bg-neutral-900 ... text-white active:bg-neutral-700`) pasa a `bg-accent text-accent-fg active:opacity-90`.

Contenido final de `apps/web/app/(admin)/admin/create-alumno-form.tsx`:

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
      className="min-h-11 w-full rounded-lg bg-accent px-4 text-base font-medium text-accent-fg active:opacity-90 disabled:opacity-50 sm:w-auto"
    >
      {pending ? 'Creando...' : 'Crear alumno'}
    </button>
  );
}

const INPUT_CLASSES =
  'min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted focus:border-accent focus:outline-none';

export function CreateAlumnoForm() {
  const [estado, formAction] = useFormState(createAlumnoAction, ESTADO_INICIAL);

  return (
    <section className="rounded-2xl bg-surface p-4 shadow-sm sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-text">Nuevo alumno</h2>
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
          <p role="alert" className="text-sm text-danger">
            {estado.error}
          </p>
        )}
        {estado.usernameGenerado && (
          <p className="rounded-lg bg-success/10 p-3 text-sm text-success">
            Usuario creado: <strong className="font-semibold">{estado.usernameGenerado}</strong> —
            comunicáselo en persona (es lo único que necesita para entrar).
          </p>
        )}
      </form>
    </section>
  );
}
```

Contenido final de `apps/web/app/(admin)/admin/create-profesor-form.tsx`:

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
      className="min-h-11 w-full rounded-lg bg-accent px-4 text-base font-medium text-accent-fg active:opacity-90 disabled:opacity-50 sm:w-auto"
    >
      {pending ? 'Creando...' : 'Crear profesor'}
    </button>
  );
}

const INPUT_CLASSES =
  'min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted focus:border-accent focus:outline-none';

export function CreateProfesorForm() {
  const [estado, formAction] = useFormState(createProfesorAction, ESTADO_INICIAL);

  return (
    <section className="rounded-2xl bg-surface p-4 shadow-sm sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-text">Nuevo profesor</h2>
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
          <p role="alert" className="text-sm text-danger">
            {estado.error}
          </p>
        )}
        {estado.success && <p className="text-sm text-success">Profesor creado.</p>}
      </form>
    </section>
  );
}
```

- [ ] **Step 8: Verificar el build de `apps/web`**

Run: `pnpm --filter web build`
Expected: build exitoso, sin errores de tipos ni de Tailwind (las clases `bg-success/15`, `text-danger`, etc. son válidas porque `success`/`danger` ya están registrados como colores de Tailwind con soporte de opacidad vía `<alpha-value>`).

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/tokens.css apps/web/tailwind.config.ts \
        apps/web/app/\(admin\)/admin/actions.ts \
        apps/web/app/\(admin\)/admin/cartera-panel.tsx \
        apps/web/app/\(admin\)/admin/users-list.tsx \
        apps/web/app/\(admin\)/admin/page.tsx \
        apps/web/app/\(admin\)/admin/create-alumno-form.tsx \
        apps/web/app/\(admin\)/admin/create-profesor-form.tsx
git commit -m "feat(web): panel de gestión de cartera en /admin + migración a tokens"
```

---

## Task 7: Jest en `apps/web` + test de integración del proxy (401→refresh→retry)

**Files:**

- Modify: `apps/web/package.json`
- Create: `apps/web/jest.config.js`
- Create: `apps/web/app/api/proxy/[...path]/route.spec.ts`

**Interfaces:**

- Consumes: el handler exportado (`GET`, `POST`, `PATCH`, `DELETE`, todos la misma función) de `apps/web/app/api/proxy/[...path]/route.ts` (ya existe, sin cambios de código); `getStoredSession` de `apps/web/lib/session.ts` (mockeado); `refreshSession` de `apps/web/lib/refresh-session.ts` (mockeado).
- Produces: infraestructura de test para `apps/web` (`pnpm --filter web test`), reusable por cualquier test futuro de esa app.

**Nota:** `apps/web` no tiene ningún test automatizado hoy (sin Jest, sin ningún `.spec.ts`). Esta tarea agrega el runner desde cero, con el helper oficial `next/jest` (ya viene con la versión de `next` instalada, no requiere transformador propio) — es la forma mínima de cumplir el pedido explícito de un test de integración real, no manual, para el proxy.

- [ ] **Step 1: Agregar Jest como devDependency y el script de test**

En `apps/web/package.json`, agregar a `"scripts"`:

```json
    "test": "jest",
```

Y a `"devDependencies"`:

```json
    "@types/jest": "^29.5.13",
    "jest": "^29.7.0",
    "jest-environment-node": "^29.7.0",
```

- [ ] **Step 2: Instalar dependencias**

Run: `pnpm install`
Expected: instala `jest`, `jest-environment-node`, `@types/jest` en `apps/web/node_modules` sin tocar `apps/api`.

- [ ] **Step 3: Configurar Jest con el helper de Next**

Crear `apps/web/jest.config.js`:

```javascript
const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const customJestConfig = {
  testEnvironment: 'node',
  testMatch: ['**/*.spec.ts'],
};

module.exports = createJestConfig(customJestConfig);
```

`testEnvironment: 'node'` porque los Route Handlers de Next corren en runtime Node/Edge, nunca en un DOM — un `testEnvironment: 'jsdom'` (el default recomendado por Next para componentes) sería incorrecto acá.

- [ ] **Step 4: Escribir el test — primero el caso base y el de passthrough**

Crear `apps/web/app/api/proxy/[...path]/route.spec.ts`:

```typescript
process.env.API_BASE_URL = 'http://localhost:3001';

import { NextRequest } from 'next/server';
import { GET } from './route';
import { getStoredSession } from '../../../../lib/session';
import { refreshSession } from '../../../../lib/refresh-session';

jest.mock('../../../../lib/session', () => ({
  getStoredSession: jest.fn(),
}));
jest.mock('../../../../lib/refresh-session', () => ({
  refreshSession: jest.fn(),
}));

const mockGetStoredSession = getStoredSession as jest.Mock;
const mockRefreshSession = refreshSession as jest.Mock;

describe('/api/proxy/[...path] (integración)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn();
  });

  it('sin sesión almacenada, devuelve 401 sin llegar a pegarle al backend', async () => {
    mockGetStoredSession.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/proxy/exercises');
    const response = await GET(request, { params: { path: ['exercises'] } });

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('con access token válido, reenvía la request y devuelve la respuesta del backend tal cual', async () => {
    mockGetStoredSession.mockResolvedValue({
      accessToken: 'valid-token',
      refreshToken: 'refresh-token',
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const request = new NextRequest('http://localhost:3000/api/proxy/exercises?limit=2');
    const response = await GET(request, { params: { path: ['exercises'] } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/exercises?limit=2',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer valid-token' }),
      }),
    );
  });
});
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `pnpm --filter web test`
Expected: PASS (2 tests)

- [ ] **Step 6: Agregar el caso central — 401 del backend, refresh, reintento, query string preservada en ambos intentos**

Agregar este test dentro del mismo `describe`, después del anterior:

```typescript
it('ante un 401 del backend, refresca y reintenta UNA vez, preservando la query string en ambos intentos', async () => {
  mockGetStoredSession.mockResolvedValue({
    accessToken: 'expired-token',
    refreshToken: 'refresh-token',
  });
  mockRefreshSession.mockResolvedValue({ accessToken: 'new-token' });
  (global.fetch as jest.Mock)
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

  const request = new NextRequest('http://localhost:3000/api/proxy/exercises?limit=2&page=3');
  const response = await GET(request, { params: { path: ['exercises'] } });

  expect(response.status).toBe(200);
  expect(global.fetch).toHaveBeenCalledTimes(2);
  // Regresión del bug encontrado en el Bloque 2 (Task 9): la query string
  // se perdía en el reintento post-refresh — acá se verifica en AMBOS.
  expect(global.fetch).toHaveBeenNthCalledWith(
    1,
    'http://localhost:3001/exercises?limit=2&page=3',
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer expired-token' }),
    }),
  );
  expect(global.fetch).toHaveBeenNthCalledWith(
    2,
    'http://localhost:3001/exercises?limit=2&page=3',
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer new-token' }),
    }),
  );
  expect(mockRefreshSession).toHaveBeenCalledWith('refresh-token');
});

it('si el refresh también falla, devuelve el 401 original al cliente sin reintentar', async () => {
  mockGetStoredSession.mockResolvedValue({
    accessToken: 'expired-token',
    refreshToken: 'refresh-token-invalido',
  });
  mockRefreshSession.mockResolvedValue(null);
  (global.fetch as jest.Mock).mockResolvedValueOnce(new Response(null, { status: 401 }));

  const request = new NextRequest('http://localhost:3000/api/proxy/exercises');
  const response = await GET(request, { params: { path: ['exercises'] } });

  expect(response.status).toBe(401);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 7: Ejecutar toda la suite y verificar que pasa**

Run: `pnpm --filter web test`
Expected: PASS (4 tests)

- [ ] **Step 8: Marcar saldada la deuda técnica en el HLD**

En `apps/api/../../docs/hld-mvp.md` (ruta real: `docs/hld-mvp.md`), en la sección `## 6. Deuda técnica aceptada explícitamente`, reemplazar el segundo bullet completo:

Buscar:

```
- **Proxy BFF (`app/api/proxy/[...path]/route.ts`) sin cobertura de test real.** Construido y compilando, pero nada lo ejercita todavía (ningún Client Component hace fetch directo a la API). Agregar test de integración del flujo completo (401→refresh→retry) cuando aparezca el primer uso real, no antes. **Se salda en el bloque de cartera:** el panel de gestión de cartera de `/admin` es el primer consumidor real de `browser-api-client` y trae ese test.
```

Reemplazar por:

```
- ~~**Proxy BFF (`app/api/proxy/[...path]/route.ts`) sin cobertura de test real.**~~ **Saldada en el Bloque 3A.** El panel de cartera de `/admin` es el primer consumidor real de `browser-api-client`, y `apps/web/app/api/proxy/[...path]/route.spec.ts` cubre passthrough 200, el ciclo 401→refresh→retry con la query string preservada en ambos intentos, y el caso donde el refresh también falla.
```

- [ ] **Step 9: Commit**

```bash
git add apps/web/package.json apps/web/jest.config.js \
        "apps/web/app/api/proxy/[...path]/route.spec.ts" \
        docs/hld-mvp.md pnpm-lock.yaml
git commit -m "test(web): agregar Jest y test de integración del proxy (401→refresh→retry)"
```

---

## Task 8: Verificación final end-to-end

**Files:** ninguno nuevo — esta tarea es puramente de verificación, sin cambios de código salvo lo que un hallazgo real obligue a corregir.

**Interfaces:**

- Consumes: todo lo producido por las Tareas 1-7.
- Produces: confirmación de que el bloque está listo para revisión humana y commit final (según la política de git del proyecto, ningún commit de este plan se pushea sin autorización explícita).

- [ ] **Step 1: Suite completa del backend**

Run: `pnpm --filter api test && pnpm --filter api build && pnpm --filter api prisma:validate`
Expected: los tres en verde. Conteo esperado de tests: 149 (119 preexistentes + 30 nuevos de este plan).

- [ ] **Step 2: Suite completa del frontend**

Run: `pnpm --filter web test && pnpm --filter web build`
Expected: ambos en verde. El build lista `/admin`, `/catalogo`, `/catalogo/[id]` y el resto de las rutas existentes sin errores.

- [ ] **Step 3: Verificación manual contra Supabase real — cartera automática**

Usando un usuario PROFESOR real y activo del gym (ya existente, sin crear ninguno nuevo), loguearse y dar de alta un ALUMNO nuevo vía `/admin` o vía `curl -X POST` a `/users/alumno` con el token de ese profesor. Confirmar contra la DB real (`SELECT * FROM "ProfesorAlumno" WHERE "alumnoId" = '<id del alumno recién creado>'`) que existe exactamente una fila con `profesorId` igual al del profesor que lo dio de alta.

- [ ] **Step 4: Verificación manual contra Supabase real — panel de admin**

Loguearse como ADMIN en `/admin`, abrir el panel de cartera de un alumno existente, asignarle un profesor y confirmar que aparece en la lista sin recargar la página. Quitarlo y confirmar que desaparece. Repetir una vez con la pestaña de red abierta para confirmar que la carga inicial del panel pasa por `/api/proxy/users/.../profesores` (no por un fetch directo a la API).

Preferible: no crear ningún usuario nuevo para esta verificación, usar exclusivamente los que ya existen en el gym real. Si igual hiciera falta uno de prueba, borrarlo al terminar con un script puntual (mismo patrón que la limpieza de `e2e.verify.admin` del Bloque 2): primero la fila en la tabla `User` vía Prisma, después el usuario correspondiente en `auth.users` de Supabase — en ese orden, para no dejar un usuario de Auth huérfano sin fila interna si algo falla a mitad de camino.

- [ ] **Step 5: Inspección visual mobile-first**

Abrir `/admin` en un viewport de celular real (no solo DevTools), con el panel de cartera abierto: confirmar que el panel se despliega correctamente debajo de la tarjeta del alumno en mobile, que el `<select>` y los botones son usables con el dedo (altura táctil ya viene de `min-h-11`, confirmar que no quedó ninguna clase vieja pisándola), y que el toggle claro/oscuro no deja ningún texto o fondo del color anterior (`neutral-*`, `red-600`, `green-100`) — específicamente revisar el estado con el panel abierto y con error simulado (por ejemplo, apagando momentáneamente el backend y reintentando asignar).

- [ ] **Step 6: Confirmar el handoff a 3B**

Verificar en el código (no en la documentación) que `IdentityModule` exporta `CARTERA_REPOSITORY`:

Run: `grep -n "exports" apps/api/src/identity/identity.module.ts`
Expected: la línea de exports incluye tanto `USER_REPOSITORY` como `CARTERA_REPOSITORY`.

- [ ] **Step 7: Reportar el estado a Fernando**

Sin commitear ni pushear nada más allá de lo ya comiteado tarea por tarea — la política del proyecto exige autorización explícita para cualquier `git commit`/`git push` adicional, y en particular ninguna tarea de este plan hace `git push`. Informar: conteo final de tests (backend/frontend), resultado de los 4 pasos de verificación manual, y cualquier hallazgo que haya requerido un fix fuera de lo ya descrito en este plan.
