# Bloque 3B — Routines + Hard-Delete de Usuarios (diseño)

**Fecha:** 2026-09-06
**Estado:** aprobado, pendiente de planes de implementación
**Alcance:** el bounded context `Routines` completo (HU-04 a HU-09 del PRD), y la eliminación definitiva de usuarios (HU-03c) y de plantillas (HU-07/regla 11) — van en el mismo ciclo porque ambas tocan el mismo cambio de schema compartido (`RoutineInstance.profesorId` nullable).
**Fuera de alcance:** duplicar/clonar una plantilla existente como base de otra plantilla (confirmado explícitamente fuera — el PRD lo lista en Fase 2, §2); desasignar una rutina sin reemplazarla; historial de rutinas anteriores para el profesor o el alumno (Fase 2, ya explícito en el PRD); tracking de progreso real ejecutado (Fase 2).

Con este bloque se cierra **Fase 1 (MVP funcional)** del roadmap del HLD.

## 1. Por qué van juntos Routines y hard-delete

`RoutineInstance.profesorId` hoy es obligatorio. La cascada de hard-delete de un PROFESOR (HU-03c) exige que sus instancias puedan sobrevivir a su eliminación con `profesorId = null` — eso es un cambio de schema de `Routines`, no de `Identity`. Escribir Routines sin el nullable de entrada obligaría a una migración adicional apenas después; escribirlos juntos evita esa segunda vuelta.

## 2. El problema arquitectónico central: cross-context en el hard-delete

El HLD §2 fija la dirección de dependencias `routines → identity`, nunca al revés. Pero el hard-delete de un usuario (caso de uso de `identity`) tiene que borrar datos de `routines`, y tiene que ser atómico.

**Decisión: Inversión de dependencias (DIP).** `identity` declara el contrato que necesita, `routines` lo implementa:

```typescript
// apps/api/src/identity/application/ports/routines-cleanup.port.ts
import type { Prisma } from '@prisma/client';

export const ROUTINES_CLEANUP = Symbol('ROUTINES_CLEANUP');

export interface RoutinesCleanupImpact {
  plantillasABorrar: number;
  instanciasABorrar: number;
  instanciasQueSobreviven: number; // pasan a profesorId: null
  vinculosDeCarteraABorrar: number;
}

/**
 * `identity` declara este puerto porque necesita que alguien limpie los
 * datos de Routines antes de borrar un User — pero `identity` nunca debe
 * depender de `routines` (HLD §2: la dirección es routines → identity).
 * `routines` es quien lo implementa, sin invertir esa dirección: sigue
 * siendo routines quien conoce a identity, no al revés.
 *
 * `tx: Prisma.TransactionClient` es una fuga deliberada de infraestructura
 * en una interfaz de application layer — no es hexagonal puro. Se acepta
 * por el mismo criterio que la transacción de alta con cartera del Bloque
 * 3A: construir un Unit of Work genérico solo para este caso de uso es
 * sobre-ingeniería para un MVP de un gimnasio. El hard-delete completo
 * (routines → ProfesorAlumno → User) tiene que ser una única transacción,
 * y Prisma no tiene una abstracción de transacción que cruce repos sin
 * pasar el mismo `tx` explícitamente.
 */
export interface RoutinesCleanupPort {
  contarImpacto(userId: string, role: 'PROFESOR' | 'ALUMNO'): Promise<RoutinesCleanupImpact>;
  eliminarDatosDe(
    userId: string,
    role: 'PROFESOR' | 'ALUMNO',
    tx: Prisma.TransactionClient,
  ): Promise<void>;
}
```

`routines/infrastructure/persistence/prisma-routines-cleanup.adapter.ts` implementa esto. `RoutinesModule` provee `{ provide: ROUTINES_CLEANUP, useClass: PrismaRoutinesCleanupAdapter }` y lo exporta; `IdentityModule` lo importa (`imports: [RoutinesModule]`) — es la primera vez que `identity` importa el módulo de otro bounded context de negocio, y es correcto: importa el _módulo_ de Nest para obtener el _provider_ que implementa _su propio_ puerto, no accede a los repos internos de `routines`.

## 3. Modelo de datos

```prisma
model RoutineTemplateExercise {
  peso Decimal? @db.Decimal(5, 2)  // nuevo
}

model RoutineInstanceExercise {
  peso Decimal? @db.Decimal(5, 2)  // nuevo
}

model RoutineInstance {
  profesorId String?          // pasa a nullable
  profesor   User?            @relation("ProfesorInstances", fields: [profesorId], references: [id], onDelete: SetNull)
  origenTemplate RoutineTemplate? @relation("OrigenTemplate", fields: [origenTemplateId], references: [id], onDelete: SetNull)
}
```

Notas:

- `peso`: prescripto por el profesor, nunca tracking de ejecución real (eso es Fase 2). `Decimal(5,2)` → hasta 999.99kg con carga fraccionada. Nullable por los ejercicios de peso corporal.
- `profesorId` nullable + `onDelete: SetNull`: la justifica exclusivamente la cascada de hard-delete de PROFESOR (§6). No la justifica ningún endpoint de Routines en sí — sin el hard-delete de usuarios, `profesorId` seguiría siendo obligatorio.
- `origenTemplateId` pasa a `onDelete: SetNull`: la justifica el hard-delete de PLANTILLA (§7), que es una decisión de producto separada (HU-07/regla 11) — sin esa FK nullable, borrar una plantilla ya asignada rompería contra la referencia de sus instancias.

Migración: aditiva en `RoutineTemplateExercise`/`RoutineInstanceExercise` (`peso`), y de relajación de constraint en `RoutineInstance` (`profesorId` y `origenTemplateId` pasan de obligatorio/su `onDelete` actual a nullable/`SetNull`). Sin `DELETE` de filas — hoy no hay `RoutineInstance` en producción todavía (el bounded context está vacío), así que no hay dato real que migrar.

## 4. Backend — Routines

### 4.1 Dos puertos, no uno

```typescript
// routine-template-repository.port.ts
export interface RoutineTemplateRepositoryPort {
  findByProfesor(profesorId: string): Promise<RoutineTemplateSummary[]>;
  findById(id: string): Promise<RoutineTemplateDetail | null>;
  create(data: {
    gymId: string;
    profesorId: string;
    nombre: string;
    descripcion?: string;
  }): Promise<RoutineTemplateSummary>;
  update(
    id: string,
    data: { nombre?: string; descripcion?: string; activa?: boolean },
  ): Promise<RoutineTemplateSummary>;
  delete(id: string): Promise<void>;
  replaceExercises(templateId: string, ejercicios: EjercicioInput[]): Promise<void>;
}

// routine-instance-repository.port.ts
export interface RoutineInstanceRepositoryPort {
  findVigentePorAlumno(alumnoId: string): Promise<RoutineInstanceDetail | null>;
  findById(id: string): Promise<RoutineInstanceDetail | null>;
  // Transaccional: archiva la RoutineInstance vigente del alumno (si existe)
  // y crea la nueva, en un único $transaction.
  crearDesdeTemplate(data: {
    gymId: string;
    profesorId: string;
    alumnoId: string;
    nombre: string;
    origenTemplateId: string;
    ejercicios: EjercicioInput[]; // ya clonados desde RoutineTemplateExercise[] por el caso de uso
  }): Promise<RoutineInstanceDetail>;
  crearDesdeCero(data: {
    gymId: string;
    profesorId: string;
    alumnoId: string;
    nombre: string;
    ejercicios: EjercicioInput[];
  }): Promise<RoutineInstanceDetail>;
  update(id: string, data: { nombre?: string }): Promise<RoutineInstanceDetail>;
  replaceExercises(instanceId: string, ejercicios: EjercicioInput[]): Promise<void>;
}

interface EjercicioInput {
  exerciseId: string;
  orden: number;
  series: number;
  repeticiones: number;
  peso?: number;
  descanso: number;
  notas?: string;
}
```

`RoutineTemplateRepositoryPort` no tiene ningún parámetro de cartera — es propiedad exclusiva, cada método ya recibe o deriva el `profesorId` del invocador. `RoutineInstanceRepositoryPort` tampoco valida cartera en sí mismo (esa validación vive en los casos de uso, vía `CarteraRepositoryPort.existe()` de 3A) — el repo solo ejecuta la query, la autorización es responsabilidad de la capa de aplicación, mismo patrón que Identity/Cartera.

### 4.2 Casos de uso — Templates (sin cartera)

| Caso de uso                       | Validación                                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CreateRoutineTemplateUseCase`    | rol PROFESOR                                                                                                                                                                   |
| `ListRoutineTemplatesUseCase`     | rol PROFESOR, filtra por `profesorId = invocadoPor.id`                                                                                                                         |
| `GetRoutineTemplateUseCase`       | rol PROFESOR, `template.profesorId === invocadoPor.id` — si no, `RoutineTemplateNotFoundError` (404, convención HLD §4: ni siquiera puede saber si existe una plantilla ajena) |
| `UpdateRoutineTemplateUseCase`    | ídem                                                                                                                                                                           |
| `ReplaceTemplateExercisesUseCase` | ídem + `ejercicios.length <= 50` + todos los `exerciseId` existen en el catálogo                                                                                               |
| `DeleteRoutineTemplateUseCase`    | ídem + **gate: `template.activa === false`** (regla 11) — si está activa, `TemplateNotInactiveError` (409)                                                                     |

### 4.3 Casos de uso — Instances (con cartera)

| Caso de uso                               | Validación                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AssignRoutineToAlumnoUseCase`            | rol PROFESOR + `CarteraRepositoryPort.existe(invocadoPor.id, alumnoId)` — si no existe, `UserNotFoundError` (404, no 403: el alumno puede ser de OTRO gym, y si es del mismo gym pero fuera de cartera, la convención de HLD §4 dice 403 — ver nota abajo). Si trae `origenTemplateId`: valida que la plantilla sea del profesor y tenga ≥1 ejercicio (HU-04); clona ejercicios con `peso`. Archiva la instancia vigente anterior del alumno (si existe) dentro de la misma transacción. |
| `UpdateRoutineInstanceUseCase`            | rol PROFESOR + cartera vigente (no contra `instance.profesorId`)                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `ReplaceInstanceExercisesUseCase`         | ídem + máx 50 ejercicios                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `GetAlumnoRutinaVigenteAsProfesorUseCase` | rol PROFESOR + cartera                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `GetMiRutinaVigenteUseCase`               | rol ALUMNO, siempre `invocadoPor.id`, resuelve ejercicios contra `ExerciseRepositoryPort.findByIds`                                                                                                                                                                                                                                                                                                                                                                                      |

**Nota sobre el matiz 403 vs 404 en `AssignRoutineToAlumnoUseCase`:** la convención del HLD §4 tiene dos ramas — otro gym/inexistente → 404; mismo gym pero fuera de una relación conocida (cartera) → 403 (cita textual: "un PROFESOR que intenta operar sobre un alumno de su mismo gym que no está en su cartera recibe 403, no 404"). El caso de uso por lo tanto NO puede resolver todo con un solo `existe()` booleano — necesita distinguir "no existe/otro gym" de "existe, mismo gym, fuera de cartera" para devolver el código correcto. Implementación: primero `UserRepositoryPort.findById(alumnoId)` + chequeo de gym (→ 404 si falla), después `CarteraRepositoryPort.existe()` (→ 403 si falla). Mismo patrón exacto que ya usa `AssignProfesorToAlumnoUseCase` de 3A.

### 4.4 Helper de deduplicación (deuda de 3A que se paga acá)

El patrón `if (!x || x.gymId !== invocadoPor.gymId) throw new UserNotFoundError(x)` se repetía en 3 casos de uso de Cartera (hallazgo Minor de la revisión final de 3A, con prioridad subida explícitamente para antes de Routines). Se extrae a:

```typescript
// identity/application/resolve-user-in-gym.ts
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

Los casos de uso de Routines lo consumen desde el primer día (no se escriben duplicando el patrón de nuevo); los 3 casos de uso de Cartera de 3A se refactorizan para usarlo también, como parte de la misma tarea que lo introduce.

### 4.5 HTTP

| Método | Ruta                               | Rol                                       |
| ------ | ---------------------------------- | ----------------------------------------- |
| POST   | `/routine-templates`               | PROFESOR                                  |
| GET    | `/routine-templates`               | PROFESOR (las propias)                    |
| GET    | `/routine-templates/:id`           | PROFESOR (propia)                         |
| PATCH  | `/routine-templates/:id`           | PROFESOR (propia)                         |
| DELETE | `/routine-templates/:id`           | PROFESOR (propia, gate: `activa: false`)  |
| PUT    | `/routine-templates/:id/exercises` | PROFESOR (propia, replace-all, máx 50)    |
| POST   | `/routine-instances`               | PROFESOR (+ cartera)                      |
| GET    | `/routine-instances/:id`           | PROFESOR (+ cartera)                      |
| PATCH  | `/routine-instances/:id`           | PROFESOR (+ cartera)                      |
| PUT    | `/routine-instances/:id/exercises` | PROFESOR (+ cartera, replace-all, máx 50) |
| GET    | `/users/:alumnoId/rutina-vigente`  | PROFESOR (+ cartera)                      |
| GET    | `/users/me/rutina-vigente`         | ALUMNO                                    |

Las dos últimas viven en un controller `routines.controller.ts` con `@Controller('users')` (mismo patrón que `CarteraController` de 3A: prefijo compartido, archivo separado por responsabilidad) porque conceptualmente son sub-recursos de usuario, no de rutina.

Errores nuevos: `RoutineTemplateNotFoundError` (404), `TemplateNotInactiveError` (409), `TemplateHasNoExercisesError` (400, al intentar asignar sin ejercicios), `RoutineInstanceNotFoundError` (404), `TooManyExercisesError` (400, > 50).

## 5. Route group del catálogo (deuda de 3A)

`/catalogo` y `/catalogo/[id]` viven hoy bajo `(profesor)/`, legibles por los tres roles a propósito (el alumno los necesita para HU-09). Esto bloqueaba poner `@Roles(PROFESOR)` real en `(profesor)/layout.tsx`. Se resuelve moviendo esas dos rutas a un route group nuevo `(catalogo)/catalogo/` con su propio `layout.tsx` que solo valida sesión (mismo patrón que el guard actual de `(profesor)`, sin el `@Roles`). Recién ahí `(profesor)/layout.tsx` puede exigir `PROFESOR` de verdad.

## 6. Hard-delete de usuarios (HU-03c)

```typescript
// identity/application/get-user-deletion-impact.use-case.ts
export interface DeletionImpact {
  plantillasABorrar: number;
  instanciasABorrar: number;
  instanciasQueSobreviven: number;
  vinculosDeCarteraABorrar: number;
}
```

`GetUserDeletionImpactUseCase`: rol ADMIN, usuario del gym, delega el conteo a `RoutinesCleanupPort.contarImpacto()` + cuenta directa de `ProfesorAlumno`.

`DeleteUserPermanentlyUseCase`: rol ADMIN, `resolveUserInGym`, **gate: `objetivo.activo === false`** (si está activo, `UserNotInactiveError`, 409), `objetivo.role !== Role.ADMIN` (nunca se elimina un ADMIN por esta vía). Ejecuta:

```typescript
await this.prisma.$transaction(async (tx) => {
  await this.routinesCleanup.eliminarDatosDe(userId, objetivo.role, tx);
  await tx.profesorAlumno.deleteMany({
    where: { OR: [{ profesorId: userId }, { alumnoId: userId }] },
  });
  await tx.user.delete({ where: { id: userId } });
});

try {
  await this.authProvider.deleteAuthUser(objetivo.authUserId);
} catch {
  // Reintento único.
  try {
    await this.authProvider.deleteAuthUser(objetivo.authUserId);
  } catch {
    return {
      advertencia: `No se pudo borrar auth.users (${objetivo.authUserId}) tras 2 intentos — huérfano inerte, ver HLD §6.`,
    };
    // Log ERROR con el authUserId, para el futuro proceso de reconciliación.
  }
}
```

El orden (Prisma primero, `auth.users` después) es deliberado: si algo falla en la transacción de Prisma, no se tocó nada; si falla `auth.users` después, el estado inconsistente es un huérfano _inerte_ (sin fila `User`, `JwtAuthGuard` lo rechaza siempre) — nunca un usuario fantasma que pueda loguearse.

HTTP: `GET /users/:id/deletion-impact` (ADMIN), `DELETE /users/:id/permanent` (ADMIN).

## 7. UI

**Profesor:**

- `/profesor` (dashboard): reemplaza el placeholder actual. Lista su cartera (`GET /users/me/alumnos`, ya existe de 3A) con acceso rápido a la rutina vigente de cada alumno.
- `/profesor/plantillas`: lista de plantillas propias + botón crear.
- `/profesor/plantillas/[id]`: editor — buscador de ejercicios reusando `ExerciseCard`/la lógica de búsqueda de `/catalogo`, lista de ejercicios agregados con **dnd-kit** para reordenar (arrastre + fallback de teclado nativo de la librería, MIT, sin dependencias — verificado antes de usar por la política de assets de terceros del HLD §1), series/reps/peso/descanso/notas por fila, botón desactivar/reactivar, botón eliminar definitivamente (solo habilitado si `activa: false`).
- `/profesor/alumnos/[id]`: rutina vigente del alumno (si tiene), selector de plantilla propia para asignar o botón "armar desde cero", edición de la instancia vigente.

**Alumno:**

- `/alumno`: rutina vigente con `ExerciseCard` por ejercicio (imagen central, click a detalle con GIF+pasos, mismo componente de 3A/Bloque 2), series/reps/peso/descanso visibles en la card o en el detalle. Estado vacío explícito de HU-08 si no hay rutina.

**Admin:**

- En `/admin`, sobre una fila ya inactiva: botón "Eliminar definitivamente" que abre un diálogo. Al abrirse, pega a `GET /users/:id/deletion-impact` y muestra los 4 números antes de habilitar el botón de confirmación (`window.confirm` con el resumen es insuficiente — la cascada de PROFESOR no es predecible de memoria, como señalaste).

## 8. Ejecución

**Un spec (este documento), dos planes:**

1. **Backend** (~11 tasks): migración de schema, `findByIds` en ExerciseCatalog, `RoutinesCleanupPort`+adapter (DIP), helper `resolveUserInGym` + refactor de 3A, los dos puertos de Routines + sus casos de uso, HTTP, hard-delete de usuarios.
2. **UI** (~9 tasks): route group `(catalogo)/`, dashboard de profesor, plantillas (lista+editor con dnd-kit), asignación a alumno, dashboard de alumno, diálogo de hard-delete en admin.

El plan de UI depende del de backend completo (consume sus endpoints) — se ejecutan en ese orden, no en paralelo.
