# Curación y traducción del catálogo de ejercicios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Curar el catálogo de 1.324 ejercicios a un subconjunto de 58 ejercicios tradicionales de gimnasio, con nombre en español, sin romper la resolución de ejercicios ya usados en rutinas/plantillas reales; traducir también las etiquetas de los filtros (parte del cuerpo, grupo muscular, equipamiento).

**Architecture:** Soft-hide vía columna `Exercise.activo` (default `true`) — `GET /exercises` (listado/`/catalogo`) filtra por `activo: true`; `GET /exercises/:id` y `GET /exercises/by-ids` (usados por rutinas/plantillas) ignoran `activo`, preservando la resolución de ejercicios ya asignados aunque queden fuera de la curación. Un script uso-único aplica la curación (desactiva todo, reactiva + traduce los 58 curados). La taxonomía (parteCuerpo/grupoMuscular/equipamiento) se traduce solo en la capa de presentación del frontend — el valor que viaja en queries/DB sigue siendo el crudo en inglés.

**Tech Stack:** NestJS + Prisma (backend), Next.js App Router (frontend), Jest (ambos).

## Global Constraints

- `findById`/`findByIds` (`GetExerciseUseCase`, `GetExercisesByIdsUseCase`) NUNCA filtran por `activo` — solo `findMany` (alimenta `ListExercisesUseCase`/`GET /exercises`).
- La traducción de taxonomía es presentación pura: el `value` de cada filtro/opción sigue siendo el string crudo en inglés que ya usa el backend (`upper arms`, `body weight`, `pectorals`) — cero cambios en Prisma, en los `where`, ni en los índices.
- El script de curación (`apps/api/prisma/curate-exercises.ts`) es una herramienta uso-único, mismo patrón que `seed-admin.ts`/`seed-exercises.ts` — no se ejecuta en ningún build ni pipeline.
- No se borra ningún ejercicio físicamente.

---

### Task 1: Migración Prisma — columna `Exercise.activo`

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_exercise_activo/migration.sql`

**Interfaces:**

- Produce: columna `Exercise.activo` (`Boolean`, default `true`), índice `@@index([activo])`. Las tasks siguientes la consumen desde `PrismaExerciseRepository`.

- [ ] **Step 1: Agregar el campo al schema**

En `apps/api/prisma/schema.prisma`, dentro de `model Exercise { ... }`, agregar antes de la línea `@@index([gymId])`:

```prisma
  activo                      Boolean        @default(true)
```

Y agregar después de `@@index([equipamiento])`:

```prisma
  @@index([activo])
```

- [ ] **Step 2: Generar la migración (sin aplicar todavía)**

Run: `cd apps/api && npx prisma migrate dev --name add_exercise_activo --create-only`

Esto crea la carpeta `apps/api/prisma/migrations/<timestamp>_add_exercise_activo/` con un `migration.sql` autogenerado. Abrirlo y confirmar que contiene exactamente:

```sql
-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Exercise_activo_idx" ON "Exercise"("activo");
```

Si Prisma generó algo distinto (nombres de índice pueden variar), dejarlo como Prisma lo generó — no hace falta que el SQL sea carácter por carácter igual, solo que agregue la columna con ese default y ese índice.

- [ ] **Step 3: Aplicar la migración contra la DB real**

Run: `cd apps/api && npx prisma migrate deploy`

Expected: `1 migration found... Applying migration \`<timestamp>_add_exercise_activo\`... All migrations have been successfully applied.`

- [ ] **Step 4: Verificar contra la DB real**

Run (desde `apps/api`, usando el mismo patrón de script ad-hoc con Prisma directo que se usó en sesiones anteriores de este proyecto — copiar a un archivo temporal `.tmp.js`, correr con `node`, borrar):

```javascript
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const total = await prisma.exercise.count();
  const activos = await prisma.exercise.count({ where: { activo: true } });
  console.log('Total:', total, '| Activos:', activos);
  await prisma.$disconnect();
}
main();
```

Expected: `Total: 1324 | Activos: 1324` (todos activos por el default, todavía no corrió la curación).

- [ ] **Step 5: Commit**

No comitear sin autorización explícita del usuario — dejar el working tree listo y avisar.

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(exercise-catalog): agrega columna Exercise.activo para curación"
```

---

### Task 2: Filtro `activo` en el listado — sin tocar resolución por ID

**Files:**

- Modify: `apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise.repository.ts:34-53`

**Interfaces:**

- Consume: columna `activo` de Task 1.
- Produce: `findMany` solo devuelve ejercicios con `activo: true`. `findById`/`findByIds` sin cambios — siguen resolviendo cualquier ejercicio.

- [ ] **Step 1: Modificar `findMany`**

En `prisma-exercise.repository.ts`, el método actual es:

```typescript
  async findMany(filter: ListExercisesFilter): Promise<ListExercisesResult> {
    const where: Prisma.ExerciseWhereInput = {
      ...(filter.search ? { nombre: { contains: filter.search, mode: 'insensitive' } } : {}),
      ...(filter.parteCuerpo ? { parteCuerpo: filter.parteCuerpo } : {}),
      ...(filter.equipamiento ? { equipamiento: filter.equipamiento } : {}),
    };
```

Cambiarlo a:

```typescript
  async findMany(filter: ListExercisesFilter): Promise<ListExercisesResult> {
    const where: Prisma.ExerciseWhereInput = {
      activo: true,
      ...(filter.search ? { nombre: { contains: filter.search, mode: 'insensitive' } } : {}),
      ...(filter.parteCuerpo ? { parteCuerpo: filter.parteCuerpo } : {}),
      ...(filter.equipamiento ? { equipamiento: filter.equipamiento } : {}),
    };
```

No tocar `findById` ni `findByIds` — deben quedar exactamente como están.

- [ ] **Step 2: Verificar que `ListExercisesUseCase.spec.ts` sigue pasando sin cambios**

El filtro `activo` vive solo en el repositorio Prisma, no en `ListExercisesUseCase` (que recibe un `ExerciseRepositoryPort` mockeado en sus tests) — no requiere ningún cambio en ese spec.

Run: `cd apps/api && pnpm test -- list-exercises.use-case`
Expected: los 3 tests existentes siguen en verde, sin modificar el archivo.

- [ ] **Step 3: Actualizar el e2e de `/exercises` para cubrir el filtro**

En `apps/api/src/exercise-catalog/infrastructure/http/exercises.e2e.spec.ts`, el `fakeExerciseRepository` usa un mock de `findMany` — no ejercita el `where` real de Prisma (ese repo no se prueba ahí, se prueba con Prisma real solo vía verificación manual, igual que el resto de los repositorios Prisma de este proyecto — no hay convención de `*.repository.spec.ts` en el repo). No se agrega ningún test nuevo acá; la verificación real contra la DB real queda en el Step 4 de esta task.

- [ ] **Step 4: Verificar manualmente contra la DB real**

Insertar temporalmente un registro de prueba con `activo: false` y confirmar que `GET /exercises` no lo devuelve pero `GET /exercises/:id` sí. Usar el mismo patrón de script `.tmp.js` de la Task 1 — algo como:

```javascript
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const testId = 'test-activo-check-' + Date.now();
  await prisma.exercise.create({
    data: {
      id: testId,
      nombre: 'Test Oculto',
      parteCuerpo: 'chest',
      grupoMuscular: 'pectorals',
      activo: false,
    },
  });
  // Mismo `where` que PrismaExerciseRepository.findMany tras el cambio del Step 1.
  const enListado = await prisma.exercise.findMany({
    where: { activo: true, nombre: { contains: 'Test Oculto' } },
  });
  console.log('Aparece en listado (debe ser 0):', enListado.length);
  const porId = await prisma.exercise.findUnique({ where: { id: testId } });
  console.log('Resuelve por ID (debe existir):', porId !== null);
  await prisma.exercise.delete({ where: { id: testId } });
  await prisma.$disconnect();
}
main();
```

Expected: `Aparece en listado (debe ser 0): 0` y `Resuelve por ID (debe existir): true`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/exercise-catalog/infrastructure/persistence/prisma-exercise.repository.ts
git commit -m "feat(exercise-catalog): GET /exercises filtra por activo, by-id sin cambios"
```

---

### Task 3: Curación real — script + datos + aplicación

**Files:**

- Create: `apps/api/prisma/exercise-curation.json`
- Create: `apps/api/prisma/curate-exercises.ts`

**Interfaces:**

- Consume: columna `activo` de Task 1.
- Produce: al terminar esta task, la DB real tiene exactamente 58 ejercicios `activo: true` (los del JSON, con `nombre` en español) y 1.266 con `activo: false`.

- [ ] **Step 1: Crear el JSON de curación**

Crear `apps/api/prisma/exercise-curation.json` con exactamente este contenido (58 ejercicios, IDs verificados contra la DB real de este proyecto, aprobados por el usuario):

```json
[
  { "id": "023f84cc-50ab-49f1-b211-326ca3ff79bd", "nombreEs": "Press de banca con barra" },
  { "id": "7e075eda-1449-4ccf-8063-2debb8347792", "nombreEs": "Press de banca con mancuernas" },
  {
    "id": "1549d8cf-2a2e-4f3f-9358-16a2c3586b28",
    "nombreEs": "Press de banca inclinado con barra"
  },
  {
    "id": "ca6ee991-90d5-47f1-8722-71e43a4d7aaa",
    "nombreEs": "Press de banca inclinado con mancuernas"
  },
  { "id": "e8a9dd67-880f-4094-91bd-a0db002fd192", "nombreEs": "Sentadilla con barra" },
  { "id": "9d5d4b27-c409-4469-a693-e30c64535860", "nombreEs": "Sentadilla con mancuernas" },
  { "id": "be0c1664-9f14-4c1b-a993-c3ac24026ee9", "nombreEs": "Sentadilla goblet con mancuerna" },
  { "id": "d78974fb-4802-4a71-9784-7864dfbf4c3c", "nombreEs": "Sentadilla frontal con barra" },
  { "id": "15465013-d620-400d-979c-6533884ccb1c", "nombreEs": "Peso muerto con barra" },
  { "id": "7c77f880-812a-4117-ada5-70511b148d50", "nombreEs": "Peso muerto rumano con barra" },
  { "id": "bf080c73-f3ce-4249-9cc0-1798a2f4fadc", "nombreEs": "Peso muerto rumano con mancuernas" },
  { "id": "05ad201a-9c06-4326-a947-9f773b4840cb", "nombreEs": "Peso muerto sumo con barra" },
  { "id": "415f36e5-23dc-4c92-9483-5adb6e20ccdc", "nombreEs": "Dominadas (agarre neutro)" },
  { "id": "21e6531b-ec04-4690-b978-24e7b8b0a6b8", "nombreEs": "Jalón al pecho en polea" },
  { "id": "e065e9f2-7b97-4a47-8505-f7114a474254", "nombreEs": "Remo sentado en polea" },
  { "id": "58f765c7-0459-4f84-a1c6-62098fd61592", "nombreEs": "Remo con barra" },
  { "id": "787cb75a-1fdb-4e1a-a029-e918781d4dc5", "nombreEs": "Remo con mancuerna" },
  { "id": "c8157a3c-02ea-402c-8ec3-be13666f5b49", "nombreEs": "Press militar con barra" },
  {
    "id": "6a72aabe-2b6d-4d20-b54a-61e06b183cb4",
    "nombreEs": "Press militar con mancuernas de pie"
  },
  {
    "id": "9f57d4f0-c4f1-4f26-ae58-8735c5d76d30",
    "nombreEs": "Press de hombros con mancuernas sentado"
  },
  { "id": "559e9b1a-1102-4711-a252-3ff75ba5dfe7", "nombreEs": "Press de hombros en máquina" },
  {
    "id": "1630157d-46a8-4fac-a921-e12e4c653329",
    "nombreEs": "Elevaciones laterales con mancuernas"
  },
  { "id": "f2f01cfe-07a5-4c49-92e6-fc2a7e3df221", "nombreEs": "Elevaciones laterales en polea" },
  {
    "id": "1c613fee-fe84-47f5-a45d-ed1b5ef73d1b",
    "nombreEs": "Elevaciones frontales con mancuernas"
  },
  {
    "id": "e7c02129-dd3f-4ab8-9c84-bbeb71472ae7",
    "nombreEs": "Pájaros (deltoide posterior) con mancuernas"
  },
  {
    "id": "ec84969d-d76d-4de0-aa7e-c9ec2b3d0d60",
    "nombreEs": "Encogimientos de hombros con barra (trapecio)"
  },
  {
    "id": "c44850c8-0f2e-4759-af72-4ac411f893ae",
    "nombreEs": "Encogimientos de hombros con mancuernas (trapecio)"
  },
  { "id": "426d4d42-9ce2-40ad-8f8e-aa9d3c77782d", "nombreEs": "Curl de bíceps con barra" },
  { "id": "8666c694-6958-4acc-a022-1bac88e0d43d", "nombreEs": "Curl de bíceps con mancuerna" },
  { "id": "ec05774d-ae3e-4768-90c9-39c8ceeb788f", "nombreEs": "Curl martillo con mancuerna" },
  {
    "id": "9e010d6e-1a0c-401c-ab1c-c7e30120c831",
    "nombreEs": "Curl de bíceps en banco Scott (predicador)"
  },
  { "id": "c7efcabe-e22d-4f9e-b9b5-309b01b6eaf6", "nombreEs": "Curl de bíceps en polea" },
  {
    "id": "fb76c76a-b9b0-4932-9db0-86619f604862",
    "nombreEs": "Extensión de tríceps en polea (jalón)"
  },
  {
    "id": "ccc09b66-37fd-4d12-83b3-d1d364b44ae4",
    "nombreEs": "Press francés con barra (extensión de tríceps acostado)"
  },
  { "id": "a268d1c0-3795-49f8-b2dd-ced4dc4094d0", "nombreEs": "Fondos de pecho (dips)" },
  { "id": "f8b7cf1e-38cf-4ceb-8329-ec57c94e8bd4", "nombreEs": "Aperturas con mancuerna" },
  { "id": "c27d1eb7-0cc0-4345-aae6-6670698e127b", "nombreEs": "Aperturas inclinadas en polea" },
  { "id": "eaed8c45-e846-46e5-8a3c-c0365632f4f4", "nombreEs": "Prensa de piernas" },
  {
    "id": "05753dcf-af55-4c74-aaac-4e7edbe0afb3",
    "nombreEs": "Prensa de piernas en máquina Smith"
  },
  {
    "id": "481e27a1-672e-4d4e-bcb7-3e0c753d5186",
    "nombreEs": "Extensión de cuádriceps en máquina"
  },
  { "id": "644a16ac-408e-40c6-ac44-a8fadae0fd67", "nombreEs": "Curl femoral acostado en máquina" },
  { "id": "3cd48637-7d30-4091-af52-ed67d4661a62", "nombreEs": "Curl femoral sentado en máquina" },
  { "id": "bb26782b-9a72-4379-b89c-28dc42eb53b1", "nombreEs": "Zancadas con barra" },
  {
    "id": "f676dee1-d3b2-44d0-b071-a24a376da4c1",
    "nombreEs": "Zancada búlgara con barra (pierna dividida)"
  },
  {
    "id": "bf931732-8e7d-4746-bba7-aba952ef2166",
    "nombreEs": "Zancada búlgara con mancuernas (pierna dividida)"
  },
  { "id": "73ae39ed-726a-48b0-a3e4-5b1751417cf2", "nombreEs": "Subida al cajón con barra" },
  { "id": "bdfba980-8efe-4666-a6ac-962c2efbbdfd", "nombreEs": "Subida al cajón con mancuernas" },
  {
    "id": "c1897659-8d36-4ce2-b120-6b5ee5b800b3",
    "nombreEs": "Elevación de talones de pie con barra"
  },
  {
    "id": "e08ca55c-1003-416e-a207-da4b627f9985",
    "nombreEs": "Elevación de talones de pie con mancuerna"
  },
  {
    "id": "1caa75a3-0e63-4682-8ecb-004bca672338",
    "nombreEs": "Elevación de talones sentado con barra"
  },
  {
    "id": "11502b70-2364-4e4f-815a-4d0fdb82a201",
    "nombreEs": "Puente de glúteos con barra (hip thrust)"
  },
  { "id": "5b9b7b90-b60f-4ea8-a891-a496945c9d8c", "nombreEs": "Puente de glúteos sin peso" },
  { "id": "98014829-40c2-4774-8cb1-76321955fd47", "nombreEs": "Abdominales (crunch) en el piso" },
  { "id": "b4d25d12-e6e7-46f7-82ae-e9f6b7dc331e", "nombreEs": "Elevación de piernas colgado" },
  { "id": "76e836be-5f8a-4b9c-b8b2-3ebbc31c2221", "nombreEs": "Giro ruso (russian twist)" },
  { "id": "9d72a5cf-73d0-4bd6-be2a-949d2d7965aa", "nombreEs": "Burpee" },
  { "id": "4c4fb363-ec60-4ba2-92ab-74580e9e0769", "nombreEs": "Escaladores (mountain climber)" },
  { "id": "7707788f-8f27-4e87-b612-d011c96cbc0e", "nombreEs": "Thruster con barra" }
]
```

- [ ] **Step 2: Escribir el script de curación**

Crear `apps/api/prisma/curate-exercises.ts`:

```typescript
/**
 * Uso único — cura el catálogo de ejercicios a la lista tradicional
 * aprobada en docs/superpowers/specs/2026-09-13-exercise-catalog-curation-design.md.
 * No forma parte del build ni de ningún pipeline, igual que seed-admin.ts.
 *
 * Uso:
 *   npx tsx prisma/curate-exercises.ts --dry-run   (no escribe nada, solo imprime)
 *   npx tsx prisma/curate-exercises.ts             (aplica de verdad)
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import curados from './exercise-curation.json';

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const idsAConservar = curados.map((c) => c.id);
  const totalAntes = await prisma.exercise.count();
  const activosAntes = await prisma.exercise.count({ where: { activo: true } });

  console.log(`Catálogo actual: ${totalAntes} ejercicios, ${activosAntes} activos.`);
  console.log(`Lista curada: ${idsAConservar.length} ejercicios.`);

  const existentes = await prisma.exercise.findMany({
    where: { id: { in: idsAConservar } },
    select: { id: true, nombre: true },
  });
  const idsExistentes = new Set(existentes.map((e) => e.id));
  const faltantes = idsAConservar.filter((id) => !idsExistentes.has(id));
  if (faltantes.length > 0) {
    console.error('ERROR: estos IDs de la curación no existen en la DB:', faltantes);
    process.exit(1);
  }

  console.log('\n--- Plan de cambios ---');
  for (const c of curados) {
    const actual = existentes.find((e) => e.id === c.id)!;
    console.log(`ACTIVAR: "${actual.nombre}" -> "${c.nombreEs}"`);
  }
  console.log(`\nEl resto (${totalAntes - idsAConservar.length}) quedan con activo=false.`);

  if (dryRun) {
    console.log('\n[--dry-run] No se escribió nada.');
    await prisma.$disconnect();
    return;
  }

  await prisma.exercise.updateMany({ data: { activo: false } });
  for (const c of curados) {
    await prisma.exercise.update({
      where: { id: c.id },
      data: { activo: true, nombre: c.nombreEs },
    });
  }

  const activosDespues = await prisma.exercise.count({ where: { activo: true } });
  console.log(
    `\nListo. Ejercicios activos ahora: ${activosDespues} (esperado: ${idsAConservar.length}).`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
```

`resolveJsonModule` ya está en `true` en `tsconfig.base.json` (heredado por `apps/api/tsconfig.json`) — confirmado, no requiere cambios. El `import curados from './exercise-curation.json'` funciona sin configuración adicional.

- [ ] **Step 3: Correr en modo dry-run y mostrar la salida al usuario**

Run: `cd apps/api && npx tsx prisma/curate-exercises.ts --dry-run`

Expected: imprime las 58 líneas `ACTIVAR: "<nombre original>" -> "<nombre español>"`, confirma que no hay IDs faltantes, y termina con `[--dry-run] No se escribió nada.`

**No seguir al Step 4 sin que el usuario confirme explícitamente que revisó esta salida.**

- [ ] **Step 4: Correr en modo real (con autorización explícita del usuario)**

Run: `cd apps/api && npx tsx prisma/curate-exercises.ts`

Expected: `Listo. Ejercicios activos ahora: 58 (esperado: 58).`

- [ ] **Step 5: Verificar el caso crítico — el ejercicio ya usado en una rutina real**

`barbell bench press` (id `023f84cc-50ab-49f1-b211-326ca3ff79bd`) está en la lista curada, así que este caso en particular queda activo de todos modos — pero verificar igual que la resolución por ID sigue funcionando (regresión general del mecanismo, no específica de este ID):

```bash
curl -s "https://app-gimnasio.onrender.com/exercises/by-ids?ids=023f84cc-50ab-49f1-b211-326ca3ff79bd" \
  -H "Authorization: Bearer <token real>"
```

Expected: devuelve el ejercicio con `nombre: "Press de banca con barra"` (ya traducido, porque además de seguir resolviendo por ID, este quedó activo).

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/exercise-curation.json apps/api/prisma/curate-exercises.ts
git commit -m "feat(exercise-catalog): script de curación + lista de 58 ejercicios tradicionales"
```

(El commit registra el script y los datos — la aplicación real contra la DB de producción del Step 4 no es un cambio de código, ya se hizo antes de este commit.)

---

### Task 4: Tablas de traducción de taxonomía (57 valores) + test de cobertura

**Files:**

- Modify: `apps/web/lib/region-colors.ts`
- Modify: `apps/web/lib/equipment-options.ts`
- Create: `apps/web/lib/muscle-group-options.ts`
- Create: `apps/web/lib/exercise-taxonomy-labels.spec.ts`

**Interfaces:**

- Produce: `ETIQUETA_PARTE_CUERPO`, `ETIQUETA_EQUIPAMIENTO`, `GRUPOS_MUSCULARES`, `ETIQUETA_GRUPO_MUSCULAR` — Task 5 los consume.

- [ ] **Step 1: Agregar `ETIQUETA_PARTE_CUERPO` a `region-colors.ts`**

Agregar al final de `apps/web/lib/region-colors.ts`:

```typescript
export const ETIQUETA_PARTE_CUERPO: Record<string, string> = {
  chest: 'Pecho',
  back: 'Espalda',
  shoulders: 'Hombros',
  'upper arms': 'Brazos (superior)',
  'lower arms': 'Antebrazos',
  waist: 'Core / abdomen',
  'upper legs': 'Piernas (superior)',
  'lower legs': 'Piernas (inferior)',
  cardio: 'Cardio',
  neck: 'Cuello',
};
```

- [ ] **Step 2: Agregar `ETIQUETA_EQUIPAMIENTO` a `equipment-options.ts`**

Agregar al final de `apps/web/lib/equipment-options.ts`:

```typescript
export const ETIQUETA_EQUIPAMIENTO: Record<string, string> = {
  assisted: 'Asistido',
  band: 'Banda elástica',
  barbell: 'Barra',
  'body weight': 'Peso corporal',
  'bosu ball': 'Bosu',
  cable: 'Polea',
  dumbbell: 'Mancuerna',
  'elliptical machine': 'Elíptica',
  'ez barbell': 'Barra Z',
  hammer: 'Máquina hammer',
  kettlebell: 'Kettlebell',
  'leverage machine': 'Máquina de palanca',
  'medicine ball': 'Balón medicinal',
  'olympic barbell': 'Barra olímpica',
  'resistance band': 'Banda de resistencia',
  roller: 'Rodillo',
  rope: 'Cuerda',
  'skierg machine': 'Máquina de esquí (SkiErg)',
  'sled machine': 'Trineo',
  'smith machine': 'Máquina Smith',
  'stability ball': 'Pelota de estabilidad',
  'stationary bike': 'Bicicleta fija',
  'stepmill machine': 'Escaladora',
  tire: 'Neumático',
  'trap bar': 'Barra hexagonal',
  'upper body ergometer': 'Ergómetro de brazos',
  weighted: 'Con peso adicional',
  'wheel roller': 'Rueda abdominal',
};
```

- [ ] **Step 3: Crear `muscle-group-options.ts`**

Crear `apps/web/lib/muscle-group-options.ts`:

```typescript
/**
 * Los 19 valores reales de `grupoMuscular` en el catálogo (verificados
 * contra la DB real) — universo cerrado, mismo patrón que PARTES_CUERPO
 * y EQUIPAMIENTOS.
 */
export const GRUPOS_MUSCULARES = [
  'abductors',
  'abs',
  'adductors',
  'biceps',
  'calves',
  'cardiovascular system',
  'delts',
  'forearms',
  'glutes',
  'hamstrings',
  'lats',
  'levator scapulae',
  'pectorals',
  'quads',
  'serratus anterior',
  'spine',
  'traps',
  'triceps',
  'upper back',
].sort();

export const ETIQUETA_GRUPO_MUSCULAR: Record<string, string> = {
  abductors: 'Abductores',
  abs: 'Abdominales',
  adductors: 'Aductores',
  biceps: 'Bíceps',
  calves: 'Pantorrillas',
  'cardiovascular system': 'Sistema cardiovascular',
  delts: 'Deltoides',
  forearms: 'Antebrazos',
  glutes: 'Glúteos',
  hamstrings: 'Isquiotibiales',
  lats: 'Dorsales',
  'levator scapulae': 'Elevador de la escápula',
  pectorals: 'Pectorales',
  quads: 'Cuádriceps',
  'serratus anterior': 'Serrato anterior',
  spine: 'Espalda baja / columna',
  traps: 'Trapecios',
  triceps: 'Tríceps',
  'upper back': 'Espalda alta',
};
```

- [ ] **Step 4: Test de cobertura**

Crear `apps/web/lib/exercise-taxonomy-labels.spec.ts`:

```typescript
import { PARTES_CUERPO, ETIQUETA_PARTE_CUERPO } from './region-colors';
import { EQUIPAMIENTOS, ETIQUETA_EQUIPAMIENTO } from './equipment-options';
import { GRUPOS_MUSCULARES, ETIQUETA_GRUPO_MUSCULAR } from './muscle-group-options';

describe('tablas de traducción de taxonomía', () => {
  it('ETIQUETA_PARTE_CUERPO cubre exactamente los 10 valores de PARTES_CUERPO', () => {
    expect(Object.keys(ETIQUETA_PARTE_CUERPO).sort()).toEqual([...PARTES_CUERPO].sort());
  });

  it('ETIQUETA_EQUIPAMIENTO cubre exactamente los 28 valores de EQUIPAMIENTOS', () => {
    expect(Object.keys(ETIQUETA_EQUIPAMIENTO).sort()).toEqual([...EQUIPAMIENTOS].sort());
  });

  it('ETIQUETA_GRUPO_MUSCULAR cubre exactamente los 19 valores de GRUPOS_MUSCULARES', () => {
    expect(Object.keys(ETIQUETA_GRUPO_MUSCULAR).sort()).toEqual([...GRUPOS_MUSCULARES].sort());
  });
});
```

- [ ] **Step 5: Correr el test**

Run: `cd apps/web && pnpm test -- exercise-taxonomy-labels`
Expected: 3 tests en verde.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/region-colors.ts apps/web/lib/equipment-options.ts apps/web/lib/muscle-group-options.ts apps/web/lib/exercise-taxonomy-labels.spec.ts
git commit -m "feat(web): tablas de traducción de parteCuerpo/equipamiento/grupoMuscular"
```

---

### Task 5: Usar las etiquetas traducidas en `/catalogo` y `/catalogo/[id]`

**Files:**

- Modify: `apps/web/app/(catalogo)/catalogo/page.tsx`
- Modify: `apps/web/app/(catalogo)/catalogo/[id]/page.tsx`

**Interfaces:**

- Consume: `ETIQUETA_PARTE_CUERPO`, `ETIQUETA_EQUIPAMIENTO`, `ETIQUETA_GRUPO_MUSCULAR` de Task 4.

- [ ] **Step 1: Filtro de parte del cuerpo (chips) en `catalogo/page.tsx`**

Cambiar el import:

```typescript
import { PARTES_CUERPO } from '../../../lib/region-colors';
```

por:

```typescript
import { PARTES_CUERPO, ETIQUETA_PARTE_CUERPO } from '../../../lib/region-colors';
```

Y en el JSX, cambiar:

```tsx
{
  PARTES_CUERPO.map((parte) => (
    <button
      key={parte}
      type="button"
      onClick={() => setParteCuerpo(parte)}
      className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium capitalize ${
        parteCuerpo === parte
          ? 'border-accent bg-accent text-accent-fg'
          : 'border-border bg-surface text-text'
      }`}
    >
      {parte}
    </button>
  ));
}
```

por (quitar `capitalize`, ya no hace falta — las etiquetas ya vienen bien capitalizadas):

```tsx
{
  PARTES_CUERPO.map((parte) => (
    <button
      key={parte}
      type="button"
      onClick={() => setParteCuerpo(parte)}
      className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium ${
        parteCuerpo === parte
          ? 'border-accent bg-accent text-accent-fg'
          : 'border-border bg-surface text-text'
      }`}
    >
      {ETIQUETA_PARTE_CUERPO[parte]}
    </button>
  ));
}
```

- [ ] **Step 2: Filtro de equipamiento (select) en `catalogo/page.tsx`**

Cambiar el import:

```typescript
import { EQUIPAMIENTOS } from '../../../lib/equipment-options';
```

por:

```typescript
import { EQUIPAMIENTOS, ETIQUETA_EQUIPAMIENTO } from '../../../lib/equipment-options';
```

Y en el JSX, cambiar:

```tsx
<select
  value={equipamiento}
  onChange={(e) => setEquipamiento(e.target.value)}
  className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base capitalize text-text"
>
  <option value="">Cualquier equipamiento</option>
  {EQUIPAMIENTOS.map((eq) => (
    <option key={eq} value={eq} className="capitalize">
      {eq}
    </option>
  ))}
</select>
```

por:

```tsx
<select
  value={equipamiento}
  onChange={(e) => setEquipamiento(e.target.value)}
  className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base text-text"
>
  <option value="">Cualquier equipamiento</option>
  {EQUIPAMIENTOS.map((eq) => (
    <option key={eq} value={eq}>
      {ETIQUETA_EQUIPAMIENTO[eq]}
    </option>
  ))}
</select>
```

- [ ] **Step 3: Detalle de ejercicio en `catalogo/[id]/page.tsx`**

Agregar el import (junto a los existentes):

```typescript
import { ETIQUETA_PARTE_CUERPO } from '../../../../lib/region-colors';
import { ETIQUETA_GRUPO_MUSCULAR } from '../../../../lib/muscle-group-options';
```

Cambiar el bloque del `<dl>`:

```tsx
            <div>
              <dt className="text-text-muted">Región</dt>
              <dd className="capitalize text-text">{ejercicio.parteCuerpo}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Músculo</dt>
              <dd className="capitalize text-text">{ejercicio.grupoMuscular}</dd>
            </div>
```

por:

```tsx
            <div>
              <dt className="text-text-muted">Región</dt>
              <dd className="text-text">
                {ETIQUETA_PARTE_CUERPO[ejercicio.parteCuerpo] ?? ejercicio.parteCuerpo}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Músculo</dt>
              <dd className="text-text">
                {ETIQUETA_GRUPO_MUSCULAR[ejercicio.grupoMuscular] ?? ejercicio.grupoMuscular}
              </dd>
            </div>
```

(Fallback al valor crudo con `??` acá sí tiene sentido — a diferencia de los filtros, que iteran sobre un universo cerrado ya cubierto por el test de Task 4, acá el valor viene de datos reales de un ejercicio específico; el fallback es una red de seguridad, no se espera que dispare nunca.)

Y el bloque de músculos secundarios:

```tsx
{
  ejercicio.gruposMuscularesSecundarios.length > 0 && (
    <div>
      <dt className="text-text-muted">Músculos secundarios</dt>
      <dd className="capitalize text-text">{ejercicio.gruposMuscularesSecundarios.join(', ')}</dd>
    </div>
  );
}
```

por:

```tsx
{
  ejercicio.gruposMuscularesSecundarios.length > 0 && (
    <div>
      <dt className="text-text-muted">Músculos secundarios</dt>
      <dd className="text-text">
        {ejercicio.gruposMuscularesSecundarios
          .map((g) => ETIQUETA_GRUPO_MUSCULAR[g] ?? g)
          .join(', ')}
      </dd>
    </div>
  );
}
```

- [ ] **Step 4: Build + lint**

Run: `cd apps/web && npx eslint "app/(catalogo)/catalogo/page.tsx" "app/(catalogo)/catalogo/[id]/page.tsx" --fix && pnpm build`
Expected: build limpio, sin errores de tipos ni lint.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(catalogo)/catalogo/page.tsx" "apps/web/app/(catalogo)/catalogo/[id]/page.tsx"
git commit -m "feat(web): usa las etiquetas traducidas en filtros y detalle de /catalogo"
```

---

### Task 6: Smoke test final contra producción

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Confirmar el tamaño del catálogo real**

```bash
curl -s "https://app-gimnasio.onrender.com/exercises?limit=1" -H "Authorization: Bearer <token real>"
```

Expected: campo `total` del JSON de respuesta es `58`.

- [ ] **Step 2: Confirmar nombres en español en un listado real**

```bash
curl -s "https://app-gimnasio.onrender.com/exercises?limit=10" -H "Authorization: Bearer <token real>"
```

Expected: todos los `nombre` del array `items` están en español.

- [ ] **Step 3: Smoke test visual en `/catalogo`**

Abrir `https://mixentrenamiento.vercel.app/catalogo` logueado, confirmar:

- La cantidad de tarjetas/resultados bajó al tamaño curado (58, paginado).
- Los chips de parte del cuerpo y el select de equipamiento muestran etiquetas en español.
- Entrar al detalle de un ejercicio: región/músculo en español.

- [ ] **Step 4: Confirmar que el ejercicio real ya usado sigue andando**

Entrar como el ADMIN/PROFESOR real a la plantilla que usa `barbell bench press` (ahora "Press de banca con barra") y confirmar que se sigue viendo bien (nombre e imagen), sin "(ejercicio no encontrado)".
