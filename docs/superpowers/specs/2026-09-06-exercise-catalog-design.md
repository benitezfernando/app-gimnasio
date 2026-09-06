# Bloque 2: ExerciseCatalog expuesto — diseño

Fecha: 2026-09-06
Estado: aprobado por el usuario, pendiente de plan de implementación.

## Contexto y hallazgos previos al diseño

El pedido original asumía que el backend/seed de ExerciseCatalog ya existían con 1.324 ejercicios cargados. Verificado contra el repo y el Supabase real, eso no es así:

1. **La tabla `Exercise` tiene 2 filas**, no 1.324 — provienen de `seed-exercises.fixture.json` (fixture de prueba). `EXERCISES_DATASET_PATH` nunca se seteó, así que el seed real nunca corrió.
2. **El módulo `exercise-catalog` está vacío** — `application/`, `domain/`, `infrastructure/` solo tienen `.gitkeep`, el módulo Nest no tiene controllers ni providers.
3. **`imageUrl`/`gifUrl` son rutas relativas** (`images/3_4_Sit-Up/0.jpg`), no URLs servibles — no hay nada en Supabase Storage.
4. **`grupoMuscular`/`equipamiento` están en inglés**, sin validar contra el dataset real.
5. **La interfaz que asume `seed-exercises.ts` no es la del dataset real** (confirmado bajando `data/exercises.json` del repo `hasaneyldrm/exercises-dataset`, rama `main`, 1.324 items):
   - `instructions` es un objeto multi-idioma (`en/es/it/tr/ru/zh/hi/pl/ko/fr`), no un string plano. Español SÍ está disponible.
   - `instruction_steps` (objeto multi-idioma también) trae los pasos separados en un array — no existe en el seed actual.
   - `category` es idéntico a `body_part` (región del cuerpo: `upper arms`, `waist`, `back`...), NO una modalidad de entrenamiento — no mapea al enum `ExerciseCategory` (`STRENGTH/CARDIO/STRETCHING/PLYOMETRICS/OTHER`): con el enum actual, 1.295 de 1.324 ejercicios caerían en `OTHER`.
   - `id` es `"0001"` (string numérico), no un slug.
   - Media real vive en `images/<id>-<hash>.jpg` y `videos/<id>-<hash>.gif` — el repo del dataset trae los archivos físicos (1.324 + 1.324, ~125MB total el repo completo), no son URLs externas.
   - Cardinalidad real de los campos "musculares": `body_part` 10 valores limpios, `target` 19 valores, `muscle_group` 29 valores con sinónimos duplicados (`traps`/`trapezius`, `lats`/`latissimus dorsi`) — no sirve como filtro de UI sin normalizar.
   - `equipment`: 28 valores, larga cola (17 valores con ≤3 ejercicios).

Decisiones de alcance y taxonomía ya acordadas con el usuario (ver conversación):

- Bloque 2 se hace completo en un solo ciclo: arreglar el seed, migrar el schema, subir media a Supabase Storage, exponer los endpoints, definir el sistema de estilo y construir la UI del catálogo — no se parte en sub-bloques.
- El filtro/chip de grupo muscular usa `body_part` (10 valores), no `target` (19) ni `muscle_group` (29 sin normalizar).
- La media (imágenes + GIFs) se sube a un bucket de Supabase Storage — no se linkea a un CDN de terceros (jsDelivr sobre el repo del dataset), para no depender de que un repo de un tercero siga existiendo.
- No hay librería de íconos con set de anatomía/grupo muscular (verificado contra los 1.813 íconos de Lucide: solo `bone`/`bone-fracture`/`biceps-flexed`, nada usable). El grupo muscular se representa con chips de color por región, no con íconos. Lucide se usa para UI genérica y para los pocos íconos de equipamiento que sí existen (`dumbbell`, `weight`, `bike`).
- Tema: tokens CSS en un único archivo + toggle claro/oscuro (arranca en preferencia del sistema, persistido en localStorage). Sin selector de acento en runtime para el usuario final — el acento lo define el dueño del producto editando el archivo de tokens.
- El catálogo se trae client-side vía el proxy `/api/proxy/*` (usa `browserApiFetch`, construido en el bloque anterior de refresh de sesión y hoy sin consumidores) — no vía `searchParams` de Server Components. Motivo: en Bloque 3 este catálogo se embebe dentro del armador de rutinas, y ahí la búsqueda no puede depender de navegación de URL sin volar el estado del formulario en progreso.
- El GIF animado se muestra solo en el detalle del ejercicio, no en el grid del listado (evitar 24 GIFs animados simultáneos en mobile). El grid usa `imageUrl` (estática) con fallback a ícono genérico.
- Se elimina el enum `ExerciseCategory` y la columna `categoria` — es redundante con la nueva columna `parteCuerpo` y no se referencia en ningún lugar del código actual (confirmado por grep).
- Las 2 filas de fixture actuales se borran explícitamente antes de correr el seed real (su `externalId` no matchea el dataset real, así que un upsert no las pisa — quedarían huérfanas con media rota).

## 1. Modelo de datos (Prisma) y migración

Cambios al modelo `Exercise`:

```prisma
model Exercise {
  id                          String   @id @default(uuid())
  externalId                  String?  @unique   // dataset "id", ej. "0001"
  gymId                       String?
  nombre                      String
  parteCuerpo                 String             // NUEVO — ex "category"/body_part, 10 valores, filtra
  grupoMuscular               String             // ahora viene de "target" (19 valores), informativo
  gruposMuscularesSecundarios String[] @default([])
  equipamiento                String?            // filtra, 28 valores
  imageUrl                    String?            // URL pública de Supabase Storage
  gifUrl                      String?            // URL pública de Supabase Storage
  instrucciones               String?            // instructions.es
  pasos                       String[] @default([]) // NUEVO — instruction_steps.es
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

- Se elimina el campo `categoria` y el enum `ExerciseCategory` completo (no queda ningún uso en `apps/api/src` ni `apps/web`, verificado).
- `@@index([grupoMuscular])` existente se elimina (ya no es el campo de filtro); se agregan índices sobre `parteCuerpo` y `equipamiento`. A 1.324 filas Postgres hace seq scan y el planner probablemente ignora estos índices hoy — se agregan pensando en Fase 2 (ejercicios custom por gym), no por necesidad actual.
- Sin índice para `search` (full-text/trigram) — a este volumen sería sobre-ingeniería; un `ILIKE` sobre `nombre` sin índice es instantáneo con 1.324 filas.
- Migración generada vía el mismo flujo ya usado en fases anteriores (`prisma migrate diff` contra la DB real + carpeta de migración a mano, dado que `migrate dev` no tiene TTY interactivo en este entorno).
- **Antes de aplicar el seed real**: `DELETE FROM "Exercise"` (la tabla solo tiene las 2 filas de fixture, confirmado por conteo — se documenta el conteo antes y después como evidencia).

## 2. Media: script de subida a Supabase Storage

Nuevo script `apps/api/prisma/upload-exercise-media.ts` (mismo patrón que `seed-exercises.ts`: `tsx`, PrismaClient/cliente Supabase directo, sin bootstrap de Nest):

- Lee `EXERCISES_DATASET_PATH` (checkout local del repo `hasaneyldrm/exercises-dataset`) — igual que el seed existente, no descarga el dataset por su cuenta.
- Crea (si no existe) un bucket público `exercise-media` vía `supabase.storage.createBucket` (idempotente: si ya existe, continúa).
- Sube cada archivo de `images/` y `videos/` referenciado en `data/exercises.json` a `exercise-media/images/<filename>` / `exercise-media/videos/<filename>`, con `upsert: false` y skip explícito si ya existe (idempotente, no re-sube en corridas repetidas).
- No sube el dataset completo del repo, solo los archivos de media efectivamente referenciados por `exercises.json` (evita basura si el repo tiene archivos huérfanos).
- Al final imprime cuántos se subieron / cuántos se saltearon por ya existir / cuántos fallaron.
- El seed (`seed-exercises.ts`, reescrito, ver §3) construye `imageUrl`/`gifUrl` como la URL pública del bucket (`supabase.storage.from('exercise-media').getPublicUrl(...)`), asumiendo que este script ya corrió antes.
- Orden de ejecución: `upload-exercise-media` primero, `seed:exercises` (reescrito) después. Se documenta en el header del script y en el plan.

## 3. Reescritura de `seed-exercises.ts`

- Cambia la interfaz `DatasetExercise` para reflejar la forma real (`id`, `name`, `category`/`body_part`, `equipment`, `instructions: Record<string,string>`, `instruction_steps: Record<string,string[]>`, `muscle_group`, `secondary_muscles`, `target`, `image`, `gif_url`, `attribution`).
- Mapeo: `externalId = id`, `nombre = name`, `parteCuerpo = body_part`, `grupoMuscular = target`, `gruposMuscularesSecundarios = secondary_muscles`, `equipamiento = equipment`, `instrucciones = instructions.es`, `pasos = instruction_steps.es`.
- `atribucionMedia = attribution` (campo del dataset) — verificado que es un valor constante idéntico en las 1.324 filas (`"© Gym visual — https://gymvisual.com/"`), así que se usa el campo del dataset directo como fuente de verdad en vez de una constante hardcodeada aparte en el script (evita que las dos strings puedan divergir con el tiempo).
- `licenciaMedia` sigue siendo una constante propia del script (`"Gym Visual - uso comercial requiere licencia propia"`) — no existe un campo equivalente en el dataset, es una nota de compliance propia del proyecto, no un dato de la fuente.
- `imageUrl`/`gifUrl` se resuelven contra la URL pública de Supabase Storage (mismo nombre de archivo que subió `upload-exercise-media.ts`).
- Se elimina toda lógica de `categoriasNoReconocidas`/`contadorOther` (ya no aplica, no hay enum que mapear).
- El fixture `seed-exercises.fixture.json` se actualiza para reflejar la forma real del dataset (2-3 items de muestra), de forma que los tests que lo usen seguían siendo representativos.
- Se corre una sola vez contra el dataset real completo (1.324 ejercicios) como parte de la verificación de este bloque, con conteo antes/después como evidencia — mismo criterio de verificación explícita usado en fases anteriores.

## 4. Backend — módulo `exercise-catalog`

Estructura hexagonal, igual que `identity`:

```
exercise-catalog/
  domain/
    exercise.ts                      (tipo de dominio, sin dependencias de framework)
  application/
    ports/
      exercise-repository.port.ts
    list-exercises.use-case.ts
    get-exercise.use-case.ts
  infrastructure/
    persistence/
      prisma-exercise.repository.ts
    http/
      exercises.controller.ts
      dto/
        list-exercises.dto.ts
      exercise-summary.mapper.ts       (payload liviano de listado)
      exercise-detail.mapper.ts        (payload completo)
  exercise-catalog.module.ts
```

**`ExerciseRepositoryPort`:**

```typescript
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
export interface ExerciseRepositoryPort {
  findMany(filter: ListExercisesFilter): Promise<{ items: ExerciseSummary[]; total: number }>;
  findById(id: string): Promise<ExerciseDetail | null>;
}
```

**`GET /exercises`**

- Query DTO con `class-validator`: `search?` (string, opcional), `parteCuerpo?`, `equipamiento?`, `page` (int, default 1, min 1), `limit` (int, default 24, min 1, max 60).
- Sin `@Roles()` en el handler. Verificado en `RolesGuard`: si no hay metadata de roles en la ruta, el guard devuelve `true` sin restricción — es el mismo patrón ya usado por `GET /users/me` (autenticado, cualquier rol). No se agrega un `@Roles(ADMIN, PROFESOR, ALUMNO)` redundante: `JwtAuthGuard` global ya exige autenticación, y listar los 3 roles explícitos solo agregaría un punto que actualizar si el día de mañana aparece un 4º rol.
- Response: `{ items: ExerciseSummary[], page, limit, total, totalPages }`.
- Sin scoping por `gymId` (catálogo global, `gymId: null` en MVP) — a diferencia de `identity`, acá NO se filtra por el gym del invocador; se documenta explícitamente en el use case que esto es intencional y cambia en Fase 2.

**`GET /exercises/:id`**

- Mismo criterio de roles (sin `@Roles()`).
- 404 (`ExerciseNotFoundError`) si no existe.
- Response: `ExerciseDetail` completo.

**Errores y su filtro — decisión de ubicación:** `DomainExceptionFilter` ya está registrado como filtro GLOBAL en `main.ts` (no es un filtro por-módulo), pero físicamente vive en `identity/infrastructure/filters/` e importa cada clase de error concreta de `identity/application/errors/*` en su `@Catch(...)`. Agregarle `ExerciseNotFoundError` ahí tal cual acoplaría `exercise-catalog` a un archivo que vive dentro de `identity` — cruce de módulos que ensucia el que ya es, por diseño, un filtro de app entera.

Se resuelve con un desacoplamiento mínimo, justificado porque este bloque es lo que efectivamente introduce el segundo consumidor del filtro:

- Nuevo `shared-kernel/domain/domain-error.ts`: `export abstract class DomainError extends Error { abstract readonly httpStatus: number; }` — sin importar nada de `@nestjs/common` (el dominio no depende de framework, regla ya establecida en el proyecto; `httpStatus` es un `number` plano, no el enum `HttpStatus`).
- Los 5 errores existentes de `identity/application/errors/*` pasan a extender `DomainError` y declarar su propio `httpStatus` (409/403/403/401/404 respectivamente, los mismos valores que hoy están hardcodeados en el `Map` del filtro).
- `ExerciseNotFoundError` (nuevo, en `exercise-catalog/application/errors/exercise-not-found.error.ts`) extiende `DomainError` con `httpStatus = 404`.
- `DomainExceptionFilter` se relocaliza a `shared-kernel/infrastructure/filters/domain-exception.filter.ts`, cambia a `@Catch(DomainError)` (una sola clase base, no una lista creciente de imports concretos) y lee `exception.httpStatus` directamente — cualquier módulo futuro que agregue un error de dominio queda cubierto sin tocar el filtro. `main.ts` actualiza el import.
- Es un cambio mecánico y acotado (6 archivos: la clase base + 5 errores existentes + el filtro relocalizado + `main.ts`), justificado porque sin él el nuevo módulo no tiene una forma limpia de enchufarse al mecanismo de mapeo de errores ya existente — no es refactor no relacionado, es lo que este bloque necesita para no empeorar un acoplamiento ya señalado en el review de la fase anterior.

## 5. Frontend — sistema de estilo

**`app/tokens.css`** (nuevo, importado desde `globals.css`):

- Variables CSS para superficie/texto/borde/acento en `:root` (claro) y `.dark` (oscuro) — estrategia `darkMode: 'class'` en `tailwind.config.ts`.
- 10 variables de color, una por `body_part`, para los chips de región (ej. `--color-region-chest`, `--color-region-back`, etc.) — paleta elegida por contraste/distinción, no aleatoria.
- Cambiar el acento de toda la app = editar las variables de acento en este archivo único.

**Toggle claro/oscuro:**

- Hook/componente cliente que lee `prefers-color-scheme` al montar si no hay preferencia guardada, aplica/quita la clase `dark` en `<html>`, persiste la elección en `localStorage`. Sin flash de tema incorrecto: un script inline mínimo en el `<head>` (antes de hidratar React) aplica la clase guardada, patrón estándar de Next.js para esto.

**Librería de íconos:** `lucide-react`, agregada como dependencia de `apps/web`. Usada para: buscador (lupa), limpiar filtro (x), paginación (chevrons), estados vacíos, y los pocos íconos de equipamiento con match real (`dumbbell`, `weight`/`kettlebell` aproximado, `bike`) — el resto de equipamiento sin ícono específico usa un ícono genérico consistente (ej. un ícono de "más" o mancuerna genérica), nunca mezclando con otro estilo de librería.

## 6. Frontend — componentes y pantalla

**`ExerciseCard`** (componente reusable, se lo lleva Bloque 3 sin cambios):

- Imagen (`imageUrl`) como elemento visual dominante de la card (aspect ratio fijo, `object-cover`).
- Fallback: si `imageUrl` es null, ícono genérico de Lucide centrado sobre fondo neutro — nunca `<img>` roto.
- Chip de color de `parteCuerpo` superpuesto o debajo de la imagen.
- Nombre del ejercicio, equipamiento como texto secundario.
- Sin GIF acá — el GIF es exclusivo del detalle.

**Pantalla `(profesor)/catalogo`** (`page.tsx`, Client Component):

- Buscador de texto con debounce (~300ms) contra `search`.
- Chips de `parteCuerpo` (10, scroll horizontal en mobile) — selección única o "todos".
- Select de `equipamiento` (28 valores no entran como chips).
- Grid responsive: 1 columna mobile, 2-3 en tablet/desktop (mobile-first, breakpoints `sm:`/`md:`/`lg:`).
- Paginación tipo "cargar más" (botón al pie, acumula resultados) en vez de números de página — más natural en mobile y compatible con scroll infinito futuro.
- Fetch vía `browserApiFetch('/exercises?...')` (del proxy `app/api/proxy/[...path]/route.ts` ya existente).
- Estados: cargando (skeleton de cards), vacío (sin resultados con el filtro actual), error (mensaje + reintentar).

**Pantalla `(profesor)/catalogo/[id]`** (detalle):

- GIF animado como elemento principal si existe; si no, `imageUrl`; si no, ícono de fallback.
- `parteCuerpo`, `grupoMuscular`, `gruposMuscularesSecundarios`, `equipamiento`.
- `pasos` como lista numerada (mejor que el párrafo plano de `instrucciones`, que se muestra igual como fallback si `pasos` está vacío).
- **Atribución de licencia visible al pie**: `atribucionMedia` (© Gym Visual) en texto legible, no en un tooltip ni en gris ilegible — requisito explícito, no cosmético.
- Botón "volver al catálogo".

**`(profesor)/layout.tsx`** — hallazgo: hoy no valida nada (cualquiera sin sesión entra a `/profesor`). Se le agrega el mismo guard de autenticación que ya usa `(admin)/layout.tsx` (llamar a un endpoint autenticado — ej. `/users/me` — y redirigir a `/login` si 401/403). No se agrega guard de rol PROFESOR todavía (no hay ninguna pantalla que lo justifique aún; el catálogo es legible por cualquier rol autenticado según el propio requisito de este bloque) — queda para cuando Bloque 3 introduzca acciones exclusivas de PROFESOR.

## 7. Testing

- Backend: unit tests de `ListExercisesUseCase`/`GetExerciseUseCase` con fake repository (filtros, paginación, 404). Test de `PrismaExerciseRepository` opcional/liviano (o cubierto indirectamente por el use case + verificación manual contra la DB real, seguir el patrón ya usado en `identity` de no pegarle a la DB real en tests automatizados).
- Sin test automatizado de `upload-exercise-media.ts`/seed reescrito — son scripts de una sola corrida, se verifican con evidencia real (conteos, URLs devueltas) igual que `seed-exercises.ts` original.
- Frontend: sin test runner en `apps/web` (consistente con el resto del proyecto) — verificación por build + inspección de markup/manual, mismo criterio que fases anteriores.

## Fuera de alcance (explícito)

- Scoping por `gymId` en el catálogo (Fase 2).
- Subida de ejercicios custom por el profesor (Fase 2, aunque el modelo ya lo soporta con `gymId` no-nulo).
- Selector de acento en runtime para el usuario final.
- Guard de rol PROFESOR en `(profesor)/layout.tsx` (Bloque 3).
- Integración del catálogo dentro del armador de rutinas (Bloque 3) — esta pantalla es standalone a propósito, para validar componente y estilo primero.
