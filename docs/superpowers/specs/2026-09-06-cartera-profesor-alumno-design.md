# Bloque 3A — Cartera ProfesorAlumno (diseño)

**Fecha:** 2026-09-06
**Estado:** aprobado, pendiente de plan de implementación
**Alcance:** el modelo `ProfesorAlumno`, sus casos de uso, el alta automática de cartera al crear un alumno desde un PROFESOR, y la UI de gestión en `/admin`.
**Fuera de alcance:** todo `Routines` (plantillas, instancias, clonado, UI de profesor y de alumno) — eso es el Bloque 3B, que se apoya sobre lo que este bloque deja construido.

## 1. Por qué este bloque existe y por qué va primero

La cartera profesor↔alumno es una relación **muchos-a-muchos real**, confirmada con el profesor del gym (PRD §6 regla 9, HLD §3 Identity). Un alumno puede tener varios profesores a la vez; un profesor solo puede operar sobre las rutinas de los alumnos de su cartera, nunca sobre cualquier alumno del gym.

Esto no es un detalle de permisos que se pueda agregar después: es la condición de autorización de **todo** el bounded context `Routines`. Cada caso de uso de `RoutineInstance` (crear, leer, editar) valida contra `ProfesorAlumno` antes de tocar nada. Si 3B se escribiera contra un puerto de cartera que todavía no existe, ese chequeo quedaría mockeado en los tests y sin ejercitar contra la implementación real.

Por eso la cartera se construye, se testea y se cierra sola. 3B la consume como código existente.

## 2. Decisiones de diseño (con su razón)

| Decisión                                          | Elección                                       | Razón                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bounded context                                   | `identity`                                     | `ProfesorAlumno` es una relación entre dos `User`. `IdentityModule` ya exporta `USER_REPOSITORY`; sumar `CARTERA_REPOSITORY` mantiene la dirección de dependencias `routines → identity`, nunca al revés (HLD §2). Además permite crear `User` + `ProfesorAlumno` en una sola transacción de Prisma, dentro de un único repositorio.                                 |
| `RoutineInstance.profesorId`                      | Creador, inmutable, nunca usado para autorizar | La autorización sale 100% de la cartera vigente. `profesorId` queda como trazabilidad. Si el profesor original sale de la cartera, la instancia sigue siendo operable por los demás sin tocar la fila (HLD §3 Routines).                                                                                                                                             |
| Quitar de la cartera                              | `DELETE` físico de la fila                     | La cartera es estado operativo actual, no un hecho histórico. La trazabilidad de quién armó qué rutina ya vive en `RoutineInstance.profesorId`. La regla 3 del PRD (baja lógica siempre) habla de usuarios, no de relaciones. Un soft delete rompería el `@@unique(profesorId, alumnoId)` al reasignar al mismo profesor, obligando a un unique parcial de Postgres. |
| Rutina de un alumno cuando se quita a su profesor | Queda intacta; el alumno la sigue viendo       | Es un cambio administrativo, no debe dejar al alumno sin entrenamiento (HU-08, HU-03b). El profesor removido pierde acceso de lectura y edición inmediatamente. **Caso borde aceptado:** si el alumno queda con cero profesores, nadie puede editar su rutina hasta que el ADMIN le asigne uno, pero el alumno la sigue viendo.                                      |
| Desactivar un PROFESOR                            | No se tocan sus filas de cartera               | El profesor desactivado ya no puede loguearse (`verify-active-user` lo corta en el guard), así que la cartera queda inerte. Reactivarlo le devuelve sus alumnos sin reasignar nada. `DeactivateUserUseCase` no cambia. Explícito en HU-03.                                                                                                                           |
| Edición de la cartera desde la UI                 | Dentro del listado de usuarios de `/admin`     | Reusa la pantalla donde el ADMIN ya está, sin navegación nueva. Una vista matriz profesor×alumno es YAGNI para un gym con un puñado de usuarios.                                                                                                                                                                                                                     |

## 3. Modelo de datos

Se agrega a `apps/api/prisma/schema.prisma`:

```prisma
model ProfesorAlumno {
  id         String   @id @default(uuid())
  gymId      String
  profesorId String
  alumnoId   String
  asignadoEn DateTime @default(now())

  profesor User @relation("CarteraDelProfesor",  fields: [profesorId], references: [id])
  alumno   User @relation("ProfesoresDelAlumno", fields: [alumnoId],   references: [id])

  @@unique([profesorId, alumnoId])
  @@index([gymId])
  @@index([alumnoId])
}
```

y en `model User`:

```prisma
  alumnosAsignados    ProfesorAlumno[] @relation("CarteraDelProfesor")
  profesoresAsignados ProfesorAlumno[] @relation("ProfesoresDelAlumno")
```

Notas:

- `gymId` es redundante con el de los dos `User` (PRD regla 2: un usuario pertenece a un único gym), pero se guarda para poder scopear queries sin join — mismo criterio que el resto del schema.
- El `@@unique([profesorId, alumnoId])` es el que resuelve el chequeo del hot path de 3B (`¿este profesor atiende a este alumno?`). El `@@index([alumnoId])` resuelve la consulta inversa (`¿quién atiende a este alumno?`), que usa la UI de admin.
- Sin `onDelete: Cascade` en ninguna de las dos relaciones: los usuarios nunca se borran físicamente (PRD regla 3), así que la cascada sería código muerto que además ocultaría un borrado accidental.

Migración: una sola, aditiva, sin `DELETE` ni `DROP` — no toca datos existentes.

## 4. Backend

### 4.1 Puerto

`apps/api/src/identity/application/ports/cartera-repository.port.ts`

```ts
export const CARTERA_REPOSITORY = Symbol('CARTERA_REPOSITORY');

export interface CarteraLink {
  id: string;
  gymId: string;
  profesorId: string;
  alumnoId: string;
  asignadoEn: Date;
}

export interface CarteraRepositoryPort {
  /** El chequeo de autorización que consume todo el bounded context Routines (3B). */
  existe(profesorId: string, alumnoId: string): Promise<boolean>;
  crear(data: { gymId: string; profesorId: string; alumnoId: string }): Promise<CarteraLink>;
  eliminar(profesorId: string, alumnoId: string): Promise<void>;
  findAlumnosDeProfesor(profesorId: string): Promise<UserRecord[]>;
  findProfesoresDeAlumno(alumnoId: string): Promise<UserRecord[]>;
}
```

`IdentityModule` exporta `CARTERA_REPOSITORY` junto a `USER_REPOSITORY`. `existe()` es la única superficie que 3B necesita: todo el chequeo de cartera de Routines pasa por ese método.

Los dos `find*` devuelven `UserRecord[]` (el tipo que ya usa `UserRepositoryPort`) y **no filtran por `activo`** — devuelven todos los vinculados con su flag, y cada consumidor decide. La UI de admin muestra a todos; 3B, cuando liste alumnos asignables, filtra activos.

### 4.2 Casos de uso

En `apps/api/src/identity/application/cartera/`, un archivo por caso de uso:

| Caso de uso                       | Rol      | Validaciones                                                                                                                                                 |
| --------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AssignProfesorToAlumnoUseCase`   | ADMIN    | ambos usuarios existen; ambos del gym del invocador; el `profesorId` tiene rol PROFESOR; el `alumnoId` tiene rol ALUMNO; ambos activos; el vínculo no existe |
| `RemoveProfesorFromAlumnoUseCase` | ADMIN    | el vínculo existe y ambos usuarios son del gym del invocador. **No valida `activo`** — ver abajo                                                             |
| `ListCarteraUseCase`              | PROFESOR | devuelve los alumnos del profesor autenticado                                                                                                                |
| `ListProfesoresDeAlumnoUseCase`   | ADMIN    | el alumno existe y es del gym del invocador                                                                                                                  |

Dos casos de uso de lectura separados, en vez de uno con `profesorId` opcional: así ninguno tiene adentro una rama de autorización que dependa del rol del invocador. `ListCarteraUseCase` siempre usa `invocadoPor.id`, sin aceptar un `profesorId` del cliente.

La validación de rol del invocador vive en el `@Roles()` del endpoint **y** en el caso de uso, mismo criterio que `CreateUserUseCase` (HLD §3 Routines: "el chequeo va en el caso de uso, nunca solo en el guard de rol").

**El chequeo de usuario activo aplica solo a asignar, nunca a quitar.** `AssignProfesorToAlumnoUseCase` rechaza con `InactiveUserError` si el profesor o el alumno están desactivados: asignar es crear un vínculo operativo a futuro, y no tiene sentido crearlo hacia alguien que no puede operar ni entrar. `RemoveProfesorFromAlumnoUseCase` **no mira `activo` en ningún momento** y funciona igual sobre usuarios desactivados: quitar una cartera es limpieza administrativa del ADMIN sobre sus propios datos, no "operar en nombre de" el usuario inactivo. Bloquearlo dejaría filas de cartera imborrables cada vez que se desactiva a alguien — justo el estado que HU-03 evita al no tocar la cartera en la baja lógica.

Esta asimetría es intencional y tiene un test propio: quitar de la cartera un profesor desactivado devuelve 204, no 409.

### 4.3 Errores

Todos extienden `DomainError` de `shared-kernel` — el `DomainExceptionFilter` global los captura sin modificaciones.

| Error                           | HTTP | Cuándo                                                                                                                                               |
| ------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CarteraLinkAlreadyExistsError` | 409  | Ya existe el vínculo. Explícito, no idempotente: coherente con `DuplicateUsernameError`, y le permite a la UI decir "ese profesor ya está asignado". |
| `CarteraLinkNotFoundError`      | 404  | Se intenta quitar un vínculo que no existe                                                                                                           |
| `InvalidCarteraRoleError`       | 400  | El `profesorId` no tiene rol PROFESOR, o el `alumnoId` no tiene rol ALUMNO                                                                           |
| `InactiveUserError`             | 409  | Se intenta **asignar** un profesor o un alumno desactivado. Solo en `Assign` — `Remove` nunca lo tira                                                |

Se reusa `UserNotFoundError` (404) para usuarios inexistentes **y** para usuarios de otro gym, nunca un 403. No es una decisión local de este bloque: es la convención de autorización de todo el sistema, documentada en **HLD §4** ("Convención de respuesta ante acceso denegado"), que 3B y cualquier bounded context posterior tienen que seguir igual.

### 4.4 Alta de alumno con cartera automática

Cuando un PROFESOR da de alta un ALUMNO, hay que crear `User` + `ProfesorAlumno` **atómicamente** (HU-02, regla 9).

`CreateUserUseCase.crearAlumno()` ya arrastra una compensación best-effort (borra el usuario de Supabase Auth si falla el insert). Sumar un segundo insert no transaccional agregaría una segunda ventana de inconsistencia: un alumno creado sin su fila de cartera queda invisible para el profesor que acaba de darlo de alta, sin ningún error visible.

`UserRepositoryPort.create()` gana un segundo parámetro opcional:

```ts
create(
  data: { gymId: string; authUserId: string; username: string; nombre: string; role: Role },
  vinculoCartera?: { profesorId: string },
): Promise<UserRecord>;
```

`PrismaUserRepository` lo resuelve con `prisma.$transaction([user.create, profesorAlumno.create])`. Cuando el parámetro va `undefined` (alta por ADMIN, o alta de un PROFESOR) el comportamiento es idéntico al actual.

Razón de que viva en el puerto de `User` y no en el de cartera: "dar de alta un alumno en la cartera del profesor" es **una** operación de negocio, no dos, y quien crea el `User` es el repositorio de usuarios. La alternativa purista (unit-of-work explícita entre dos repositorios) es sobre-ingeniería para el MVP.

`CreateUserUseCase.crearAlumno()` pasa `{ profesorId: invocadoPor.id }` solo si `invocadoPor.role === Role.PROFESOR`.

### 4.5 HTTP

Controller nuevo `apps/api/src/identity/infrastructure/http/cartera.controller.ts` con `@Controller('users')` — no se suman cuatro endpoints más a `UsersController`, que ya tiene cinco. Dos controllers con el mismo prefijo es válido en Nest y deja cada archivo con una responsabilidad.

| Método | Ruta                                      | Rol      | Body                     |
| ------ | ----------------------------------------- | -------- | ------------------------ |
| POST   | `/users/:alumnoId/profesores`             | ADMIN    | `{ profesorId: string }` |
| DELETE | `/users/:alumnoId/profesores/:profesorId` | ADMIN    | —                        |
| GET    | `/users/:alumnoId/profesores`             | ADMIN    | —                        |
| GET    | `/users/me/alumnos`                       | PROFESOR | —                        |

`GET /users/me/alumnos` no colisiona con el `@Get('me')` existente de `UsersController` (distinto número de segmentos) ni con `@Get(':alumnoId/profesores')` (distinto segundo segmento).

El `GymScopeGuard` global ya rechaza un `gymId` explícito ajeno, pero acá no hay ninguno en la request: el scoping real lo hace cada caso de uso comparando el `gymId` de los usuarios resueltos contra `invocadoPor.gymId`.

## 5. UI de admin

### 5.1 Panel de cartera

`apps/web/app/(admin)/admin/users-list.tsx`: cada fila (tabla en `md:`) y cada tarjeta (mobile) de un usuario con rol ALUMNO gana un botón **Profesores** que despliega un panel inline:

- lista de profesores asignados, cada uno con una X para quitarlo
- un `<select>` con los profesores del gym que todavía no están asignados, más un botón **Asignar**
- estado vacío: "Sin profesores asignados"
- estado de error inline, con los tokens de color del sistema (`text-danger`)

En mobile el panel se despliega debajo de la tarjeta del alumno. **Desviación aceptada tras inspección visual (Tarea 8):** en `md:` en adelante, el panel quedó implementado dentro de la celda de la nueva columna "Cartera" de la tabla, no en una fila expandida separada como se planteaba acá originalmente. La revisión final whole-branch marcó esto como hallazgo a resolver visualmente antes del cierre; verificado en pantalla ancha real, el panel entra cómodo en la celda sin romper el ancho de las columnas vecinas ni verse apretado — se documenta como la implementación definitiva, sin fix de layout pendiente.

El panel carga los profesores asignados **on-demand al abrirse**, desde el cliente con `browserApiFetch('/users/:alumnoId/profesores')`. Así `GET /users` no cambia de contrato y no se hacen N+1 fetches al renderizar el listado completo. La lista de profesores del gym para el `<select>` sale de los datos que `/admin` ya tiene (filtra `role === 'PROFESOR'`), sin request extra.

Asignar y quitar van por Server Actions nuevas en `apps/web/app/(admin)/admin/actions.ts` (`assignProfesorAction`, `removeProfesorAction`), ambas con `revalidatePath('/admin')` — mismo patrón que `deactivateUserAction`.

### 5.2 Migración de `/admin` a los tokens

`/admin` es anterior al sistema de tokens del Bloque 2 y tiene colores hardcodeados: `bg-neutral-50`, `bg-white`, `text-neutral-900`, `text-red-600`, `border-red-200`, `bg-green-100`. Como se está tocando esa pantalla, se migra a los tokens existentes (`bg-surface`, `bg-surface-alt`, `text-text`, `text-text-muted`, `border-border`, `text-danger`) y queda con soporte de tema claro/oscuro como el resto de la app.

No se inventan tokens nuevos salvo uno: los badges de estado activo/inactivo necesitan un color de éxito, que el sistema no tiene. Se agrega `--color-success` a `apps/web/app/tokens.css` (claro y oscuro) y a `tailwind.config.ts`, con exactamente la misma forma que `--color-danger`.

## 6. Testing

1. **Unit tests de los cuatro casos de uso**, con repositorios fake en memoria — patrón de `list-users.use-case.spec.ts`. Cubren cada validación de la tabla de §4.2, incluyendo los cuatro errores de §4.3, el caso cross-gym (que devuelve `UserNotFoundError`, no un 403) y la asimetría de §4.2: asignar un usuario desactivado tira `InactiveUserError`, quitarlo funciona normalmente.

2. **Unit tests del `CreateUserUseCase` modificado**: alta de alumno por PROFESOR → existe la fila de cartera con `profesorId = invocadoPor.id`; alta de alumno por ADMIN → no existe ninguna fila; alta de profesor por ADMIN → no existe ninguna fila.

3. **E2E del `CarteraController`** con `TestingModule`, registrando el `ValidationPipe` global con la misma configuración que `main.ts` (`whitelist`, `forbidNonWhitelisted`, `transform: true`). Sin eso los DTOs no se transforman y los tests fallan por una razón que no es la que están probando — pasó en el Bloque 2, Task 6.

4. **Test de integración del flujo del proxy (401 → refresh → retry).** El panel de cartera es el primer consumidor real de `browser-api-client` + `app/api/proxy/[...path]/route.ts`, que es exactamente la condición que el HLD §6 dejó anotada como deuda técnica ("agregar test de integración del flujo completo cuando aparezca el primer uso real, no antes"). Cubre:
   - request con access token válido → 200 passthrough;
   - upstream 401 → el Route Handler dispara el refresh, reintenta y devuelve la respuesta del segundo intento, **con la query string preservada en ambos intentos** (regresión del bug encontrado en el Bloque 2, Task 9);
   - el refresh también falla → 401 al cliente, que redirige a `/login?sessionExpired=1`.

   Con este test la deuda queda saldada y se marca como tal en el HLD §6.

5. **Verificación manual contra Supabase real**, con la disciplina del Bloque 2: se usa un usuario existente del gym real, **no** se crean usuarios de prueba ad-hoc; si hiciera falta crear alguno, se borra al terminar (fila `User` + usuario de `auth.users`, en ese orden inverso, para no dejar huérfanos).

6. **Inspección visual mobile-first** de `/admin` con el panel abierto, en viewport de celular real, antes de dar el bloque por cerrado — incluyendo el toggle claro/oscuro sobre la pantalla recién migrada a tokens.

## 7. Documentación

`docs/prd-mvp.md` y `docs/hld-mvp.md` ya fueron sincronizados con la versión de referencia como parte de este diseño (cartera M:N, HU-03b, regla 9, `ProfesorAlumno` en el bounded context Identity). Durante ese merge se corrigieron: tres citas de reglas desfasadas en el PRD, restos de "Free Exercise DB" en el HLD §7/§8, y el bloque `Exercise` del HLD §3, que listaba un campo `categoria` eliminado por la migración del Bloque 2.

Se agregó además al **HLD §4** la _"Convención de respuesta ante acceso denegado"_: 404 indistinguible para recursos de otro gym o inexistentes, 403 para recursos del propio gym vedados por una relación que el usuario legítimamente conoce (la cartera), 403 para rol insuficiente. Vive en el HLD y no acá porque es una regla de todo el sistema, no de este bloque — 3B tiene que aplicarla igual en `Routines`.

Queda un solo cambio de docs para el final de la implementación: marcar como saldada la deuda del proxy BFF en el HLD §6, una vez que el test de §6.4 esté verde.

## 8. Handoff a 3B

Al cerrar este bloque, 3B encuentra construido:

- `CARTERA_REPOSITORY` exportado por `IdentityModule`, con `existe(profesorId, alumnoId): Promise<boolean>` — el único método que necesita para autorizar.
- El error base `DomainError` y el filtro global, listos para los errores propios de Routines.
- La cartera poblada de verdad: los alumnos dados de alta por un profesor ya tienen su vínculo.

3B queda con dos temas abiertos que este bloque deliberadamente no toca:

- **Guard de rol PROFESOR en `(profesor)/layout.tsx`.** Hoy `/catalogo` y `/catalogo/[id]` viven bajo ese route group y son legibles por los tres roles a propósito — el alumno los necesita para el detalle de ejercicio de HU-09. Poner `@Roles(PROFESOR)` en ese layout lo rompería. 3B lo resuelve moviendo el catálogo fuera del group o dándole su propio layout.
- Todo el modelo de `Routines`: plantillas, instancias, clonado al asignar, el endpoint de rutina vigente del alumno, y las UIs de profesor y alumno.
