# Rediseño visual oscuro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adoptar en toda la app un tema oscuro fijo (sin modo claro) con tarjetas redondeadas, thumbnails circulares y badges tipo cápsula, según la referencia visual aprobada, con componentes de UI compartidos reutilizables.

**Architecture:** Reemplazo de la paleta de tokens CSS (un solo `:root`, sin bloque `.dark`), eliminación del mecanismo de alternancia de tema, 4 componentes UI genéricos nuevos (`Card`, `Pill`, `GradientIcon`, `PageHeader`) en `apps/web/components/ui/`, aplicados página por página sin cambiar ninguna lógica de negocio existente.

**Tech Stack:** Next.js App Router, Tailwind CSS, Lucide icons.

## Global Constraints

- Un solo tema oscuro fijo — no queda ningún mecanismo de alternancia claro/oscuro en el código.
- `--color-accent`/`--color-accent-fg` (planos, ya usados en 11+ archivos vía `bg-accent`/`text-accent-fg`/`border-accent`/`text-accent`) se mantienen — no se tocan sus consumidores existentes, solo cambia el valor del token.
- `--color-accent-from`/`--color-accent-to` son variables CSS nuevas, exclusivas para el gradiente de `GradientIcon` — no se exponen como clases de Tailwind, se usan vía `style={{ background: 'linear-gradient(...)' }}`.
- Contraste WCAG AA (≥4.5:1) ya verificado matemáticamente para todos los pares texto/fondo de la paleta nueva — no hace falta re-verificar salvo que se cambie algún valor durante la implementación (si se cambia, recalcular).
- No se modifica ninguna lógica de negocio, fetch, ni comportamiento — solo estructura visual (JSX/clases), en todas las tasks.

---

### Task 1: Paleta de tokens — reemplazo completo

**Files:**

- Modify: `apps/web/app/tokens.css`
- Modify: `apps/web/tailwind.config.ts`

**Interfaces:**

- Produce: tokens `--color-surface`, `--color-surface-alt`, `--color-text`, `--color-text-muted`, `--color-border`, `--color-accent`, `--color-accent-fg`, `--color-accent-from`, `--color-accent-to`, `--color-danger`, `--color-success`, `--color-region-*` (sin cambios estos últimos). Las tasks 3-8 consumen estos tokens.

- [ ] **Step 1: Reemplazar `tokens.css`**

Reemplazar el contenido completo de `apps/web/app/tokens.css` por:

```css
:root {
  --color-surface: 13 13 20;
  --color-surface-alt: 24 24 35;
  --color-text: 245 245 250;
  --color-text-muted: 140 140 155;
  --color-border: 45 45 60;
  --color-accent: 50 110 209;
  --color-accent-fg: 255 255 255;
  --color-accent-from: 132 87 233;
  --color-accent-to: 50 110 209;
  --color-danger: 248 113 113;
  --color-success: 74 222 128;

  --color-region-chest: 220 38 38;
  --color-region-back: 37 99 235;
  --color-region-shoulders: 217 119 6;
  --color-region-upper-arms: 124 58 237;
  --color-region-lower-arms: 168 85 247;
  --color-region-waist: 5 150 105;
  --color-region-upper-legs: 8 145 178;
  --color-region-lower-legs: 13 148 136;
  --color-region-cardio: 219 39 119;
  --color-region-neck: 120 113 108;
}
```

(Los valores `--color-region-*` son idénticos a los que ya existían — no cambian. `--color-accent` queda igual a `--color-accent-to`, a propósito: es el mismo azul que ya pasa contraste AA, reusado como acento sólido para botones/links existentes.)

- [ ] **Step 2: Quitar `darkMode` de `tailwind.config.ts`**

En `apps/web/tailwind.config.ts`, quitar la línea:

```typescript
  darkMode: 'class',
```

Ya no hace falta — no existe más la clase `.dark` en ningún lado del CSS ni del código (se elimina en la Task 2).

- [ ] **Step 3: Build**

Run: `cd apps/web && pnpm build`
Expected: build limpio (los estilos cambian de valor pero ninguna clase de Tailwind desaparece).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/tokens.css apps/web/tailwind.config.ts
git commit -m "feat(web): paleta de tokens oscura fija (rediseño visual)"
```

---

### Task 2: Eliminar el mecanismo de tema claro/oscuro

**Files:**

- Delete: `apps/web/components/theme-toggle.tsx`
- Modify: `apps/web/app/layout.tsx`

**Interfaces:**

- Consume: paleta única de Task 1 (ya no hay `.dark` que alternar).

- [ ] **Step 1: Borrar el componente**

```bash
rm apps/web/components/theme-toggle.tsx
```

- [ ] **Step 2: Reescribir `layout.tsx`**

Reemplazar el contenido completo de `apps/web/app/layout.tsx` por:

```tsx
import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'App Gimnasio',
  description: 'Gestión de rutinas de gimnasio',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-surface text-text">{children}</body>
    </html>
  );
}
```

(Se quita el `<script>` anti-flash de tema — ya no hay flash posible, el tema es fijo — y el `<div>` que envolvía `<ThemeToggle />`.)

- [ ] **Step 3: Verificar que no queda ninguna referencia rota**

Run: `cd apps/web && grep -rn "ThemeToggle\|theme-toggle\|app-gimnasio-theme" app components lib`
Expected: sin resultados (0 matches).

- [ ] **Step 4: Build**

Run: `cd apps/web && pnpm build`
Expected: build limpio.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/components/theme-toggle.tsx apps/web/app/layout.tsx
git commit -m "feat(web): elimina el mecanismo de tema claro/oscuro"
```

---

### Task 3: Componentes UI compartidos nuevos

**Files:**

- Create: `apps/web/components/ui/card.tsx`
- Create: `apps/web/components/ui/pill.tsx`
- Create: `apps/web/components/ui/gradient-icon.tsx`
- Create: `apps/web/components/ui/page-header.tsx`

**Interfaces:**

- Consume: tokens de Task 1 (`surface-alt`, `border`, `text-muted`, `accent-from`, `accent-to`, `accent-fg`, `text`).
- Produce: `Card`, `Pill`, `GradientIcon`, `PageHeader` — las Tasks 4-8 los importan.

- [ ] **Step 1: `card.tsx`**

```tsx
import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-surface-alt p-4 ${className}`}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: `pill.tsx`**

```tsx
import type { ReactNode } from 'react';

export function Pill({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-muted ${className}`}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 3: `gradient-icon.tsx`**

```tsx
import type { LucideIcon } from 'lucide-react';

export function GradientIcon({ icon: Icon, size = 24 }: { icon: LucideIcon; size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full"
      style={{
        width: size * 1.8,
        height: size * 1.8,
        background:
          'linear-gradient(135deg, rgb(var(--color-accent-from)), rgb(var(--color-accent-to)))',
      }}
    >
      <Icon size={size} className="text-accent-fg" aria-hidden />
    </div>
  );
}
```

- [ ] **Step 4: `page-header.tsx`**

```tsx
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-11">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-text"
          >
            <ArrowLeft size={22} aria-hidden />
          </button>
        )}
      </div>
      <h1 className="flex-1 text-center text-base font-semibold text-text">{title}</h1>
      <div className="min-w-11">{right}</div>
    </div>
  );
}
```

- [ ] **Step 5: Build + lint**

Run: `cd apps/web && npx eslint components/ui/*.tsx --fix && pnpm build`
Expected: build limpio, sin errores de tipos (estos 4 componentes todavía no se usan en ningún lado, pero deben compilar solos).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/ui/
git commit -m "feat(web): componentes UI compartidos (Card, Pill, GradientIcon, PageHeader)"
```

---

### Task 4: Restyle de `ExerciseCard`

**Files:**

- Modify: `apps/web/components/exercise-card.tsx`

**Interfaces:**

- Consume: `Card`, `Pill`, `GradientIcon` de Task 3.
- Produce: sin cambios en `ExerciseCardData` (misma interfaz) — Tasks 5, 7 siguen consumiendo `ExerciseCard` igual que hoy, solo cambia su render interno.

- [ ] **Step 1: Reescribir el componente**

Reemplazar el contenido completo de `apps/web/components/exercise-card.tsx` por:

```tsx
import Image from 'next/image';
import { Dumbbell } from 'lucide-react';
import { ETIQUETA_PARTE_CUERPO, regionColorVar } from '../lib/region-colors';
import { ETIQUETA_EQUIPAMIENTO } from '../lib/equipment-options';
import { Card } from './ui/card';
import { Pill } from './ui/pill';
import { GradientIcon } from './ui/gradient-icon';

export interface ExerciseCardData {
  id: string;
  nombre: string;
  imageUrl: string | null;
  parteCuerpo: string;
  equipamiento: string | null;
}

/**
 * La imagen es el elemento visual central de la card (HU-09 / pedido
 * explícito) — nunca un espacio roto: si imageUrl viene null, ícono
 * genérico de fallback. Sin GIF acá a propósito (ver Global Constraints
 * del plan) — el GIF es exclusivo del detalle.
 */
export function ExerciseCard({ ejercicio }: { ejercicio: ExerciseCardData }) {
  return (
    <Card className="flex flex-col gap-3 overflow-visible p-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-full bg-surface">
        {ejercicio.imageUrl ? (
          <Image
            src={ejercicio.imageUrl}
            alt={ejercicio.nombre}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <GradientIcon icon={Dumbbell} size={32} />
          </div>
        )}
        <span
          className="absolute left-1 top-1 rounded-full px-2 py-1 text-xs font-medium text-white"
          style={{ backgroundColor: regionColorVar(ejercicio.parteCuerpo) }}
        >
          {ETIQUETA_PARTE_CUERPO[ejercicio.parteCuerpo] ?? ejercicio.parteCuerpo}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="line-clamp-2 text-sm font-medium text-text">{ejercicio.nombre}</h3>
        {ejercicio.equipamiento && (
          <Pill className="self-start">
            {ETIQUETA_EQUIPAMIENTO[ejercicio.equipamiento] ?? ejercicio.equipamiento}
          </Pill>
        )}
      </div>
    </Card>
  );
}
```

(`overflow-visible` en el `Card` porque el badge de región (`absolute left-1 top-1`) queda dentro del círculo de imagen, no se recorta — el círculo interno ya tiene su propio `overflow-hidden`.)

- [ ] **Step 2: Build + lint**

Run: `cd apps/web && npx eslint components/exercise-card.tsx --fix && pnpm build`
Expected: build limpio.

- [ ] **Step 3: Verificación manual**

Correr `pnpm dev` y abrir `/catalogo` logueado — confirmar que las tarjetas de la grilla muestran thumbnail circular, fondo oscuro nuevo, badge de región, nombre y pill de equipamiento.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/exercise-card.tsx
git commit -m "feat(web): restyle de ExerciseCard con Card/Pill/GradientIcon"
```

---

### Task 5: Restyle de `/alumno` (ver rutina asignada)

**Files:**

- Modify: `apps/web/app/(alumno)/alumno/page.tsx`

**Interfaces:**

- Consume: `PageHeader`, `Card`, `Pill` de Task 3.

- [ ] **Step 1: Reescribir la página**

El archivo actual (antes de este cambio) es:

```tsx
import Link from 'next/link';
import { apiFetch, ApiError } from '../../../lib/api-client';
import { ExerciseCard } from '../../../components/exercise-card';

interface RutinaVigenteResponse {
  id: string;
  nombre: string;
  ejercicios: Array<{
    exerciseId: string;
    nombre: string;
    imageUrl: string | null;
    orden: number;
    series: number;
    repeticiones: number;
    peso: number | null;
    descanso: number;
  }>;
}

export default async function AlumnoPage() {
  let rutina: RutinaVigenteResponse | null = null;
  try {
    rutina = await apiFetch<RutinaVigenteResponse>('/users/me/rutina-vigente');
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    rutina = null;
  }

  if (!rutina) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col items-center gap-2 p-8 text-center">
        <h1 className="text-xl font-semibold text-text">Todavía no tenés una rutina asignada</h1>
        <p className="text-sm text-text-muted">
          Tu profesor te va a asignar una pronto — volvé a revisar más tarde.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold text-text">{rutina.nombre}</h1>

      <ul className="flex flex-col gap-3">
        {rutina.ejercicios
          .sort((a, b) => a.orden - b.orden)
          .map((ejercicio) => (
            <li key={ejercicio.exerciseId}>
              <Link href={`/catalogo/${ejercicio.exerciseId}`} className="flex gap-3">
                <div className="w-24 shrink-0">
                  <ExerciseCard
                    ejercicio={{
                      id: ejercicio.exerciseId,
                      nombre: ejercicio.nombre,
                      imageUrl: ejercicio.imageUrl,
                      parteCuerpo: '',
                      equipamiento: null,
                    }}
                  />
                </div>
                <div className="flex flex-col justify-center gap-1">
                  <p className="text-sm font-medium text-text">{ejercicio.nombre}</p>
                  <p className="text-xs text-text-muted">
                    {ejercicio.series} series × {ejercicio.repeticiones} reps
                    {ejercicio.peso !== null && ` — ${ejercicio.peso}kg`} — {ejercicio.descanso}s
                    descanso
                  </p>
                </div>
              </Link>
            </li>
          ))}
      </ul>
    </main>
  );
}
```

Reemplazarlo completo por:

```tsx
import Link from 'next/link';
import Image from 'next/image';
import { Dumbbell } from 'lucide-react';
import { apiFetch, ApiError } from '../../../lib/api-client';
import { PageHeader } from '../../../components/ui/page-header';
import { Card } from '../../../components/ui/card';
import { Pill } from '../../../components/ui/pill';
import { GradientIcon } from '../../../components/ui/gradient-icon';

interface RutinaVigenteResponse {
  id: string;
  nombre: string;
  ejercicios: Array<{
    exerciseId: string;
    nombre: string;
    imageUrl: string | null;
    orden: number;
    series: number;
    repeticiones: number;
    peso: number | null;
    descanso: number;
  }>;
}

export default async function AlumnoPage() {
  let rutina: RutinaVigenteResponse | null = null;
  try {
    rutina = await apiFetch<RutinaVigenteResponse>('/users/me/rutina-vigente');
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    rutina = null;
  }

  if (!rutina) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col items-center gap-2 p-8 text-center">
        <h1 className="text-xl font-semibold text-text">Todavía no tenés una rutina asignada</h1>
        <p className="text-sm text-text-muted">
          Tu profesor te va a asignar una pronto — volvé a revisar más tarde.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <PageHeader title={rutina.nombre} />

      <ul className="flex flex-col gap-3">
        {rutina.ejercicios
          .sort((a, b) => a.orden - b.orden)
          .map((ejercicio) => (
            <li key={ejercicio.exerciseId}>
              <Link href={`/catalogo/${ejercicio.exerciseId}`}>
                <Card className="flex items-center gap-3">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-surface">
                    {ejercicio.imageUrl ? (
                      <Image
                        src={ejercicio.imageUrl}
                        alt={ejercicio.nombre}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <GradientIcon icon={Dumbbell} size={20} />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <p className="text-sm font-medium text-text">{ejercicio.nombre}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Pill>{ejercicio.series} series</Pill>
                      <Pill>{ejercicio.repeticiones} reps</Pill>
                      {ejercicio.peso !== null && <Pill>{ejercicio.peso}kg</Pill>}
                      <Pill>{ejercicio.descanso}s descanso</Pill>
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Build + lint**

Run: `cd apps/web && npx eslint "app/(alumno)/alumno/page.tsx" --fix && pnpm build`
Expected: build limpio.

- [ ] **Step 3: Verificación manual**

`pnpm dev`, loguear como el alumno `fernando.benitez` (rutina "Mix" ya existente), abrir `/alumno` — confirmar filas con thumbnail circular, nombre, y pills de series/reps/peso/descanso, todo sobre fondo oscuro.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(alumno)/alumno/page.tsx"
git commit -m "feat(web): restyle de /alumno con PageHeader/Card/Pill"
```

---

### Task 6: Restyle de la lista de ejercicios del editor de profesor

**Files:**

- Modify: `apps/web/components/routine-exercises-editor.tsx:26-114` (función `FilaEjercicio`)

**Interfaces:**

- Consume: `Card`, `Pill` de Task 3.
- Produce: sin cambios en las props de `RoutineExercisesEditor` ni en `FilaEjercicio` — mismos callbacks (`onCambiar`, `onQuitar`), mismo `ejercicio: EjercicioEnEdicion`. Task 7 (verificación) no depende de cambios de interfaz acá.

- [ ] **Step 1: Reescribir `FilaEjercicio`**

El código actual completo de la función (líneas 26-115 de `routine-exercises-editor.tsx`) es:

```tsx
function FilaEjercicio({
  ejercicio,
  onCambiar,
  onQuitar,
}: {
  ejercicio: EjercicioEnEdicion;
  onCambiar: (
    campo: 'series' | 'repeticiones' | 'peso' | 'descanso' | 'notas',
    valor: string,
  ) => void;
  onQuitar: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: ejercicio.exerciseId,
  });
  const estilo = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={estilo}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-center"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reordenar ${ejercicio.nombre}`}
        className="flex min-h-11 min-w-11 items-center justify-center text-text-muted"
      >
        <GripVertical size={20} aria-hidden />
      </button>

      <span className="flex-1 text-sm font-medium text-text">{ejercicio.nombre}</span>

      <div className="grid grid-cols-4 gap-2">
        <label className="flex flex-col text-xs text-text-muted">
          Series
          <input
            type="number"
            min={1}
            value={ejercicio.series}
            onChange={(e) => onCambiar('series', e.target.value)}
            className="min-h-11 w-16 rounded-lg border border-border bg-surface px-2 text-text"
          />
        </label>
        <label className="flex flex-col text-xs text-text-muted">
          Reps
          <input
            type="number"
            min={1}
            value={ejercicio.repeticiones}
            onChange={(e) => onCambiar('repeticiones', e.target.value)}
            className="min-h-11 w-16 rounded-lg border border-border bg-surface px-2 text-text"
          />
        </label>
        <label className="flex flex-col text-xs text-text-muted">
          Peso (kg)
          <input
            type="number"
            min={0}
            step={0.5}
            value={ejercicio.peso ?? ''}
            placeholder="—"
            onChange={(e) => onCambiar('peso', e.target.value)}
            className="min-h-11 w-16 rounded-lg border border-border bg-surface px-2 text-text"
          />
        </label>
        <label className="flex flex-col text-xs text-text-muted">
          Descanso (s)
          <input
            type="number"
            min={0}
            value={ejercicio.descanso}
            onChange={(e) => onCambiar('descanso', e.target.value)}
            className="min-h-11 w-16 rounded-lg border border-border bg-surface px-2 text-text"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={onQuitar}
        aria-label={`Quitar ${ejercicio.nombre}`}
        className="min-h-11 min-w-11 text-danger"
      >
        <X size={18} aria-hidden />
      </button>
    </li>
  );
}
```

Reemplazarla completa por (único cambio: el `<li>` pasa a envolver un `<Card>` en vez de tener las clases de tarjeta él mismo — todo el contenido interno, inputs y botón de quitar, queda idéntico):

```tsx
function FilaEjercicio({
  ejercicio,
  onCambiar,
  onQuitar,
}: {
  ejercicio: EjercicioEnEdicion;
  onCambiar: (
    campo: 'series' | 'repeticiones' | 'peso' | 'descanso' | 'notas',
    valor: string,
  ) => void;
  onQuitar: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: ejercicio.exerciseId,
  });
  const estilo = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li ref={setNodeRef} style={estilo}>
      <Card className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reordenar ${ejercicio.nombre}`}
          className="flex min-h-11 min-w-11 items-center justify-center text-text-muted"
        >
          <GripVertical size={20} aria-hidden />
        </button>

        <span className="flex-1 text-sm font-medium text-text">{ejercicio.nombre}</span>

        <div className="grid grid-cols-4 gap-2">
          <label className="flex flex-col text-xs text-text-muted">
            Series
            <input
              type="number"
              min={1}
              value={ejercicio.series}
              onChange={(e) => onCambiar('series', e.target.value)}
              className="min-h-11 w-16 rounded-lg border border-border bg-surface px-2 text-text"
            />
          </label>
          <label className="flex flex-col text-xs text-text-muted">
            Reps
            <input
              type="number"
              min={1}
              value={ejercicio.repeticiones}
              onChange={(e) => onCambiar('repeticiones', e.target.value)}
              className="min-h-11 w-16 rounded-lg border border-border bg-surface px-2 text-text"
            />
          </label>
          <label className="flex flex-col text-xs text-text-muted">
            Peso (kg)
            <input
              type="number"
              min={0}
              step={0.5}
              value={ejercicio.peso ?? ''}
              placeholder="—"
              onChange={(e) => onCambiar('peso', e.target.value)}
              className="min-h-11 w-16 rounded-lg border border-border bg-surface px-2 text-text"
            />
          </label>
          <label className="flex flex-col text-xs text-text-muted">
            Descanso (s)
            <input
              type="number"
              min={0}
              value={ejercicio.descanso}
              onChange={(e) => onCambiar('descanso', e.target.value)}
              className="min-h-11 w-16 rounded-lg border border-border bg-surface px-2 text-text"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={onQuitar}
          aria-label={`Quitar ${ejercicio.nombre}`}
          className="min-h-11 min-w-11 text-danger"
        >
          <X size={18} aria-hidden />
        </button>
      </Card>
    </li>
  );
}
```

Agregar el import al principio del archivo, junto a los demás:

```tsx
import { Card } from './ui/card';
```

- [ ] **Step 2: Build + lint**

Run: `cd apps/web && npx eslint components/routine-exercises-editor.tsx --fix && pnpm build`
Expected: build limpio.

- [ ] **Step 3: Verificación manual**

`pnpm dev`, loguear como profesor, entrar a `/profesor/alumnos/<id-de-fernando.benitez>`, confirmar que la lista de ejercicios del editor usa el nuevo estilo de tarjeta, y que agregar/quitar/reordenar/guardar siguen funcionando igual que antes (sin cambios de comportamiento).

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/routine-exercises-editor.tsx
git commit -m "feat(web): restyle de FilaEjercicio en el editor de rutinas"
```

---

### Task 7: Restyle de `/catalogo` y `/catalogo/[id]`

**Files:**

- Modify: `apps/web/app/(catalogo)/catalogo/[id]/page.tsx`

**Interfaces:**

- Consume: `PageHeader`, `Pill` de Task 3.

- [ ] **Step 1: Reemplazar el back-button manual por `PageHeader`**

En `apps/web/app/(catalogo)/catalogo/[id]/page.tsx`, agregar el import:

```typescript
import { PageHeader } from '../../../../components/ui/page-header';
import { Pill } from '../../../../components/ui/pill';
```

Cambiar:

```tsx
{
  /*
        router.back() en vez de un href fijo a /catalogo — esta pantalla
        se llega tanto desde /catalogo (browse general) como desde
        /alumno (ejercicio dentro de la rutina vigente); un destino fijo
        sacaba al alumno de su rutina hacia el catálogo general en vez de
        devolverlo a donde estaba.
      */
}
<button
  type="button"
  onClick={() => router.back()}
  className="flex min-h-11 w-fit items-center gap-2 text-sm text-text-muted"
>
  <ArrowLeft size={18} aria-hidden />
  Volver
</button>;
```

por:

```tsx
{
  /*
        router.back() en vez de un href fijo a /catalogo — esta pantalla
        se llega tanto desde /catalogo (browse general) como desde
        /alumno (ejercicio dentro de la rutina vigente); un destino fijo
        sacaba al alumno de su rutina hacia el catálogo general en vez de
        devolverlo a donde estaba.
      */
}
<PageHeader title={ejercicio?.nombre ?? 'Ejercicio'} onBack={() => router.back()} />;
```

Sacar el import de `ArrowLeft` de `lucide-react` si ya no se usa ningún otro ícono de esa librería en el archivo (revisar — `Dumbbell` sigue usándose para el fallback de imagen, así que el import queda como `import { Dumbbell } from 'lucide-react';`).

- [ ] **Step 2: Traducir región/músculo/equipamiento a `Pill`**

Cambiar el bloque `<dl>`:

```tsx
<dl className="grid grid-cols-2 gap-2 text-sm">
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
  {ejercicio.equipamiento && (
    <div>
      <dt className="text-text-muted">Equipamiento</dt>
      <dd className="text-text">
        {ETIQUETA_EQUIPAMIENTO[ejercicio.equipamiento] ?? ejercicio.equipamiento}
      </dd>
    </div>
  )}
  {ejercicio.gruposMuscularesSecundarios.length > 0 && (
    <div>
      <dt className="text-text-muted">Músculos secundarios</dt>
      <dd className="text-text">
        {ejercicio.gruposMuscularesSecundarios
          .map((g) => ETIQUETA_GRUPO_MUSCULAR[g] ?? g)
          .join(', ')}
      </dd>
    </div>
  )}
</dl>
```

por:

```tsx
<div className="flex flex-wrap gap-2">
  <Pill>{ETIQUETA_PARTE_CUERPO[ejercicio.parteCuerpo] ?? ejercicio.parteCuerpo}</Pill>
  <Pill>{ETIQUETA_GRUPO_MUSCULAR[ejercicio.grupoMuscular] ?? ejercicio.grupoMuscular}</Pill>
  {ejercicio.equipamiento && (
    <Pill>{ETIQUETA_EQUIPAMIENTO[ejercicio.equipamiento] ?? ejercicio.equipamiento}</Pill>
  )}
  {ejercicio.gruposMuscularesSecundarios.map((g) => (
    <Pill key={g}>{ETIQUETA_GRUPO_MUSCULAR[g] ?? g}</Pill>
  ))}
</div>
```

- [ ] **Step 3: Build + lint**

Run: `cd apps/web && npx eslint "app/(catalogo)/catalogo/[id]/page.tsx" --fix && pnpm build`
Expected: build limpio. Si `router` (de `useRouter`) queda sin otro uso fuera de `onBack`, no hay que sacarlo — sigue usándose ahí mismo.

- [ ] **Step 4: Verificación manual**

`pnpm dev`, abrir `/catalogo`, confirmar la grilla con el nuevo estilo (heredado de la Task 4), entrar a un ejercicio, confirmar `PageHeader` con flecha funcional y los datos como pills.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(catalogo)/catalogo/[id]/page.tsx"
git commit -m "feat(web): restyle de /catalogo/[id] con PageHeader/Pill"
```

---

### Task 8: Restyle de `/login`

**Files:**

- Modify: `apps/web/app/login/page.tsx`

**Interfaces:** ninguna nueva — solo reemplazo de clases hardcodeadas (`neutral-*`, `bg-white`) por las clases de token ya existentes (`bg-surface`, `bg-surface-alt`, `text-text`, `border-border`, `bg-accent`, `text-accent-fg`).

- [ ] **Step 1: Reemplazar clases hardcodeadas**

`apps/web/app/login/page.tsx` es la única página del proyecto que nunca adoptó el sistema de tokens — confirmado por grep antes de este plan: usa `neutral-*`/`white`/`amber-*`/`red-*` directo en 5 lugares distintos (botón, fondo, tarjeta, título, los 2 inputs, el aviso de sesión expirada, y el mensaje de error). El archivo completo actual es:

```tsx
'use client';

import { Suspense } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { loginAction, LoginActionState } from './actions';

const ESTADO_INICIAL: LoginActionState = { error: null };
const GYM_ID = process.env.NEXT_PUBLIC_GYM_ID ?? '';

function BotonIngresar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 rounded-lg bg-neutral-900 px-4 text-base font-medium text-white active:bg-neutral-700 disabled:opacity-50"
    >
      {pending ? 'Ingresando...' : 'Ingresar'}
    </button>
  );
}

// `useSearchParams()` opta la página a client-side rendering si no está
// envuelto en Suspense (Next.js lo exige para no romper el prerender
// estático) — separado en su propio componente por eso, no por estilo.
function AvisoSesionExpirada() {
  const searchParams = useSearchParams();
  const sesionExpirada = searchParams.get('sessionExpired') === '1';

  if (!sesionExpirada) {
    return null;
  }

  return (
    <p role="alert" className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
      Tu sesión expiró. Ingresá de nuevo.
    </p>
  );
}

export default function LoginPage() {
  const [estado, formAction] = useFormState(loginAction, ESTADO_INICIAL);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-50 px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-2xl font-semibold text-neutral-900">Ingresar</h1>
        <Suspense fallback={null}>
          <AvisoSesionExpirada />
        </Suspense>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="gymId" value={GYM_ID} />
          <input
            name="username"
            placeholder="Usuario"
            required
            className="min-h-11 rounded-lg border border-neutral-300 px-4 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
          />
          <input
            name="password"
            type="password"
            placeholder="Contraseña (dejalo vacío si sos alumno)"
            className="min-h-11 rounded-lg border border-neutral-300 px-4 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
          />
          <BotonIngresar />
          {estado.error && (
            <p role="alert" className="text-sm text-red-600">
              {estado.error}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
```

Reemplazarlo completo por:

```tsx
'use client';

import { Suspense } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { loginAction, LoginActionState } from './actions';

const ESTADO_INICIAL: LoginActionState = { error: null };
const GYM_ID = process.env.NEXT_PUBLIC_GYM_ID ?? '';

function BotonIngresar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 rounded-lg bg-accent px-4 text-base font-medium text-accent-fg active:opacity-90 disabled:opacity-50"
    >
      {pending ? 'Ingresando...' : 'Ingresar'}
    </button>
  );
}

// `useSearchParams()` opta la página a client-side rendering si no está
// envuelto en Suspense (Next.js lo exige para no romper el prerender
// estático) — separado en su propio componente por eso, no por estilo.
function AvisoSesionExpirada() {
  const searchParams = useSearchParams();
  const sesionExpirada = searchParams.get('sessionExpired') === '1';

  if (!sesionExpirada) {
    return null;
  }

  return (
    <p
      role="alert"
      className="mb-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text"
    >
      Tu sesión expiró. Ingresá de nuevo.
    </p>
  );
}

export default function LoginPage() {
  const [estado, formAction] = useFormState(loginAction, ESTADO_INICIAL);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl bg-surface-alt p-6">
        <h1 className="mb-6 text-2xl font-semibold text-text">Ingresar</h1>
        <Suspense fallback={null}>
          <AvisoSesionExpirada />
        </Suspense>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="gymId" value={GYM_ID} />
          <input
            name="username"
            placeholder="Usuario"
            required
            className="min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
          <input
            name="password"
            type="password"
            placeholder="Contraseña (dejalo vacío si sos alumno)"
            className="min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
          <BotonIngresar />
          {estado.error && (
            <p role="alert" className="text-sm text-danger">
              {estado.error}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
```

(Cambios: botón y colores de acento en vez de `neutral-900`/`white`; fondo/tarjeta/títulos/inputs a tokens (`surface`/`surface-alt`/`text`/`border`); el aviso de sesión expirada pasa de `amber-50`/`amber-800` — un box claro que se vería roto sobre fondo oscuro — a `border-border`/`bg-surface`/`text-text`, mismo tono que el resto de la UI; el mensaje de error pasa de `red-600` hardcodeado a `text-danger`, que ya está definido en los tokens con el valor correcto para fondo oscuro.)

- [ ] **Step 2: Build + lint**

Run: `cd apps/web && npx eslint app/login/page.tsx --fix && pnpm build`
Expected: build limpio.

- [ ] **Step 3: Verificación manual**

`pnpm dev`, abrir `/login` sin sesión — confirmar fondo oscuro, tarjeta de login con el nuevo estilo, botón "Ingresar" con el color de acento.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/login/page.tsx
git commit -m "feat(web): /login adopta la paleta de tokens (antes hardcodeaba neutral-*)"
```

---

### Task 9: Verificación final de toda la app

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Build + lint completo**

Run: `cd apps/web && pnpm build`
Expected: build limpio, todas las rutas compilan.

- [ ] **Step 2: Grep final de residuos**

Run: `cd apps/web && grep -rn "neutral-\|ThemeToggle\|theme-toggle\|darkMode\|\.dark " app components lib tailwind.config.ts`
Expected: sin resultados relevantes (0 matches — si aparece algo, es una tarea pendiente, no cerrar la task hasta resolverlo).

- [ ] **Step 3: Smoke test visual de las pantallas NO tocadas por código pero que heredan la paleta**

`pnpm dev`, recorrer logueado como cada rol:

- `/admin` — panel completo (lista de usuarios, formularios de crear profesor/alumno, panel de cartera): confirmar fondo oscuro, sin ningún resto de fondo claro.
- `/profesor` — lista de alumnos.
- `/profesor/plantillas` y `/profesor/plantillas/[id]` — listado y editor de plantillas (usa el mismo `RoutineExercisesEditor` de la Task 6, heredado automáticamente).

Estas pantallas no tienen tasks propias en este plan porque ya usaban clases de token (`bg-surface`, `text-text`, etc.) — solo cambia el valor de los tokens, sin tocar su código. Si alguna se ve mal (contraste, color que no encaja), anotarlo y no cerrar esta task hasta decidir con el usuario si entra en este plan o en un ajuste posterior.

- [ ] **Step 4: Confirmar con el usuario**

Mostrar capturas o pedir confirmación visual directa de las pantallas de las Tasks 4-8 antes de considerar el plan completo.
