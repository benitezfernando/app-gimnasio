# Alias de nombre de ejercicio por profesor — Diseño

## Contexto

El catálogo de ejercicios (`Exercise`, 1.324 filas, `fuente: CATALOG`) es
global y de solo lectura (PRD §6 regla 5). Según el gimnasio, un mismo
ejercicio se conoce con nombres distintos ("Barra press de banca" vs
"Banca plana"). El pedido: que un profesor pueda renombrar un ejercicio
**solo para él** y que sus alumnos vean el nombre que dejó, sin modificar
nunca la tabla del catálogo.

Hoy el nombre se resuelve al **leer**: `resolverDiasDeRutina`
(`apps/api/src/routines/application/resolver-dias-de-rutina.ts`) llama a
`ExerciseRepositoryPort.findByIds` y toma `nombre` del catálogo; el
catálogo se busca y pagina en el servidor (`GET /exercises?search=…`), y
esos endpoints hoy no saben quién los llama.

## Decisiones (consultadas y aprobadas)

1. **Alcance: por profesor, una sola vez.** El alias vive en el perfil del
   profesor y vale en todas sus plantillas y en las rutinas de todos sus
   alumnos, hoy y futuras. Se aplica en vivo: si lo cambia, todos ven el
   nombre nuevo. Un solo alias por ejercicio por profesor.
2. **Dónde se edita: en el editor, sobre la línea del ejercicio.** Se
   implementa como acción "Renombrar" en el menú ⋮ que ya tiene cada
   línea (no como ícono nuevo, porque en celular la fila no tiene lugar).
3. **Dónde se ve el alias: en todo el catálogo del profesor.** Rutinas y
   plantillas, buscador de ejercicios, listado y detalle del catálogo.
   La búsqueda del profesor también matchea por su alias.
4. **Dos profesores sobre un mismo alumno:** siempre manda el alias del
   profesor **dueño de la rutina** (el que la asignó). El alumno ve ese,
   y el otro profesor, al editar esa rutina, también.

## Modelo de datos

Tabla nueva `ExerciseAlias`:

| Campo                     | Tipo     | Nota                                                             |
| ------------------------- | -------- | ---------------------------------------------------------------- |
| `id`                      | uuid     | PK                                                               |
| `profesorId`              | String   | FK → `User`, `ON DELETE CASCADE`                                 |
| `exerciseId`              | String   | FK → `Exercise`, `ON DELETE CASCADE`                             |
| `nombre`                  | String   | recortado, 1 a 80 caracteres                                     |
| `nombreNormalizado`       | String   | `normalizarNombre(nombre)`, para buscar sin tildes ni mayúsculas |
| `createdAt` / `updatedAt` | DateTime |                                                                  |

- `@@unique([profesorId, exerciseId])`: un alias por ejercicio por profesor.
- `@@index([profesorId, nombreNormalizado])`: soporta la búsqueda por alias.
- Dos ejercicios distintos del mismo profesor **pueden** tener el mismo
  alias (sin chequeo de unicidad entre ejercicios).
- `Exercise` solo gana la relación inversa `aliases ExerciseAlias[]` en
  el schema de Prisma; **no cambia ninguna columna ni tabla existente** y
  no hay backfill.
- El borrado definitivo de un profesor (HU-03c) arrastra sus alias por la
  FK en cascada; hay que cubrirlo con un test de integración.

## Reglas de resolución

- **Catálogo, buscador y detalle:** si quien llama es PROFESOR, se usa su
  propio alias. ALUMNO y ADMIN ven siempre el catálogo puro.
- **Rutinas y plantillas:** se usa el alias del profesor dueño
  (`RoutineInstance.profesorId` / `RoutineTemplate.profesorId`), sin
  importar quién mire (alumno incluido). Si la instancia no tiene dueño
  (`profesorId` nulo por la cascada de hard-delete), se muestra el nombre
  del catálogo.
- **Búsqueda del profesor:** `search` matchea `nombreNormalizado`,
  `nombreOriginalNormalizado` y los alias propios.
- **Volver atrás:** borrar el alias devuelve el nombre del catálogo.
- **Caso borde aceptado:** el profesor B que edita una rutina de A y usa
  su buscador ve sus propios alias en los resultados, pero la línea ya
  agregada se muestra con el alias de A.

## Backend (`apps/api`)

**Lectura.** `ExerciseRepositoryPort` (`findMany`, `findById`,
`findByIds`) recibe la opción `aliasDeProfesorId?: string`. Si viene, la
consulta cruza con `ExerciseAlias` de ese profesor (un join en la misma
consulta, sin N+1) y devuelve `nombre` ya con el alias más
`nombreCatalogo: string | null` (nombre del catálogo; `null` si no hay
alias). En `findMany`, la búsqueda suma
`aliases: { some: { profesorId, nombreNormalizado: { contains } } }` al
`OR` actual. `ExerciseSummary` gana `nombreCatalogo`.

**Controlador.** `ExercisesController` pasa `req.user.id` como
`aliasDeProfesorId` solo cuando `req.user.role === PROFESOR`
(`GET /exercises`, `GET /exercises/by-ids`, `GET /exercises/:id`).

**Rutinas.** `resolverDiasDeRutina` recibe además `aliasDeProfesorId`
(`string | null`) y se lo pasa a `findByIds`. Los casos de uso que ya lo
llaman le pasan el dueño: `profesorId` de la instancia o de la plantilla.
`validarExerciseIdsEnCatalogo` usa `findByIds` solo para verificar
existencia y **no** pasa la opción.

**Escritura (solo PROFESOR).** Un puerto nuevo
`ExerciseAliasRepositoryPort` (`upsert`, `delete`) con repositorio
Prisma, y dos casos de uso, en el mismo patrón hexagonal del resto:

- `SetExerciseAliasUseCase`: valida rol, que el ejercicio exista y las
  reglas del nombre; hace upsert por `(profesorId, exerciseId)`.
- `ClearExerciseAliasUseCase`: borra el alias propio; idempotente.

**API.**

- `PUT /exercises/:id/alias` con `{ nombre: string }` → `@Roles(PROFESOR)`;
  devuelve el ejercicio resuelto (con `nombre` y `nombreCatalogo`).
- `DELETE /exercises/:id/alias` → `@Roles(PROFESOR)`; devuelve el ejercicio
  con el nombre del catálogo.
- Ejercicio inexistente → 404 (`DomainError`); nombre inválido → 400.

**Migración.** Escrita a mano, verificada con `db:verificar-migraciones`
(PGlite). Solo agrega la tabla.

## Frontend (`apps/web`)

- `components/day-exercises-list.tsx`: el menú ⋮ de `FilaEjercicio` pasa
  a mostrarse siempre. Contiene "Renombrar" y, cuando hay destinos,
  "Mover a".
- Componente nuevo de diálogo (shadcn `Dialog`): campo con el nombre
  actual, texto "Nombre del catálogo: …", botones Guardar, "Volver al
  nombre original" (solo si ya tiene alias) y Cancelar. Llama a
  `PUT`/`DELETE /exercises/:id/alias` vía `browserApiFetch`.
- El alias se guarda **al instante**, sin depender del guardado de la
  rutina. Al guardar, se actualizan **todas** las líneas del editor con
  ese `exerciseId`, mediante una función pura (p. ej.
  `aplicarNombreAEjercicio(dias, exerciseId, nombre)` en
  `lib/routine-days.ts`) testeada con jest.
- `ExerciseCardData` y `ExerciseSummary` ganan `nombreCatalogo?: string | null`.
- Sin cambios en las pantallas del alumno, el buscador, el catálogo y el
  detalle: reciben `nombre` ya resuelto. `nombreConOriginal` sigue
  funcionando igual (muestra alias + nombre original entre paréntesis
  cuando difieren).

## Pruebas

- Casos de uso `SetExerciseAlias` y `ClearExerciseAlias`: rol, ejercicio
  inexistente, recorte, límite de 80, idempotencia del borrado.
- Repositorio con la base de prueba (`*.int.spec.ts`): la búsqueda
  encuentra por alias propio, un profesor no ve el alias de otro,
  `findByIds` con y sin opción, borrado en cascada al borrar profesor o
  ejercicio.
- Controlador (e2e): PROFESOR recibe alias, ALUMNO y ADMIN reciben el
  catálogo puro.
- `resolverDiasDeRutina`: con dueño, sin dueño (nulo) y con dueño sin
  alias.
- Frontend: la función pura de actualización de líneas. El diálogo se
  verifica a mano (el repo no tiene React Testing Library).

## Salida a producción

1. Backup de Supabase (precaución; la migración es aditiva).
2. Aplicar la migración (tabla nueva, sin backfill).
3. Manual Deploy del API en Render.
4. Push del frontend (Vercel deploya solo).

Cada paso es compatible con el anterior. Si el frontend saliera antes que
el API, solo "Renombrar" fallaría hasta el deploy.

## Fuera de alcance

- Alias distintos por alumno o por plantilla.
- Que el alumno vea alias en su propio catálogo.
- Gestión de alias desde el panel de admin.
- Alias sobre ejercicios `CUSTOM` (hoy no hay UI para crearlos).
