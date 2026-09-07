# App Gimnasio — HLD MVP

**Estado:** Fase 0 (scaffolding), Fase 1 (auth end-to-end), catálogo de ejercicios y cartera profesor↔alumno, implementados. En curso: Routines + hard-delete de usuarios/plantillas (Bloque 3B, cierra Fase 1).
**Alcance MVP:** un solo gimnasio (el de Fer), pensado para escalar a multi-gym sin reescritura del modelo de datos.

## 1. Decisiones tomadas

| Decisión                     | Elección                                                                                                                  | Motivo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend                     | Next.js (web responsive / PWA)                                                                                            | 1 codebase para 3 roles, deploy gratis en Vercel, instalable en el celu del alumno sin store                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Backend                      | NestJS (monolito modular)                                                                                                 | Ya es tu stack diario, capas domain/application/infra estrictas                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| DB + Auth + Storage          | Supabase (Postgres)                                                                                                       | Todo gratis y managed, Postgres real (exportable), Auth con roles, Storage para media                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ORM                          | Prisma                                                                                                                    | ACID estricto, tipado, migraciones                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Catálogo de ejercicios       | [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) (1.324 ejercicios, GIF+imagen, español) | Cumple el requisito de animación por ejercicio; gate de licencia documentado antes de Fase 3 (media © Gym Visual)                                                                                                                                                                                                                                                                                                                                                                                                       |
| Mensajería/eventos           | Ninguno por ahora                                                                                                         | Kafka/RabbitMQ es over-engineering para este scope. Se agrega si aparece un caso real de integración async (ej. notificaciones push)                                                                                                                                                                                                                                                                                                                                                                                    |
| UI/estilo visual             | Inspiración de referencia solamente, componentes propios (Tailwind)                                                       | Ver "Política de código/assets de terceros" abajo. Referencia concreta: mood de openGym (demo pública en `opengym.duarte-santos.ch`, mirable como screenshot, no como código) — tema claro/oscuro con paleta de acento configurable, set de íconos curado propio (no emojis ni ícono-pack genérico sin curar), cards de ejercicio con la demo animada como elemento central. Heatmap de actividad estilo GitHub y mapa muscular corporal son referencia de diseño para Fase 2 (tracking de progreso), no del MVP actual |
| Prioridad de diseño frontend | Mobile-first                                                                                                              | ~90% del uso esperado es desde el navegador del celular. Sigue siendo PWA responsive (sin Capacitor) — no cambia la arquitectura, sí prioriza breakpoints y tamaños táctiles pensados primero para pantalla chica                                                                                                                                                                                                                                                                                                       |

**Pushback registrado:** no vamos con microservicios ni arquitectura event-driven en el MVP. Monolito modular con bounded contexts bien separados — la extracción a servicios queda barata el día que haga falta, pero hoy es puro overhead operativo para un gym.

**Política de código/assets de terceros:** cualquier proyecto open-source usado como referencia (ej. openGym, en cualquiera de sus forks/versiones) es válido como inspiración visual o conceptual — mirar capturas de pantalla, paleta, composición general — pero **nunca como fuente de código a copiar o adaptar**. Ya nos cruzamos este tema dos veces: el catálogo de ejercicios (dataset con media de terceros) y ahora el estilo del frontend (openGym está bajo AGPL-3.0, viral para cualquier intento futuro de cobrar el servicio a otros gimnasios). Regla simple: se reconstruye desde cero con componentes propios, nunca se clona/pega código de un repo de terceros sin verificar la licencia primero.

## 2. Arquitectura general

Monolito modular NestJS con capas estrictas por bounded context:

```
apps/
  api/                        # NestJS
    src/
      identity/                # users, roles, auth, cartera profesor↔alumno
        domain/
        application/
        infrastructure/
      routines/                # plantillas e instancias de rutina
        domain/
        application/
        infrastructure/
      exercise-catalog/        # catálogo de ejercicios + media
        domain/
        application/
        infrastructure/
      shared-kernel/           # value objects comunes (GymId, UserId, DomainError)
  web/                         # Next.js
    app/
      (admin)/
      (profesor)/
      (alumno)/
```

- `domain/`: entidades, value objects, invariantes. Sin dependencias de framework.
- `application/`: casos de uso (services), puertos (interfaces de repos).
- `infrastructure/`: adaptadores Prisma, controllers, guards, Supabase client.

Cada bounded context expone su propio módulo NestJS; comunicación entre contextos vía interfaces de application layer, no acceso directo a repos ajenos. Dirección de dependencias permitida: `routines` → `identity`, nunca al revés.

## 3. Bounded contexts

### Identity

- `User` (id, gymId, username, authUserId, role: ADMIN | PROFESOR | ALUMNO, nombre, activo)
- **Sin email real en ningún lado** — decisión explícita: la app no manda ni pide mails. El alta es 100% en persona/manual (Admin o Profesor define username + password y se la entrega directamente).
- **Mapeo técnico a Supabase Auth:** Supabase Auth requiere nativamente email o teléfono como identificador, así que se genera un _email sintético_ interno, único por combinación gym+username para evitar colisión entre gyms (ej. `<username>+<gymId>@gym.internal`). Este valor **nunca se muestra ni se comunica al usuario** — vive exclusivamente en `identity/infrastructure/auth/`, encapsulado igual que el `service_role` key.
- **Login:** pasa por el backend, no directo del frontend contra Supabase. El frontend nunca conoce el patrón del email sintético. Error de login siempre genérico ("usuario o contraseña incorrectos"), sin distinguir "no existe" de "password incorrecta" (evita enumeración de usuarios).
- **Password diferenciada por rol (decisión explícita):**
  - ADMIN/PROFESOR: `{ gymId, username, password }` — password real, definida por quien los crea, login estándar.
  - ALUMNO: `{ gymId, username }` — **sin password real.** El backend deriva una password interna determinística (`HMAC-SHA256(AUTH_DERIVE_SECRET, gymId:username)`, secret propio en `.env`, nunca el mismo que el JWT secret de Supabase) y la usa contra Supabase Auth de forma transparente, tanto al crear la cuenta como en cada login. Nunca se persiste en texto plano ni se muestra a nadie.
  - **Riesgo aceptado explícitamente:** el username de alumno es legible (`nombre.apellido`), no un código aleatorio. Cualquiera que sepa el nombre de un alumno del gym puede entrar a ver su rutina — sin password real de por medio, el username ES el secreto. Fernando aceptó este riesgo por escrito porque el impacto es bajo (solo lectura de la rutina propia, sin datos sensibles). Mitigación mínima: rate-limit del endpoint de login (por IP y por username) para no dejar la puerta abierta a scraping masivo de todo el padrón de alumnos.
- `username` de ALUMNO autogenerado al crear la cuenta (`nombre.apellido`, slug; sufijo numérico incremental si colisiona dentro del gym). `username` de ADMIN/PROFESOR definido manualmente por quien lo crea.
- Auth vía Supabase Auth (JWT), guards de NestJS validan rol + gymId en cada request
- `username` único por gym (`@@unique([gymId, username])`), no global — dos gyms distintos pueden tener cada uno un "juan.perez"
- Un profesor/alumno pertenece a un único gym (`gymId` como tenant discriminator en toda entidad)
- **`ProfesorAlumno`** (id, gymId, profesorId, alumnoId, asignadoEn) — relación muchos-a-muchos, confirmada con el profesor real (ya no es asunción, ver PRD §6 regla 9). Constraint único sobre `(profesorId, alumnoId)`. Gestionada solo por ADMIN (HU-03b), salvo la fila automática que se crea cuando un PROFESOR da de alta a un alumno (queda en su propia cartera). Quitar un profesor de la cartera de un alumno borra solo esta fila de relación, nunca las `RoutineInstance` que ese profesor ya le haya asignado.
- **Eliminación definitiva de usuarios (hard-delete, PRD §6 regla 10, HU-03c):** además de la baja lógica (`activo: false`, comportamiento por defecto), ADMIN puede eliminar por completo a un profesor/alumno **ya inactivo** — gate obligatorio, no se permite hard-delete sobre un usuario activo. `identity` no puede depender de `routines` (§2, dirección de dependencias), así que la cascada de borrado se resuelve con inversión de dependencias: `identity/application/ports/routines-cleanup.port.ts` declara `RoutinesCleanupPort` (`contarImpacto`, `eliminarDatosDe`), y `routines/infrastructure/persistence/prisma-routines-cleanup.adapter.ts` lo implementa — la dirección de dependencias no se invierte, sigue siendo `routines → identity`. El método `eliminarDatosDe` recibe un `Prisma.TransactionClient` en su firma para que el borrado completo (routines → `ProfesorAlumno` → `User`) sea una única transacción; es una fuga deliberada de infraestructura en una interfaz de application, aceptada por el mismo criterio que la transacción de alta con cartera del Bloque 3A (no se construye un Unit of Work genérico para un solo caso de uso). Después de la transacción de Prisma, se borra el usuario en `auth.users` de Supabase vía Admin API con un reintento; si vuelve a fallar, la respuesta es igual `200` con un campo de advertencia (el `authUserId` huérfano) y un log `ERROR` — ver deuda técnica en §6. Nuevo caso de uso: `DeleteUserPermanentlyUseCase`, más `GetUserDeletionImpactUseCase` de solo lectura para el diálogo de impacto de HU-03c.

### ExerciseCatalog

- `Exercise` (id, externalId, gymId nullable, nombre, parteCuerpo, grupoMuscular, gruposMuscularesSecundarios[], equipamiento, imageUrl, gifUrl, instrucciones [es], pasos[], fuente: CATALOG | CUSTOM, licenciaMedia, atribucionMedia)
- **Dataset elegido: [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset)** (1.324 ejercicios, GIF animado + imagen estática, instrucciones nativas en español) — reemplaza la elección inicial de Free Exercise DB porque cumple el requisito funcional de animación por ejercicio (Free Exercise DB solo tiene imagen estática). Import script idempotente, corre a demanda (seed), nunca como parte de la migración automática. La media vive en un bucket público de Supabase Storage (`exercise-media`), subida por un script propio.
- `licenciaMedia` / `atribucionMedia`: la media del dataset es © Gym Visual, redistribución permitida pero **uso comercial requiere licencia propia** — campos existen para poder auditar/reemplazar selectivamente. Ver PRD §6 (regla 6) para el gate de Fase 3.
- `gymId: null` = ejercicio del catálogo global; `gymId` seteado = ejercicio custom subido por un profesor de ese gym (soporta el híbrido a futuro sin cambiar el modelo)
- Expuesto como `GET /exercises` (búsqueda + filtros por parteCuerpo/equipamiento + paginación) y `GET /exercises/:id` (detalle), legibles por cualquier rol autenticado — el catálogo es global y de solo lectura.
- `ExerciseRepositoryPort.findByIds(ids: string[])`: consumido por `Routines` para resolver `nombre`/`imageUrl`/`gifUrl` de todos los ejercicios de una rutina en un solo query, en vez de N+1 por ejercicio. `ExerciseCatalogModule` exporta `EXERCISE_REPOSITORY` para esto — dirección de dependencias `routines → exercise-catalog`, mismo patrón que `routines → identity`.

### Routines

Modelo **plantilla → clon al asignar** (decisión de producto, ver PRD §3): la plantilla es un punto de partida reusable; al asignarla se clona en una instancia propia del alumno, editable sin afectar la plantilla ni otras instancias.

- `RoutineTemplate` (id, gymId, profesorId, nombre, descripción, activa, createdAt)
- `RoutineTemplateExercise` (id, templateId, exerciseId, orden, series, repeticiones, peso nullable, descanso, notas)
- `RoutineInstance` (id, gymId, **profesorId nullable**, alumnoId, nombre, origenTemplateId nullable, vigenteDesde, vigenteHasta nullable, activa) — `origenTemplateId` nullable porque el profesor puede armar una instancia desde cero sin partir de plantilla. `profesorId` pasa a nullable (`onDelete: SetNull`) por la cascada de hard-delete de PROFESOR: la instancia puede sobrevivir a la eliminación de quien la creó, si el alumno tiene otro profesor vigente en cartera.
- `RoutineInstanceExercise` (id, instanceId, exerciseId, orden, series, repeticiones, peso nullable, descanso, notas)
- **`peso` (decimal `@db.Decimal(5,2)`, nullable, kg):** peso _prescripto_ por el profesor al armar la rutina — no confundir con tracking de peso real ejecutado (eso es Fase 2, "progreso del alumno"). Nullable porque hay ejercicios de peso corporal (plancha, fondos, dominadas) donde no aplica. `Decimal(5,2)` permite carga fraccionada (2.5kg de disco) hasta 999.99kg. Un solo valor por línea de ejercicio en el MVP — no hay soporte para peso distinto por serie (drop sets); si hace falta, el profesor lo anota en `notas`.
- Al asignar: `RoutineTemplateExercise[]` se clona 1:1 en `RoutineInstanceExercise[]` de la nueva `RoutineInstance`, incluyendo `peso`. A partir de ahí son independientes — editar la plantilla NO propaga a instancias ya asignadas, y editar una instancia NO afecta a otros alumnos.
- **Asunción MVP:** un alumno tiene una única `RoutineInstance` vigente (`activa: true`) a la vez. Al asignar una nueva, la anterior pasa a histórica (`activa: false`, `vigenteHasta` = ahora) dentro de la misma transacción que crea la nueva. Ver PRD para reglas de negocio completas.
- **`RoutineInstance.profesorId` es el creador, y es inmutable mientras el creador exista.** No se usa nunca para autorizar: la autorización sale exclusivamente de la cartera vigente. Queda como dato de trazabilidad (quién armó originalmente esa rutina); pasa a `null` únicamente por la cascada de hard-delete descripta abajo, nunca por una operación normal.
- **Autorización por cartera (crítico, confirmado con el profesor real):** un PROFESOR solo puede crear una `RoutineInstance` para un alumno si existe una fila `ProfesorAlumno(profesorId, alumnoId)` — nunca solo por compartir `gymId`. Mismo chequeo para leer/editar una `RoutineInstance` ya existente: se valida contra la cartera actual, no contra quién la creó originalmente (si el alumno tiene 2 profesores, ambos pueden editar la misma instancia). `RoutineTemplate` no tiene este chequeo — es propiedad exclusiva del profesor que la creó, cartera aparte. Este chequeo de cartera va en el caso de uso, igual que la jerarquía de roles en `CreateUserUseCase` — nunca solo en el guard de rol.
- **Dos puertos separados, no uno:** `RoutineTemplateRepositoryPort` (sin chequeo de cartera, todo filtra por `profesorId = invocadoPor.id`) y `RoutineInstanceRepositoryPort` (todo pasa por `CarteraRepositoryPort.existe()` del Bloque 3A). Un puerto único con un flag de "¿aplica cartera?" ocultaría en runtime una diferencia que debe ser imposible de saltear en tiempo de compilación.
- **Edición de ejercicios: replace-all transaccional.** `PUT /routine-templates/:id/exercises` y `PUT /routine-instances/:id/exercises` reciben el array completo en el orden deseado; el caso de uso borra y reinserta dentro de una `$transaction`. Motivo: el `@@unique([templateId, orden])` / `@@unique([instanceId, orden])` haría que un reorden con operaciones granulares chocara contra el índice único a mitad de camino. **Máximo 50 ejercicios por plantilla/instancia**, validado en el DTO — acota el tamaño de la transacción de borrado+reinserción.
- **Hard-delete de plantillas (PRD §6 regla 11, HU-07):** el profesor dueño puede borrar definitivamente una plantilla propia, pero solo si ya está `activa: false` — mismo gate que el hard-delete de usuarios (§Identity): la baja lógica es siempre el flujo por defecto, el borrado físico la excepción irreversible. `origenTemplateId` en `RoutineInstance` es `onDelete: SetNull` por esto — pero la razón real de esa FK nullable es la cascada de hard-delete de PROFESOR de abajo, no este endpoint (aunque el endpoint no existiera, la cascada de profesor la seguiría necesitando).
- **Cascada de hard-delete (PRD §6 regla 10, HU-03c), implementada del lado de `RoutinesCleanupPort` (ver §Identity):**
  - Eliminar un ALUMNO: borra `RoutineInstanceExercise` → `RoutineInstance` → filas de `ProfesorAlumno` donde es alumno.
  - Eliminar un PROFESOR: borra sus `RoutineTemplateExercise` → `RoutineTemplate` (exclusivas, sin excepción) → filas de `ProfesorAlumno` donde es profesor. Para cada `RoutineInstance` que creó: si el alumno de esa instancia **todavía tiene otro profesor vigente en su cartera** (excluyendo al que se está eliminando), la instancia se conserva con `profesorId = null`; si no le queda ningún otro profesor, se borra igual que en el caso de alumno (`RoutineInstanceExercise` → `RoutineInstance`). Este chequeo se resuelve **antes** de la transacción de borrado (leer cartera restante del alumno excluyendo al profesor a eliminar), no con un trigger de DB.
- **Endpoints:** `POST/GET /routine-templates`, `GET/PATCH/DELETE /routine-templates/:id`, `PUT /routine-templates/:id/exercises` (PROFESOR, sin cartera); `POST /routine-instances`, `GET/PATCH /routine-instances/:id`, `PUT /routine-instances/:id/exercises`, `GET /users/:alumnoId/rutina-vigente` (PROFESOR, con cartera); `GET /users/me/rutina-vigente` (ALUMNO) — resuelve los ejercicios contra `ExerciseRepositoryPort.findByIds`, nunca expone solo el `exerciseId`.

**Convención de hard-delete (vale para todos los bounded contexts, no solo Identity/Routines):** todo borrado físico exige que el recurso esté previamente inactivo (`activo: false` / `activa: false`) — la baja lógica es siempre el flujo por defecto y el punto de arrepentimiento; el hard-delete es la excepción irreversible, nunca el camino directo desde el estado activo.

## 4. Roles y autorización

| Rol      | Puede                                                                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADMIN    | CRUD de profesores/alumnos del gym, gestión de cartera (`ProfesorAlumno`), ver todo, futura config multi-gym                                                               |
| PROFESOR | CRUD de plantillas propias, asignar/ajustar rutinas solo de los alumnos de su cartera (nunca de otro alumno del mismo gym sin asignación explícita), ver progreso (fase 2) |
| ALUMNO   | Ver su rutina vigente, ver detalle de cada ejercicio (imagen + GIF animado)                                                                                                |

Scoping por `gymId` en cada query de repo — nunca confiar en el filtro del frontend. En `Routines`, el scoping por `gymId` no alcanza: hace falta además el chequeo de cartera contra `ProfesorAlumno`.

**Convención de respuesta ante acceso denegado (vale para todos los bounded contexts, no solo Identity):**

- **Recurso de otro gym, o inexistente → `404`, indistinguibles entre sí.** Nunca `403`. Un `403` sobre un recurso de otro gym confirma que ese recurso existe, y eso permite enumerar usuarios, rutinas o cualquier otro identificador ajeno probando IDs. Es el mismo criterio que el error genérico de login ("usuario o contraseña incorrectos", sin distinguir "no existe" de "password incorrecta"). En la práctica: si el `gymId` del recurso no coincide con el del usuario autenticado, el caso de uso tira el mismo error de "no encontrado" que si el ID no existiera.
- **Recurso del propio gym al que el usuario no tiene acceso por una relación que legítimamente puede conocer → `403`.** El caso concreto es la cartera: un PROFESOR que intenta operar sobre un alumno de su mismo gym que no está en su cartera recibe `403`, no `404` (PRD HU-05). No hay filtración: ese profesor ya sabe que el alumno existe, comparten gym.
- **Rol insuficiente para la operación → `403`**, resuelto por `RolesGuard` antes de llegar al caso de uso.

La regla se implementa en los casos de uso, no en los guards: el guard no sabe a qué gym pertenece el recurso que se está pidiendo.

## 5. Stack técnico

- **Frontend:** Next.js 14+ (App Router), Tailwind, componentes por rol en route groups `(admin)`, `(profesor)`, `(alumno)`
- **Backend:** NestJS + Prisma + class-validator + Passport (JWT de Supabase)
- **DB:** Supabase Postgres (free tier: 500MB, pausa por inactividad en free tier — a monitorear)
- **Storage:** Supabase Storage (bucket público `exercise-media` con la media del catálogo; media custom de profesores a futuro)
- **Auth:** Supabase Auth (username/password según rol — ver Identity; social login queda para después)
- **Deploy:** Vercel (frontend, gratis, sin trade-offs relevantes) + **Render Hobby** (API NestJS, gratis indefinido). Decisión cerrada en septiembre 2026: Railway dejó de ser gratis para uso 24/7 (ahora es trial de $5/30 días + $1/mes de crédito no acumulable, insuficiente para un backend corriendo continuamente). Render Hobby es gratis indefinido pero con dos trade-offs aceptados: (1) el servicio duerme tras 15 min sin tráfico y tarda ~1 min en despertar en el primer request — aceptable para el uso esperado (gym chico, consultas esporádicas), no para tráfico constante; (2) límite de 750 hs gratis/mes por workspace, que un solo servicio 24/7 consume casi entero — no deja margen para sumar otro servicio sin pagar. La Postgres gratis de Render (que expira a los 30 días) no aplica, la DB real es Supabase. Migrar a plan pago cuando haya multi-gym real (Fase 3).
  - **Mecánica de deploy dual-host desde un monorepo:** cada plataforma apunta a una subcarpeta del mismo repo vía "Root Directory" (`apps/web` en Vercel, `apps/api` en Render) — son builds y deploys completamente independientes, no comparten proceso ni entorno. Comunicación por HTTP normal (el frontend le pega a la URL pública del backend) — requiere configurar CORS en NestJS para aceptar el origen de Vercel. Variables de entorno configuradas por separado en cada plataforma, nunca compartidas automáticamente.
- **Repo:** monorepo simple con pnpm workspaces (no NX completo — es innecesario para 2 apps; si esto crece a multi-gym con más servicios, se migra a NX como en point-api)

## 6. Deuda técnica aceptada explícitamente

- **`apiFetch` (fetch server-side de Server Components) sin retry-on-401 propio.** El `middleware.ts` refresca proactivamente si faltan <5 min para expirar en cada navegación, y el proxy same-origin cubre el retry para fetches client-side — pero si una pestaña queda abierta sin navegar por más de 1h y dispara una Server Action, se puede colar un token vencido sin reintento, resultando en un redirect a `/login` en vez de una renovación transparente. Caso borde de baja frecuencia, aceptado para MVP. Resolver si en la práctica resulta molesto.
- ~~**Proxy BFF (`app/api/proxy/[...path]/route.ts`) sin cobertura de test real.**~~ **Saldada en el Bloque 3A.** El panel de cartera de `/admin` es el primer consumidor real de `browser-api-client`, y `apps/web/app/api/proxy/[...path]/route.spec.ts` cubre passthrough 200, el ciclo 401→refresh→retry con la query string preservada en ambos intentos, y el caso donde el refresh también falla.
- **Huérfano en `auth.users` de Supabase si el hard-delete (Bloque 3B) falla después de que Prisma ya commiteó.** `DeleteUserPermanentlyUseCase` reintenta una vez el borrado en `auth.users`; si vuelve a fallar, la API responde igual `200` (el borrado de dominio ya ocurrió y es irreversible) con una advertencia explícita y un log `ERROR` con el `authUserId` huérfano. Se acepta porque el huérfano es inerte: sin fila `User` interna, `JwtAuthGuard` lo rechaza siempre, no hay brecha de seguridad. Falta un proceso de reconciliación/limpieza periódico (barrer `auth.users` contra la tabla `User` y borrar los que sobran) — sin fecha, no bloquea el MVP de un gym.

## 7. Roadmap por fases

**Fase 0 — Scaffolding**

- Monorepo pnpm workspaces, apps `api` + `web`
- Setup Supabase (proyecto, schema inicial, Auth)
- Prisma schema con las entidades core + seed de [exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset)

**Fase 1 — MVP funcional**

- Auth + roles funcionando end-to-end
- Admin: alta de profesores/alumnos, gestión de cartera
- Profesor: crear plantilla, asignar rutina a alumnos de su cartera, editar
- Alumno: ver rutina vigente con detalle de ejercicio (imagen + GIF animado; `imageUrl` sirve de fallback/ícono cuando no hay `gifUrl`)

**Fase 2 — Calidad de vida**

- Historial de rutinas, versionado
- Progreso del alumno (marcar ejercicio completado, series/reps reales vs planificadas)
- Media custom subida por el profesor (reemplaza catálogo genérico)

**Fase 3 — Multi-gym**

- Onboarding self-service de gyms nuevos
- Panel de super-admin (por encima de `ADMIN` de gym) para gestionar tenants
- Evaluar si en ese punto migra de Supabase free a un plan pago o a infra propia (AWS, alineado a tu stack)

## 8. Próximos pasos concretos

1. ~~Scaffolding del monorepo (pnpm workspaces + NestJS + Next.js)~~ — hecho (Fase 0)
2. ~~Proyecto Supabase + schema Prisma inicial~~ — hecho (Fase 0)
3. ~~Script de import del catálogo [exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) (idempotente, corre a demanda)~~ — hecho, 1.324 ejercicios + media en Storage
4. ~~Auth end-to-end con los 3 roles~~ — hecho (Fase 1)
5. ~~Cartera `ProfesorAlumno` (backend + UI de admin)~~ — hecho (Bloque 3A)
6. Routines: plantillas, instancias con chequeo de cartera, UI de profesor y de alumno — en curso (Bloque 3B)
7. Hard-delete de usuarios (HU-03c) y de plantillas (HU-07) — en curso (Bloque 3B, mismo ciclo que Routines por el cambio de schema compartido)
