# Rutina dividida en días — diseño

**Fecha:** 2026-09-24
**Estado:** aprobado por Fernando (brainstorming, 3 secciones)
**Afecta:** `apps/api` (bounded context `routines`, schema Prisma + migración), `apps/web` (editor de plantilla, asignación, rutina del alumno vista profesor, vista alumno), `docs/hld-mvp.md` §Routines, `docs/prd-mvp.md` HU-04/05/06/08.

## Problema

Hoy plantilla (`RoutineTemplate`) e instancia (`RoutineInstance`) son una lista plana de ejercicios. En la vida real un alumno entrena cosas distintas según el día (piernas un día, espalda otro) y el sistema no puede representarlo.

## Decisiones de producto (confirmadas)

| #   | Decisión                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Los días se identifican **solo por número**: "Día 1", "Día 2"… Sin nombre/etiqueta. No son días de la semana.                                                                                                                   |
| 2   | Máximo **7 días**. Tope de **50 ejercicios en total** por plantilla/instancia (se mantiene el actual).                                                                                                                          |
| 3   | El alumno elige manualmente qué día ver. Al entrar, abre en el **último día que eligió**, guardado solo en su dispositivo (`localStorage`). Sin dato o dato inválido → Día 1. El alumno sigue sin escribir nada en el servidor. |
| 4   | Una rutina de **un solo día se ve exactamente como hoy** (sin selector), para alumno y profesor. El selector aparece a partir del Día 2.                                                                                        |
| 5   | Las **plantillas tienen días**, y además la rutina de un alumno puede **combinar días de distintas plantillas** (Día 1 = Piernas·Día 1, Día 2 = Espalda·Día 2, Día 3 = desde cero). Se entrega todo junto.                      |
| 6   | El vínculo (sincronización con plantilla) es **por día** de la instancia, contra **un día específico** de una plantilla.                                                                                                        |
| 7   | Traer un día de plantilla a la rutina del alumno se puede **al asignar y al editar** la rutina vigente (agregar como día nuevo o reemplazar un día existente), sin reasignar todo.                                              |
| 8   | Vincular sigue siendo **opt-in**: una única casilla "Mantener sincronizado con las plantillas" por asignación/importación, apagada por defecto. Días armados desde cero nunca quedan vinculados.                                |
| 9   | Si el profesor modifica la estructura de un día vinculado de un alumno (agrega/quita ejercicios, o mueve un ejercicio de día), **ese día se desvincula**. Series/reps/peso/orden no desvinculan. Reordenar días no desvincula.  |
| 10  | Al propagar una edición de plantilla, el alumno **conserva sus series/reps/peso aunque el ejercicio haya cambiado de día** en la plantilla, salvo ambigüedad (ver §Propagación).                                                |
| 11  | Si la plantilla pierde el día al que un alumno está vinculado (se borra el día o la plantilla entera), el día del alumno **se desvincula y queda intacto**. Nunca se le borra nada a un alumno por editar una plantilla.        |
| 12  | **No hay días vacíos.** Quitar todos los ejercicios de un día = quitar el día; los siguientes se renumeran. La rutina completa sí puede quedar con cero días (comportamiento actual con cero ejercicios).                       |
| 13  | El profesor puede **reordenar días** (flechas) y **mover un ejercicio a otro día** vía menú "Mover a Día N". Drag & drop solo dentro del mismo día.                                                                             |

## Modelo de datos

### Tablas nuevas

```prisma
model RoutineTemplateDay {
  id         String   @id @default(uuid())
  templateId String
  numero     Int      // 1..7, posición visible

  template          RoutineTemplate           @relation(fields: [templateId], references: [id], onDelete: Cascade)
  ejercicios        RoutineTemplateExercise[]
  diasVinculados    RoutineInstanceDay[]      @relation("VinculoDia")

  @@unique([templateId, numero])
}

model RoutineInstanceDay {
  id              String  @id @default(uuid())
  instanceId      String
  numero          Int     // 1..7
  vinculadoADiaId String? // RoutineTemplateDay.id; null = independiente

  instance     RoutineInstance           @relation(fields: [instanceId], references: [id], onDelete: Cascade)
  vinculadoA   RoutineTemplateDay?       @relation("VinculoDia", fields: [vinculadoADiaId], references: [id], onDelete: SetNull)
  ejercicios   RoutineInstanceExercise[]

  @@unique([instanceId, numero])
  @@index([vinculadoADiaId])
}
```

### Cambios en tablas existentes

- `RoutineTemplateExercise`: `templateId` → `dayId` (FK a `RoutineTemplateDay`, `onDelete: Cascade`). `@@unique([dayId, orden])`.
- `RoutineInstanceExercise`: `instanceId` → `dayId` (FK a `RoutineInstanceDay`, `onDelete: Cascade`). `@@unique([dayId, orden])`.
- `RoutineInstance`: se eliminan `vinculada` y `origenTemplateId` (el vínculo vive en el día).
- `RoutineTemplate`: relación `instanciasOrigen` se elimina; `ejercicios` → `dias`.

### Invariantes

- **El vínculo apunta al `id` del día de plantilla, nunca a su número.** Reordenar días de una plantilla no mueve vínculos.
- **"Vinculado" ≡ `vinculadoADiaId IS NOT NULL`.** No hay booleano aparte. Borrar un `RoutineTemplateDay` (o la plantilla entera, por cascada) pone `SetNull` y desvincula sin código adicional — cumple la decisión 11.
- **Los `RoutineTemplateDay` se persisten por `id` (upsert), no con replace-all.** Replace-all regeneraría los ids y rompería todos los vínculos. Días existentes (con `id` en el payload) se actualizan, días sin `id` se crean, días de la plantilla que no vienen en el payload se borran. Los ejercicios dentro de cada día sí siguen con replace-all (nada los referencia). Mismo criterio para `RoutineInstanceDay` (por consistencia y para no perder `vinculadoADiaId` en cada guardado).
- **Renumeración en dos pasadas** dentro de la misma transacción: primero `numero` temporal (fuera de rango, ej. `numero + 100`), después el definitivo. Evita chocar contra `@@unique([…, numero])` a mitad de camino — mismo problema ya documentado para `orden` (HLD §Routines).
- Todo día persistido tiene ≥ 1 ejercicio. Sin ejercicios repetidos dentro de un mismo día; entre días distintos sí.

### Migración (una sola migración Prisma, SQL de datos incluido — sin script manual)

1. Crear tablas de días.
2. Por cada `RoutineTemplate` con ≥ 1 ejercicio: crear su Día 1 y mover sus `RoutineTemplateExercise` a ese día. Plantillas sin ejercicios quedan con cero días.
3. Por cada `RoutineInstance` con ≥ 1 ejercicio: crear su Día 1 y mover sus ejercicios. Si la instancia tenía `vinculada = true` y `origenTemplateId` todavía existe con Día 1, `vinculadoADiaId` = ese Día 1; si no, `null`.
4. Recién después, eliminar columnas `templateId`/`instanceId` de las tablas de ejercicios, y `vinculada`/`origenTemplateId` de `RoutineInstance`.

Verificación obligatoria contra una copia local de la base antes de producción (conteos de ejercicios por plantilla/instancia antes y después idénticos; instancias vinculadas antes = días vinculados después).

## API

Los días viajan como array ordenado: **la posición en el array define `numero`** (1-based). El cliente nunca manda `numero`.

| Endpoint                                                        | Body / respuesta                                                                                                                                         |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUT /routine-templates/:id/dias` (reemplaza `PUT …/exercises`) | `{ dias: [{ id?: string, ejercicios: EjercicioDto[] }] }`                                                                                                |
| `PUT /routine-instances/:id/dias` (reemplaza `PUT …/exercises`) | `{ dias: [{ id?: string, vinculadoADiaId?: string, ejercicios: EjercicioDto[] }] }`                                                                      |
| `POST /routine-instances`                                       | `{ alumnoId, nombre?, dias: [{ vinculadoADiaId?: string, ejercicios: EjercicioDto[] }] }` — se elimina `origenTemplateId`/`vincular`/`ejercicios` planos |
| `GET /routine-templates/:id`                                    | incluye `dias: [{ id, numero, ejercicios[] }]`                                                                                                           |
| `GET /users/me/rutina-vigente` (alumno)                         | `{ id, nombre, dias: [{ numero, ejercicios: [...] }] }`                                                                                                  |
| `GET /users/:alumnoId/rutina-vigente` (profesor)                | `{ …, dias: [{ id, numero, vinculado: { templateId, templateNombre, numero } \| null, ejercicios[] }] }`                                                 |

`EjercicioDto` no cambia (`orden` pasa a ser relativo al día).

### Validaciones (DTO + caso de uso)

- `dias.length` entre 0 y 7.
- Suma de ejercicios de todos los días ≤ 50.
- Cada día con ≥ 1 ejercicio (el frontend descarta días vacíos antes de enviar; el servidor igual rechaza con 400).
- Sin `exerciseId` repetido dentro de un día.
- `id` de día en el payload debe pertenecer a la plantilla/instancia editada (si no, 404).
- Todos los `exerciseId` existen en el catálogo (validación actual).
- Asignación desde cero exige `nombre`. Si `nombre` viene vacío y **todos** los días vienen vinculados a días de la misma plantilla, se usa el nombre de esa plantilla.

### Regla única de vínculo (función pura en `application/`, calculada siempre en el servidor)

Un día de instancia queda con `vinculadoADiaId = X` si y solo si:

1. el request pide `vinculadoADiaId = X`, **y**
2. el conjunto de `exerciseId` del día enviado es igual al conjunto de `exerciseId` del día de plantilla `X`, **y**
3. si `X` es un vínculo **nuevo** para ese día (no era su vínculo anterior), el día de plantilla `X` pertenece a una plantilla del profesor que invoca y del mismo gym — si no, **404** (convención HLD: recurso ajeno = inexistente). Un vínculo ya existente a una plantilla de otro profesor de la cartera se conserva mientras se cumpla (2).

En cualquier otro caso se guarda con `vinculadoADiaId = null`. Consecuencias:

- Importar un día y guardarlo sin tocar → vinculado. Importarlo y cambiarle ejercicios antes de guardar → independiente.
- Agregar/quitar ejercicios de un día vinculado → ese día se desvincula (y solo ese).
- Mover un ejercicio entre días → cambia el conjunto de ambos → ambos se desvinculan (decisión 9).
- Cambiar series/reps/peso/orden, o reordenar días → no desvincula.
- La casilla "Mantener sincronizado" es solo de frontend: apagada ⇒ no se envía `vinculadoADiaId`.

El caso de uso de edición devuelve la lista de días que pasaron de vinculado a independiente en ese guardado, para que el frontend lo avise.

### Propagación al guardar una plantilla (función pura de merge + orquestación en el caso de uso)

Para cada `RoutineInstanceDay` de una instancia **activa** con `vinculadoADiaId` apuntando a un día de esta plantilla:

- Membresía y `orden`/`notas` de los ejercicios salen del día de plantilla.
- `series`/`repeticiones`/`peso` de cada ejercicio se toman, en orden de prioridad:
  1. del mismo `exerciseId` en **ese mismo día** de la instancia;
  2. si no está, del mismo `exerciseId` en **otro día de la misma instancia vinculado a esta misma plantilla**, solo si aparece exactamente una vez entre esos días;
  3. si no, de la plantilla.
- Días de instancia vinculados a días de plantilla borrados en este guardado ya quedan desvinculados por `SetNull` e intactos.

**Atomicidad:** guardado de la plantilla + propagación a todas las instancias vinculadas en **una sola `$transaction`** (hoy son escrituras separadas y una falla a mitad de la propagación deja alumnos sincronizados y otros no). A escala de un gym el costo es despreciable.

## Frontend

### `RoutineDaysEditor` (nuevo, `apps/web/components/`)

Componente compartido por el editor de plantilla (`plantillas/[id]/template-editor.tsx`), el formulario de asignación (`alumnos/[id]/assign-template-form.tsx`) y el editor de la rutina vigente (`alumnos/[id]/instance-editor.tsx`). Envuelve a `RoutineExercisesEditor`, que pasa a editar **un solo día**.

- 1 día: se ve igual que hoy + botón "Agregar día" al pie.
- ≥ 2 días: fila de chips con scroll horizontal `Día 1 · Día 2 · … · +`; chip activo con el gradiente de marca. Botón `+` deshabilitado al llegar a 7.
- Cabecera del día activo: flechas ←→ para reordenar, "Eliminar día" con confirmación (`useConfirm`).
- Menú `⋯` por ejercicio: "Mover a Día N".
- Drag & drop se mantiene, solo dentro del día.
- **Deuda a corregir:** `RoutineExercisesEditor` hoy usa `exerciseId` como key de React, id de drag & drop e id de inputs. Pasa a un id local por fila (generado al agregar/cargar), porque el mismo ejercicio puede estar en dos días. El chequeo de duplicados del picker pasa a ser por día.
- Contador global de ejercicios contra el tope de 50.

### Traer día de plantilla (asignación y rutina vigente)

Botón "Traer de plantilla" → diálogo: elegir plantilla → elegir día (vista previa de sus ejercicios) → "Agregar como día nuevo" / "Reemplazar Día N". Una única casilla "Mantener sincronizado con las plantillas" por pantalla.

### Asignar rutina

Mismo editor, arranca vacío. Atajo "Cargar plantilla completa" que trae todos los días de una plantilla de una vez (caso más común).

### Rutina vigente del alumno (vista profesor)

Cada día vinculado muestra badge "Sincronizado · {Plantilla} · Día N". Al guardar, si algún día se desvinculó, aviso textual ("El Día 2 dejó de estar sincronizado con su plantilla").

### Vista alumno (`app/(alumno)/alumno/page.tsx`)

- Sigue siendo server component; el selector de días es un client component chico.
- ≥ 2 días: chips `Día 1 (6)`, `Día 2 (8)`… (cantidad de ejercicios) y debajo la lista actual sin cambios.
- Día elegido en `localStorage` con clave por id de rutina. Día guardado inexistente (el profesor sacó días) o `localStorage` inaccesible (modo privado) → Día 1. Todo acceso envuelto en try/catch.

## Testing

- Unit: regla de vínculo (cada consecuencia listada arriba) y merge de propagación (incluidos ambigüedad por ejercicio repetido y ejercicio movido de día).
- Casos de uso: límites (8 días, 51 ejercicios), día vacío → 400, duplicado en el mismo día → 400, mismo ejercicio en dos días OK, vínculo a plantilla ajena → 404, desvincular solo el día tocado, mover ejercicio desvincula ambos días, reordenar días no desvincula, borrar día de plantilla → alumno desvinculado e intacto, propagación atómica.
- Repositorio: renumeración en dos pasadas sin violar el unique.
- Migración: verificada sobre copia local de la base (conteos antes/después).

## Deploy

Cambio **no retrocompatible** del formato de respuesta. Vercel publica al pushear; Render requiere Manual Deploy. Decisión aceptada: sin código de compatibilidad; Manual Deploy de Render inmediatamente después del push, asumiendo una ventana de minutos en la que la vista del alumno puede fallar. La migración de Prisma corre antes que el código nuevo de la API.

## Impacto colateral

- `prisma-routines-cleanup.adapter.ts` (cascada de hard-delete de usuarios, HLD §Identity) y el hard-delete de plantillas: el orden de borrado pasa a ser ejercicios → días → instancia/plantilla (o se apoya en los `onDelete: Cascade` nuevos). El `SetNull` de `vinculadoADiaId` reemplaza el rol que cumplía `origenTemplateId` en la cascada de PROFESOR.
- `GetUserDeletionImpactUseCase`: si cuenta ejercicios de rutinas, ajustar la query al nuevo anidamiento.

## Documentación a actualizar

- `docs/hld-mvp.md` §Routines: modelo con días, vínculo por día, regla de vínculo, propagación atómica, endpoints nuevos.
- `docs/prd-mvp.md`: HU-04 (plantilla con días), HU-05 (asignar combinando días), HU-06 (editar/traer día), HU-08 (alumno elige día).

## Fuera de alcance

- Nombre/etiqueta de día.
- Días de la semana fijos o calendario.
- Registro de qué día hizo el alumno / sugerencia del "próximo día" (requiere tracking de progreso, Fase 2).
- Drag & drop de ejercicios entre días.
