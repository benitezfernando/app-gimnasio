# Curación y traducción del catálogo de ejercicios — diseño

Fecha: 2026-09-13
Estado: aprobado por el usuario, pendiente de plan de implementación.

## Contexto y hallazgos previos al diseño

Pedido original: el catálogo de ejercicios (1.324 ejercicios importados del dataset real, nombres en inglés) es demasiado largo y poco relevante para un gym convencional — se pide curarlo a un subconjunto de ejercicios tradicionales, con nombres en español.

Auditado contra la DB real antes de diseñar:

- **1.324 ejercicios totales.** Distribución por equipamiento: `body weight` 325, `dumbbell` 294, `cable` 157, `barbell` 154, `leverage machine` 81, `band` 54, `smith machine` 48, `kettlebell` 41, y una larga cola de equipamiento poco común (`stability ball`, `sled machine`, `medicine ball`, etc.).
- **Solo 1 `exerciseId` está referenciado en rutinas/plantillas reales hoy**: `barbell bench press` (id `023f84cc-50ab-49f1-b211-326ca3ff79bd`). Riesgo bajísimo de romper datos existentes al curar.
- Tres columnas de taxonomía, todas en inglés, todas universos cerrados ya verificados contra la DB real:
  - `parteCuerpo`: 10 valores (`chest`, `back`, `shoulders`, `upper arms`, `lower arms`, `waist`, `upper legs`, `lower legs`, `cardio`, `neck`) — ya hardcodeados en `apps/web/lib/region-colors.ts` (`PARTES_CUERPO`), usados hoy sin traducir en los filtros de `/catalogo`.
  - `equipamiento`: 28 valores — ya hardcodeados en `apps/web/lib/equipment-options.ts` (`EQUIPAMIENTOS`), también sin traducir.
  - `grupoMuscular`: 19 valores (`abs`, `pectorals`, `biceps`, `glutes`, `delts`, `triceps`, `upper back`, `lats`, `calves`, `quads`, `forearms`, `cardiovascular system`, `hamstrings`, `spine`, `traps`, `adductors`, `abductors`, `serratus anterior`, `levator scapulae`) — sin tabla de traducción hoy, se muestra crudo en el `<dl>` del detalle de ejercicio.
- No hay campo `activo`/`visible` en `Exercise` — no existe ningún mecanismo hoy para ocultar ejercicios del catálogo sin borrarlos.

## Decisiones de alcance acordadas con el usuario

- La curación se hace por **soft-hide**, no borrado físico: un ejercicio fuera de la lista curada deja de aparecer en `/catalogo`, pero sigue existiendo en la DB y sigue resolviéndose por ID — necesario para no romper el único ejercicio ya usado en una rutina real si en algún momento queda fuera de la lista curada.
- Se traduce tanto el **nombre del ejercicio** (`Exercise.nombre`, solo para los ejercicios curados) como las **tres taxonomías** (`parteCuerpo`, `grupoMuscular`, `equipamiento` — 57 valores fijos en total) usadas en filtros y en el detalle.
- La lista curada (~100-130 ejercicios) la propone Claude mapeada contra IDs reales del catálogo, agrupada por zona del cuerpo, para revisión y ajuste del usuario antes de aplicarse — no se aplica nada a la DB sin esa revisión explícita.

## 1. Modelo de datos y migración

```prisma
model Exercise {
  // ...campos existentes sin cambios...
  activo Boolean @default(true)

  @@index([activo])
}
```

Migración de Prisma (`prisma migrate dev`) agrega la columna con default `true` — no rompe ninguna fila existente, todo el catálogo actual queda "activo" hasta que el script de curación corra.

Reglas de uso de `activo`, por caso de uso:

| Caso de uso                                                                              | Filtra por `activo`?                                                                                                                                              |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ListExercisesUseCase` / `findMany` (alimenta `GET /exercises`, la pantalla `/catalogo`) | **Sí** — agrega `activo: true` al `where` por default. Sin parámetro para desactivar este filtro (no hay ningún flujo real hoy que necesite ver los ocultos).     |
| `GetExerciseUseCase` / `findById` (`GET /exercises/:id`)                                 | **No** — resuelve cualquier ejercicio exista o no `activo`.                                                                                                       |
| `GetExercisesByIdsUseCase` / `findByIds` (`GET /exercises/by-ids`)                       | **No** — mismo criterio, es lo que mantiene viva la resolución de nombre/imagen de ejercicios ya usados en rutinas/plantillas aunque queden fuera de la curación. |

Esto preserva exactamente el comportamiento que ya construimos en el bloque anterior (bulk fetch para plantillas, fallback a "(ejercicio no encontrado)" solo si el ID ya no existe en absoluto, nunca por estar oculto).

## 2. Curación de la lista

Proceso, en orden:

1. Claude arma una lista de ~100-130 ejercicios tradicionales de gimnasio (cubriendo pecho/espalda/hombros/brazos/piernas/core/cardio básico), mapeada contra IDs reales ya existentes en la DB — no se inventan ejercicios nuevos. Se prioriza lo que un profesor de gym convencional reconocería (press banca, sentadilla, peso muerto, dominadas, remo, curl de bíceps, extensión de tríceps, prensa, elevaciones laterales, plancha) con variantes comunes (barra/mancuerna/máquina), excluyendo variantes exóticas del dataset salvo que sean genuinamente frecuentes.
2. Se presenta como tabla `nombre original (inglés) → nombre propuesto (español) → parteCuerpo/equipamiento`, agrupada por zona del cuerpo, para revisión del usuario. El usuario ajusta (agrega/saca ejercicios) antes de aprobar.
3. La lista aprobada se guarda como un JSON versionado en el repo (`apps/api/prisma/exercise-curation.json` o similar — se define el path exacto en el plan de implementación), estructura `[{ id: string, nombreEs: string }]`.
4. Un script uso-único (`apps/api/prisma/curate-exercises.ts`, mismo patrón que `seed-admin.ts`/`seed-exercises.ts` ya existentes en el repo — usa Prisma directo, no pasa por la API) aplica la lista:
   - Paso 1: `UPDATE "Exercise" SET activo = false` (todos).
   - Paso 2: por cada entrada del JSON, `UPDATE "Exercise" SET activo = true, nombre = <nombreEs> WHERE id = <id>`.
   - Modo `--dry-run` (flag de línea de comandos): imprime qué IDs quedarían activos/inactivos y con qué nombre nuevo, sin escribir nada — se corre primero, se revisa la salida, recién después se corre el modo real.
5. Se corre en modo real contra la DB de producción una sola vez. El script no forma parte del build ni se ejecuta en ningún pipeline — es una herramienta de migración de datos puntual, como los seeds existentes.

## 3. Traducción de la taxonomía (57 valores fijos)

Capa de presentación pura en `apps/web/lib/` — el backend, Prisma, y los índices no cambian; el `value` que viaja en la query (`?parteCuerpo=upper+arms`) sigue siendo el crudo en inglés, solo la etiqueta mostrada cambia:

- `region-colors.ts`: agrega `ETIQUETA_PARTE_CUERPO: Record<string, string>` junto al `REGION_A_SLUG` existente (ej. `'upper arms': 'Brazos (superior)'`).
- `equipment-options.ts`: agrega `ETIQUETA_EQUIPAMIENTO: Record<string, string>` (ej. `'body weight': 'Peso corporal'`, `'leverage machine': 'Máquina de palanca'`).
- Nuevo `lib/muscle-group-options.ts`: exporta `GRUPOS_MUSCULARES` (los 19 valores crudos, mismo patrón que `PARTES_CUERPO`/`EQUIPAMIENTOS`) y `ETIQUETA_GRUPO_MUSCULAR: Record<string, string>` (ej. `pectorals: 'Pectorales'`, `delts: 'Deltoides'`).
- Los dropdowns de filtro en `/catalogo` y el `<dl>` de región/músculo en `/catalogo/[id]` consumen las etiquetas traducidas en vez del valor crudo.
- Test unitario que verifica que las tres tablas de etiquetas cubren exactamente los mismos valores que `PARTES_CUERPO`/`EQUIPAMIENTOS`/`GRUPOS_MUSCULARES` (previene que un valor real quede sin traducir sin que ningún test lo note — `Record<string, string>` no fuerza exhaustividad en TypeScript).

## 4. Impacto en API/UI existente

- **Búsqueda** (`?search=`, `contains` case-insensitive sobre `nombre`): sin cambios de código — al quedar `nombre` en español para los curados, buscar "sentadilla" funciona solo. Los ocultos (`activo=false`) no entran en el `where`, así que nunca aparece un resultado con nombre en inglés en el listado.
- **`ExerciseCard` y el detalle de ejercicio**: sin cambios de lógica, solo consumen las nuevas tablas de traducción para las etiquetas mostradas.
- Nada de esto toca `RoutineTemplate`/`RoutineInstance`, sus casos de uso, ni el endpoint bulk (`/exercises/by-ids`) agregado en el bloque de performance anterior.

## 5. Testing y verificación

**Backend:**

- Test de migración: `activo` default `true`, no rompe fixtures/seeds existentes.
- `ListExercisesUseCase`/`findMany` spec: cubre el filtro `activo: true` agregado.
- Test explícito (regresión directa contra el caso real): `findById`/`findByIds` devuelven un ejercicio con `activo: false` sin problema.
- E2E de `/exercises` actualizado: el listado no incluye inactivos.

**Frontend:**

- Test unitario de cobertura de las 3 tablas de traducción (sección 3).
- Build + lint limpios de `apps/web`.

**Verificación manual con datos reales, antes y después de aplicar la curación:**

- Dry-run del script revisado por el usuario antes de cualquier escritura real.
- Post-aplicación: confirmar contra la DB real que `barbell bench press` sigue resolviendo vía `GetExercisesByIdsUseCase` (esté o no en la lista curada).
- Smoke test en `/catalogo`: cantidad de resultados acorde al tamaño curado, nombres en español, filtros con etiquetas en español.
