# Editar usuarios + SUPER_ADMIN — Design

Complementa `docs/prd-mvp.md` y `docs/hld-mvp.md`. Cubre dos features relacionadas pero separables:

1. **Editar usuario**: ADMIN/PROFESOR pueden editar nombre y (cuando aplica) password de los usuarios que ya gestionan hoy.
2. **SUPER_ADMIN**: un rol nuevo, por encima del ADMIN de gym, que puede crear y editar cuentas ADMIN — hoy eso es imposible vía HTTP a propósito (`CreateUserUseCase` nunca permite crear ADMIN; el único camino es `prisma/seed-admin.ts`, corrido a mano).

## Alcance explícito

**Dentro de alcance:**

- `PATCH /users/:id` para que ADMIN edite PROFESOR/ALUMNO de su gym, y PROFESOR edite ALUMNO de su cartera (nombre; password solo si el target es PROFESOR).
- Rol `SUPER_ADMIN`, con su propio login y su propia API (`/super-admin/*`), para crear/editar cuentas ADMIN.
- Bootstrap del primer SUPER_ADMIN vía script one-off (mismo patrón que `seed-admin.ts`).

**Fuera de alcance (explícito):**

- El alumno editando su propio nombre — descartado, ese rol no gana ninguna capacidad de auto-edición en este diseño.
- Editar `username` de cualquier usuario desde estos flujos — permanece inmutable vía UI (el único camino sigue siendo un script manual dedicado, como `rename-admin-username.ts`).
- Tabla `Gym` / onboarding self-service de gimnasios / branding dinámico por gym — eso es la Fase 3 ya documentada en `docs/hld-mvp.md` §7. Este diseño resuelve solo "quién puede crear/editar un ADMIN", no "cómo se gestionan tenants".
- SUPER_ADMIN gestionando algo que no sea cuentas ADMIN (nunca toca `RoutineTemplate`, `RoutineInstance`, `ProfesorAlumno`, catálogo de ejercicios).

## Decisión de modelo: SUPER_ADMIN sin gymId

`User.gymId` pasa de `String` a `String?` (nullable). Es el único cambio de schema. Todo usuario con rol `ADMIN`, `PROFESOR` o `ALUMNO` sigue exigiendo un `gymId` real (validado en cada caso de uso — no hay constraint de DB que lo fuerce, igual que hoy). Solo las filas `SUPER_ADMIN` tienen `gymId: null`.

**No se crea una tabla `Gym`.** Cuando un SUPER_ADMIN crea un ADMIN nuevo, escribe el `gymId` a mano (string libre, sin catálogo ni validación contra una lista existente). Ese ADMIN, desde su alta, propaga ese mismo `gymId` a todo lo que cree después (profesores, alumnos, plantillas) — el mecanismo ya existente en `CreateUserUseCase`, sin cambios. En la práctica, esto funciona como un onboarding mínimo de gym nuevo sin construir el resto de la infraestructura multi-tenant de Fase 3. Riesgo aceptado: un typo en el `gymId` al crear un ADMIN genera un "gym fantasma" aislado, sin forma de detectarlo automáticamente — mitigación: el formulario de creación muestra los `gymId` ya existentes (de un `SELECT DISTINCT gymId FROM "User" WHERE role != 'SUPER_ADMIN'`) como sugerencia/autocomplete, pero permite escribir uno nuevo.

## Autenticación de SUPER_ADMIN

`buildSyntheticEmail(gymId, username)` (`apps/api/src/identity/infrastructure/auth/synthetic-credentials.ts`) necesita un `gymId` para armar el email sintético en Supabase Auth. Como `SUPER_ADMIN` no tiene uno real, se reserva una constante interna:

```typescript
const PLATFORM_PSEUDO_GYM_ID = '__platform__';
```

Se usa **exclusivamente** para construir/resolver el email sintético de cuentas `SUPER_ADMIN` (`buildSyntheticEmail(PLATFORM_PSEUDO_GYM_ID, username)`) — nunca se persiste como `gymId` real en la fila de `User` de ese SUPER_ADMIN, que sigue siendo `null`. Vive solo dentro de `synthetic-credentials.ts` y el proveedor de auth, igual de encapsulado que el resto de esa lógica.

Login separado, no el mismo flujo que un gym normal:

- `POST /auth/super-admin/login` — body `{ username, password }`, **sin** `gymId` (a diferencia de `POST /auth/login`, que sí lo pide). Arma el email con la constante reservada internamente.
- Reusa `SupabaseAdminAuthProvider.signInStaff` pasándole `PLATFORM_PSEUDO_GYM_ID` como su `gymId` — no hace falta un método nuevo en el provider, ya acepta `(gymId, username, password)`.
- El JWT resultante es indistinguible en estructura de cualquier otro — `JwtAuthGuard` sigue resolviendo por `sub` (authUserId) contra la tabla `User`, sin cambios. Solo cambia el tipo `AuthenticatedUser.gymId` de `string` a `string | null`.

`GymScopeGuard` no se toca: `SUPER_ADMIN` nunca pasa por él porque nunca llama a rutas gym-scoped (`/users`, `/routine-templates`, `/routine-instances`, cartera, catálogo). Opera exclusivamente sobre `/super-admin/*`, una superficie nueva y separada.

## Endpoints

### Editar usuario (ADMIN/PROFESOR sobre PROFESOR/ALUMNO)

`PATCH /users/:id`

- Body: `{ nombre?: string, password?: string }` — al menos uno de los dos presente (400 si el body llega vacío).
- Autorización (nuevo caso de uso `EditUserUseCase`, misma capa `identity/application`):
  - `ADMIN` puede editar `PROFESOR` o `ALUMNO` cuyo `gymId` coincida con el suyo (`GymScopeGuard` ya cubre el gymId del path si viniera en query/body, pero acá el chequeo real es contra el `gymId` del **target**, resuelto server-side desde `input.id` — no confiar en nada que mande el cliente).
  - `PROFESOR` puede editar solo `ALUMNO` que estén en su cartera (mismo repo/check que ya usa `AssignRoutineToAlumnoUseCase`: `carteraRepository.existe(profesorId, alumnoId)`).
  - Cualquier otro caso (editar un ADMIN, un SUPER_ADMIN, un usuario de otro gym, un alumno ajeno) → 403.
- Si `password` viene en el body y el target es `ALUMNO` → 400 explícito (`"Los alumnos no tienen contraseña"`), nunca un no-op silencioso ni un 500.
- Si `password` viene y el target es `PROFESOR` → se pisa directo vía `AuthProviderPort` (nuevo método `updateStaffPassword(authUserId, password)` en `SupabaseAdminAuthProvider`, wrapper de `admin.updateUserById`). No se pide la password actual.
- `nombre` se actualiza con un `MinLength(2)` igual al de creación.

### Gestión de ADMIN (SUPER_ADMIN)

Todos bajo un guard de rol nuevo y explícito (`@Roles(Role.SUPER_ADMIN)`), módulo separado (`super-admin/`), sin relación de herencia con `identity`'s `RolesGuard` actual más que reusar el enum `Role`.

- `POST /super-admin/admins` — body `{ gymId: string, username: string, nombre: string, password: string }`. Mismas validaciones de `CreateProfesorDto` (username regex `[a-z0-9._-]+`, min lengths) más `gymId` no vacío. Implementación: mismo patrón compensatorio que `seed-admin.ts`/`CreateUserUseCase` (si falla la fila Prisma tras crear en Supabase Auth, se borra el usuario de Auth).
- `GET /super-admin/admins` — devuelve todos los `User` con `role: ADMIN`, cualquier `gymId`. La UI los agrupa por `gymId`.
- `PATCH /super-admin/admins/:id` — mismo contrato y semántica que `PATCH /users/:id`, pero sin restricción de gym (SUPER_ADMIN edita cualquier ADMIN) y sin la restricción de "no se puede tocar un ADMIN" (esa restricción es específicamente lo que este endpoint existe para saltear, de forma controlada).

## Frontend

- `/super-admin/login` — igual a `/login` pero sin el `<input type="hidden" name="gymId">`. Server Action propia (`super-admin-login-action.ts`) que llama a `POST /auth/super-admin/login`.
- `/super-admin` — dashboard: formulario de alta de ADMIN (con datalist de `gymId` existentes) + listado de ADMIN agrupados por gym, cada uno con acción "Editar" (nombre/password) inline.
- `/admin`: `UsersList` gana un botón "Editar" por fila (excepto para ADMIN, que ya está bloqueado en backend — el botón ni se muestra para esas filas). Abre un formulario inline con nombre + password (password solo si `role === 'PROFESOR'`).
- `/profesor`: cada alumno de la cartera gana el mismo botón "Editar", acotado a nombre (sin campo password, porque el backend lo rechazaría igual).

## Testing

- `EditUserUseCase`: ADMIN edita PROFESOR/ALUMNO de su gym (ok); ADMIN intenta editar usuario de otro gym (403); PROFESOR edita ALUMNO de su cartera (ok); PROFESOR intenta editar ALUMNO ajeno (403); intento de setear `password` en un ALUMNO (400); intento de editar un ADMIN por esta vía (403).
- `POST /super-admin/admins`: crea ADMIN con gymId nuevo; ese ADMIN puede loguearse por `/auth/login` normal y crear PROFESOR/ALUMNO con ese mismo gymId; username duplicado en el mismo gymId → 409 con compensación en Supabase Auth verificada.
- `POST /auth/super-admin/login`: no acepta ni requiere `gymId` en el body; un `PROFESOR`/`ALUMNO`/`ADMIN` normal no puede loguearse por esta ruta (su email sintético no coincide con `PLATFORM_PSEUDO_GYM_ID`).
- Guard de rol: cualquier rol que no sea `SUPER_ADMIN` golpeando `/super-admin/*` → 403.
