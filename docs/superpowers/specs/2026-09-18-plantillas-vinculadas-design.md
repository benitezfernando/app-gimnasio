# Plantillas vinculadas + eliminación de "descanso" — Diseño

**Fecha:** 2026-09-18
**Contexto:** Investigando por qué "asignar una plantilla" parecía no funcionar
(bug real encontrado y cerrado aparte: una instancia vieja de datos de prueba,
de la época del bug del `PUT` faltante, quedó con 0 ejercicios — el motor de
asignación en sí funciona bien), el usuario pidió una capacidad nueva: que la
rutina de un alumno pueda quedar **vinculada** a su plantilla de origen en vez
de solo clonada una vez, para que ediciones futuras a la plantilla se
propaguen. En el mismo pedido, agregó que el campo **peso** (y, tras aclarar,
también **series** y **repeticiones**) siempre tienen que ser específicos de
cada alumno, nunca pisados por la plantilla — y que el campo **descanso** deja
de existir en toda la app. Al revisar este mismo spec, el usuario reportó
además que la búsqueda de ejercicios no encuentra nombres con tilde cuando se
busca sin tilde (ej. buscar "frances" no encuentra "Francés").

## Alcance

Tres cambios en el mismo plan porque tocan archivos cercanos (dos tocan el
mismo módulo de rutinas; el tercero es chico y surgió en la misma revisión):

**A. Eliminar el campo `descanso`** de `RoutineTemplateExercise` y
`RoutineInstanceExercise` — schema, migración (dropea la columna, se pierden
los valores existentes a propósito), DTOs, casos de uso, editor de ejercicios,
tarjetas que lo muestran.

**B. Plantillas vinculadas** — nueva capacidad opcional al asignar/reemplazar
una plantilla a un alumno.

**C. Búsqueda de ejercicios ignora acentos** — buscar "frances" debe encontrar
"Francés"; la visualización siempre muestra el nombre con su acentuación
original, esto solo afecta el matching de la búsqueda.

## Diseño

### A. Eliminar "descanso"

- `prisma/schema.prisma`: se saca el campo `descanso Int` de ambos modelos
  (`RoutineTemplateExercise`, `RoutineInstanceExercise`).
- Migración nueva: `ALTER TABLE ... DROP COLUMN descanso` en las dos tablas.
  Es destructivo (se pierden los valores ya cargados) — decisión explícita del
  usuario, no un descuido.
- Backend: `EjercicioDto`/`EjercicioItem`/`toEjercicioItems` (compartidos entre
  plantillas e instancias) pierden el campo. Los casos de uso que arman
  `RutinaVigenteOutput`/`RutinaVigenteEjercicioResuelto`
  (`GetAlumnoRutinaVigenteAsProfesorUseCase`, `GetMiRutinaVigenteUseCase`) y los
  repositorios Prisma (`toEjercicioItem`/`toDetail` en ambos repositorios)
  dejan de mapearlo.
- Frontend: `EjercicioEnEdicion`/`aPayloadDeEjercicios` (`lib/routine-types.ts`)
  pierden el campo. `RoutineExercisesEditor`: la grilla de cada fila pasa de
  4 columnas (series/repeticiones/peso/descanso) a 3
  (series/repeticiones/peso); `agregar()` deja de inicializar `descanso: 60`;
  el union type de `cambiarCampo` pierde `'descanso'`. `/alumno/page.tsx` saca
  el `<Pill>{ejercicio.descanso}s descanso</Pill>`. `/plantillas/[id]/page.tsx`
  y `alumnos/[id]/page.tsx` sacan `descanso` de sus interfaces y mapeos.

### B. Plantillas vinculadas

**Modelo de datos:** `RoutineInstance` suma `vinculada Boolean @default(false)`.
La instancia sigue teniendo su propia copia real en `RoutineInstanceExercise`
(ningún read-path existente cambia) — lo que cambia es que, mientras
`vinculada=true`, esa copia se re-sincroniza automáticamente cuando el
profesor edita la plantilla de origen.

**Regla de fusión al sincronizar (la parte no obvia):** cuando se propaga un
cambio de la plantilla a una instancia vinculada, por cada ejercicio de la
plantilla:

- Si el alumno YA tenía ese `exerciseId` cargado → se conservan su `series`,
  `repeticiones` y `peso` tal cual estaban; solo se actualizan `orden` y
  `notas` desde la plantilla.
- Si es un ejercicio NUEVO que la plantilla agregó y el alumno no lo tenía →
  arranca con los valores (`series`/`repeticiones`/`peso`) que trae la
  plantilla en ese momento, como punto de partida editable.
- Si la plantilla sacó un ejercicio → se saca también de la instancia
  vinculada (la membresía de ejercicios sigue a la plantilla).

**Dónde se dispara la propagación:** `ReplaceTemplateExercisesUseCase` (el que
corre al guardar ejercicios de una plantilla), después de reemplazar los
ejercicios de la plantilla misma, busca las instancias con
`origenTemplateId` = esa plantilla, `vinculada=true` y `activa=true` (la
vigente de cada alumno — no tiene sentido sincronizar instancias históricas
que ya no se muestran a nadie), y por cada una aplica la fusión de arriba y
llama a `replaceExercises`.

**Elegir vincular:** al asignar o reemplazar (`AssignTemplateForm`), un
checkbox nuevo "Vincular a la plantilla (se actualiza sola si edito la
plantilla después)", desmarcado por defecto — mantiene el comportamiento
actual (copia independiente) como default seguro. Viaja como `vincular:
boolean` en el `POST /routine-instances`. `AssignRoutineToAlumnoUseCase` lo
recibe y se lo pasa a `instanceRepository.crear(...)` como `vinculada`.

**Desvincular:** ocurre solo cuando, desde la pantalla de ESE alumno puntual
(`InstanceEditor` → `PUT /routine-instances/:id/exercises`), el conjunto de
`exerciseId` que se guarda es DISTINTO al que la instancia tenía antes de ese
guardado (se agregó o sacó algún ejercicio para ese alumno específico,
divergiendo de la plantilla). Si el conjunto de ids es el mismo — el profesor
solo tocó peso/series/repeticiones de ejercicios que ya estaban — la instancia
sigue vinculada; tiene sentido, esos tres campos siempre fueron del alumno,
tocarlos no es "divergir de la plantilla". `ReplaceInstanceExercisesUseCase`
compara el set de ids antes/después y, si difiere y la instancia estaba
vinculada, la marca `vinculada=false` en el mismo guardado.

**Cartel informativo (vista profesor, `alumnos/[id]/page.tsx`):** si
`rutinaVigente.vinculada`, se muestra una `Pill` "Vinculada a «Nombre de la
plantilla»" con link a `/profesor/plantillas/:id`.
`GetAlumnoRutinaVigenteAsProfesorUseCase` suma `vinculada` y (solo cuando es
`true`) `origenTemplateNombre` a su output, resolviendo el nombre actual de la
plantilla. `GetMiRutinaVigenteUseCase` (la vista del alumno) **no se toca** —
pedido explícito: esto es información solo para el profesor.

**Plantilla borrada:** el hard-delete de una plantilla (ya exige que esté
desactivada, regla existente) deja `origenTemplateId = null` en las
instancias por la FK `onDelete: SetNull` que ya existe — sin cambios acá. Una
instancia vinculada a una plantilla borrada simplemente deja de mostrarse
como vinculada (su última copia sincronizada queda intacta, no se rompe ni se
vacía) — no hace falta lógica nueva, el gate de display es
`vinculada && origenTemplateNombre != null`.

### C. Búsqueda de ejercicios ignora acentos

**Causa raíz:** `PrismaExerciseRepository.findMany` filtra con
`nombre: { contains: filter.search, mode: 'insensitive' }`. `ILIKE` de
Postgres ignora mayúsculas/minúsculas pero no diacríticos — buscar "frances"
no matchea "Francés".

**Por qué no usar la extensión `unaccent` de Postgres:** funcionaría pero
`unaccent()` no es `IMMUTABLE` por defecto (no se puede indexar directo, hay
que envolverla en una función wrapper) y mezclaría SQL crudo (`$queryRaw`) en
un repositorio que hoy es 100% Prisma tipado, para un catálogo que ni
siquiera es grande. No vale la complejidad.

**Solución:** el catálogo de `Exercise` es semilla/estático — no hay endpoint
de alta/edición (`ExercisesController` solo expone `list`/`by-ids`/`detail`),
así que no hace falta mantener sincronizado nada en tiempo de escritura desde
la app.

- `prisma/schema.prisma`: `Exercise` suma `nombreNormalizado String` (nombre
  en minúsculas y sin diacríticos, ej. "Press Francés" → "press frances"),
  con `@@index([nombreNormalizado])`.
- Migración: agrega la columna y la puebla para las filas existentes vía un
  script (no SQL puro — la normalización de acentos vive en JS) que corre
  como parte del deploy de la migración.
- El seed de ejercicios calcula `nombreNormalizado` al insertar cada fila, con
  la misma función de normalización.
- `PrismaExerciseRepository.findMany`: cuando hay `filter.search`, normaliza
  el término de búsqueda con la misma función y filtra por
  `nombreNormalizado: { contains: normalizado }` en vez de por `nombre`. El
  resto de filtros (`parteCuerpo`, `equipamiento`) no cambia.
- **La visualización no cambia en ningún lado** — todo lo que se muestra al
  usuario (`ExerciseCardData.nombre`, tarjetas, editor de ejercicios) sigue
  leyendo el campo `nombre` original, con su acentuación real. El campo
  normalizado es solo para el `WHERE` del backend, nunca se expone en ninguna
  respuesta de la API.
- Función de normalización (compartida entre seed y repositorio, ej.
  `apps/api/src/exercise-catalog/normalizar-nombre.ts`):
  `texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()`.

## Fuera de alcance

- No se toca la vista del alumno (`/alumno`) — el cartel es solo para
  profesor.
- No hay botón para vincular/desvincular manualmente fuera de los dos flujos
  descriptos (asignar-con-checkbox / editar-diverge-y-desvincula).
- No se sincroniza nada hacia instancias `activa=false` (histórico de rutinas
  reemplazadas) — no se muestran a nadie, sincronizarlas sería trabajo sin
  efecto visible.
- El campo `descanso` no se reemplaza por nada ni se migra a otro lado — se
  elimina, punto.
- La búsqueda accent-insensitive no se extiende a otros campos (`parteCuerpo`,
  `equipamiento`, `grupoMuscular`) — esos filtros son de valores fijos de un
  select, no texto libre, no tienen el problema.
- No se agrega gestión de alta/edición de ejercicios vía API — si eso se
  agrega en el futuro, ese trabajo deberá mantener `nombreNormalizado`
  sincronizado en cada create/update (queda anotado, no resuelto acá).

## Riesgo / verificación

- La migración que dropea `descanso` es irreversible sobre los datos ya
  cargados — confirmar antes de aplicarla en producción (ya lo pidió el
  usuario explícitamente, pero el plan debe decirlo en el paso de la
  migración, no asumirlo).
- La comparación de sets de `exerciseId` para decidir desvincular tiene que
  ser una comparación de conjuntos real (mismo tamaño + misma pertenencia),
  no solo de longitud — dos instancias con 3 ejercicios pero uno distinto
  deben contar como "divergió".
- Verificar que propagar a una instancia vinculada nunca dispare, a su vez,
  la lógica de "desvincular" de `ReplaceInstanceExercisesUseCase` — son dos
  código-paths distintos (`ReplaceTemplateExercisesUseCase` llama directo al
  repositorio para las vinculadas, no pasa por `ReplaceInstanceExercisesUseCase`)
  pero hay que dejarlo explícito para que la implementación no los mezcle.
- El backfill de `nombreNormalizado` para filas existentes corre como script,
  no como SQL puro dentro de la migración — el plan debe dejar explícito
  cómo y cuándo se ejecuta contra producción (no puede quedar como paso
  manual implícito).
