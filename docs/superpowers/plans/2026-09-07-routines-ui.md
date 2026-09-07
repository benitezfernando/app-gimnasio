# Routines UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UI de Profesor (plantillas, cartera, asignación/ajuste de rutina), UI de Alumno (rutina vigente), y UI de Admin (hard-delete con diálogo de impacto) sobre el backend de Routines ya completo y aprobado.

**Architecture:** Un componente compartido (`RoutineExercisesEditor`) para armar/editar la lista de ejercicios de una plantilla o instancia — reusa el buscador de `/catalogo` y agrega reordenamiento con dnd-kit. Todo Client Component consumiendo `browserApiFetch` contra el proxy same-origin, mismo patrón que `/catalogo` (Bloque 2) y el panel de cartera (Bloque 3A).

**Tech Stack:** Next.js 14 App Router, Tailwind con el sistema de tokens existente, `lucide-react`, y `@dnd-kit/core`+`@dnd-kit/sortable`+`@dnd-kit/utilities` (nuevos, MIT, sin dependencias — elegidos en el diseño por soporte de teclado nativo, evitando otra librería de drag&drop con licencia a auditar).

## Global Constraints

- Reusar el sistema de tokens del Bloque 2 (`bg-surface`, `text-text`, `text-danger`, `border-border`, `bg-accent`, etc.) — nunca colores hardcodeados nuevos.
- Reusar `ExerciseCard`/`browserApiFetch`/`region-colors`/`equipment-options` existentes — no reescribir el buscador del catálogo.
- Todo Client Component pega al backend vía `browserApiFetch` (proxy same-origin) — nunca `apiFetch` (Server Component) desde un Client Component.
- `/catalogo` y `/catalogo/[id]` se mueven de `(profesor)/` a un route group propio `(catalogo)/` — deuda de 3B, cierra el guard de rol pendiente desde 3A.
- `(profesor)/layout.tsx` pasa a exigir rol PROFESOR real (hoy solo valida sesión) — usa `GET /users/me`, que ya devuelve `role`.
- Reordenar ejercicios: drag & drop con `dnd-kit` + fallback de teclado (soporte nativo de la librería, no hay que construirlo).
- Guardar la lista de ejercicios de una plantilla/instancia: siempre `PUT .../exercises` con el array completo en el orden final (replace-all) — nunca requests granulares por ejercicio.
- Máximo 50 ejercicios por plantilla/instancia — el backend ya lo valida (`TooManyExercisesError`, 400); la UI debe mostrar ese error de forma legible, no debe re-validar el límite del lado del cliente de forma redundante con lógica distinta.
- Hard-delete: el Admin ve el impacto real (`GET /users/:id/deletion-impact`) antes de poder confirmar `DELETE /users/:id/permanent` — nunca un `window.confirm` genérico para esta acción.
- Nomenclatura y comentarios en español, mismo estilo que el resto del repo.

---

## Task 1: Route group `(catalogo)/` + guards de rol reales

**Files:**

- Create: `apps/web/app/(catalogo)/layout.tsx`
- Create: `apps/web/app/(catalogo)/catalogo/page.tsx` (mover contenido de `(profesor)/catalogo/page.tsx`)
- Create: `apps/web/app/(catalogo)/catalogo/[id]/page.tsx` (mover contenido de `(profesor)/catalogo/[id]/page.tsx`)
- Delete: `apps/web/app/(profesor)/catalogo/page.tsx`
- Delete: `apps/web/app/(profesor)/catalogo/[id]/page.tsx`
- Modify: `apps/web/app/(profesor)/layout.tsx`
- Modify: `apps/web/app/(alumno)/layout.tsx`

**Interfaces:**

- Consumes: `apiFetch`, `ApiError` (ya existen, sin cambios).
- Produces: `/catalogo` y `/catalogo/[id]` accesibles por los tres roles bajo su propio guard de sesión; `(profesor)/layout.tsx` exige rol PROFESOR real; `(alumno)/layout.tsx` exige rol ALUMNO real — consumidos por todas las tareas siguientes (las páginas de profesor/alumno cuelgan de estos layouts).

- [ ] **Step 1: Crear el layout del nuevo route group**

Crear `apps/web/app/(catalogo)/layout.tsx` con el contenido EXACTO que hoy tiene `apps/web/app/(profesor)/layout.tsx` (antes de tocarlo en el Step 4), salvo el comentario:

```tsx
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api-client';

/**
 * Solo valida sesión — el catálogo es legible por ADMIN/PROFESOR/ALUMNO
 * por igual. Route group propio (separado de (profesor)/(alumno)/(admin),
 * que sí exigen rol) porque el alumno necesita esta pantalla para HU-09
 * y no puede vivir bajo un layout que excluya su rol.
 */
export default async function CatalogoLayout({ children }: { children: ReactNode }) {
  try {
    await apiFetch('/users/me');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Mover las dos páginas del catálogo**

Crear `apps/web/app/(catalogo)/catalogo/page.tsx` con el contenido idéntico (byte a byte) al actual `apps/web/app/(profesor)/catalogo/page.tsx` — no cambia ninguna línea, solo la ubicación del archivo.

Crear `apps/web/app/(catalogo)/catalogo/[id]/page.tsx` con el contenido idéntico al actual `apps/web/app/(profesor)/catalogo/[id]/page.tsx` — mismo criterio.

- [ ] **Step 3: Borrar las páginas viejas**

Borrar `apps/web/app/(profesor)/catalogo/page.tsx` y `apps/web/app/(profesor)/catalogo/[id]/page.tsx` (y el directorio `apps/web/app/(profesor)/catalogo/` si queda vacío).

- [ ] **Step 4: Reemplazar `(profesor)/layout.tsx` con un guard de rol real**

Reemplazar el contenido completo de `apps/web/app/(profesor)/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api-client';

interface MeResponse {
  id: string;
  gymId: string;
  role: 'ADMIN' | 'PROFESOR' | 'ALUMNO';
}

/**
 * Exige rol PROFESOR real — pendiente desde el Bloque 3A, que dejó este
 * layout validando solo sesión porque /catalogo vivía acá adentro y lo
 * necesitaban los tres roles. Con /catalogo movido a su propio route
 * group (Tarea 1 de este plan), esta sección puede exigir el rol de
 * verdad. Un usuario logueado con otro rol recibe 403 de `GET /users/me`... no:
 * /users/me nunca da 403 por rol (no tiene @Roles) — el chequeo de rol se
 * hace acá, comparando el campo `role` de la respuesta.
 */
export default async function ProfesorLayout({ children }: { children: ReactNode }) {
  let me: MeResponse;
  try {
    me = await apiFetch<MeResponse>('/users/me');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  if (me.role !== 'PROFESOR') {
    redirect('/login');
  }

  return <>{children}</>;
}
```

- [ ] **Step 5: Reemplazar `(alumno)/layout.tsx` con un guard de rol real**

Reemplazar el contenido completo de `apps/web/app/(alumno)/layout.tsx`, mismo patrón:

```tsx
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api-client';

interface MeResponse {
  id: string;
  gymId: string;
  role: 'ADMIN' | 'PROFESOR' | 'ALUMNO';
}

/** Exige rol ALUMNO real — mismo criterio que (profesor)/layout.tsx. */
export default async function AlumnoLayout({ children }: { children: ReactNode }) {
  let me: MeResponse;
  try {
    me = await apiFetch<MeResponse>('/users/me');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  if (me.role !== 'ALUMNO') {
    redirect('/login');
  }

  return <>{children}</>;
}
```

- [ ] **Step 6: Verificar el build**

Run: `pnpm --filter web build`
Expected: build exitoso, listando `/catalogo`, `/catalogo/[id]`, `/admin`, `/profesor`, `/alumno` como rutas — sin ninguna ruta duplicada ni huérfana.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/(catalogo)" "apps/web/app/(profesor)/layout.tsx" "apps/web/app/(alumno)/layout.tsx"
git rm -r "apps/web/app/(profesor)/catalogo"
git commit -m "feat(web): mover /catalogo a route group propio + guards de rol reales"
```

---

## Task 2: `RoutineExercisesEditor` — componente compartido de armado de ejercicios

**Files:**

- Create: `apps/web/package.json` (modificar — agregar dependencias dnd-kit)
- Create: `apps/web/components/exercise-picker.tsx`
- Create: `apps/web/components/routine-exercises-editor.tsx`
- Create: `apps/web/lib/routine-types.ts`

**Interfaces:**

- Consumes: `browserApiFetch`/`BrowserApiError` (ya existen), `ExerciseCardData` (ya existe, `components/exercise-card.tsx`).
- Produces: `EjercicioEnEdicion` (tipo compartido), `RoutineExercisesEditor` (componente, `props: { ejerciciosIniciales, onGuardar(ejercicios): Promise<void>, guardando, error }`) — consumido por el editor de plantillas (Tarea 4) y el de instancias (Tarea 5).

- [ ] **Step 1: Agregar dnd-kit**

En `apps/web/package.json`, agregar a `"dependencies"`:

```json
    "@dnd-kit/core": "^6.1.0",
    "@dnd-kit/sortable": "^8.0.0",
    "@dnd-kit/utilities": "^3.2.2",
```

Run: `pnpm install`
Expected: instala las 3 dependencias en `apps/web/node_modules`.

- [ ] **Step 2: Tipo compartido de ejercicio en edición**

Crear `apps/web/lib/routine-types.ts`:

```typescript
/**
 * Forma de un ejercicio mientras se edita una plantilla/instancia en el
 * cliente — combina los campos que manda el backend (`exerciseId`,
 * `orden`, `series`, `repeticiones`, `peso`, `descanso`, `notas`) con los
 * de solo display resueltos del catálogo (`nombre`, `imageUrl`) para no
 * tener que volver a pedirlos al guardar.
 */
export interface EjercicioEnEdicion {
  exerciseId: string;
  nombre: string;
  imageUrl: string | null;
  orden: number;
  series: number;
  repeticiones: number;
  peso: number | null;
  descanso: number;
  notas: string | null;
}

export function aPayloadDeEjercicios(ejercicios: EjercicioEnEdicion[]): Array<{
  exerciseId: string;
  orden: number;
  series: number;
  repeticiones: number;
  peso?: number;
  descanso: number;
  notas?: string;
}> {
  return ejercicios.map((e, indice) => ({
    exerciseId: e.exerciseId,
    orden: indice + 1,
    series: e.series,
    repeticiones: e.repeticiones,
    ...(e.peso !== null ? { peso: e.peso } : {}),
    descanso: e.descanso,
    ...(e.notas ? { notas: e.notas } : {}),
  }));
}
```

- [ ] **Step 3: Buscador de ejercicios para agregar**

Crear `apps/web/components/exercise-picker.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { browserApiFetch, BrowserApiError } from '../lib/browser-api-client';
import { ExerciseCardData } from './exercise-card';

interface ListExercisesResponse {
  items: ExerciseCardData[];
  total: number;
  totalPages: number;
}

/**
 * Buscador reusado del catálogo (Bloque 2), simplificado: sin filtros de
 * región/equipamiento, solo texto — el profesor ya sabe qué está
 * buscando al armar una rutina. Al elegir un resultado, se lo agrega a
 * la lista vía `onAgregar` y el buscador se limpia solo.
 */
export function ExercisePicker({
  onAgregar,
}: {
  onAgregar: (ejercicio: ExerciseCardData) => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<ExerciseCardData[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (busqueda.trim().length < 2) {
      setResultados([]);
      return;
    }
    const timeoutId = setTimeout(async () => {
      setCargando(true);
      setError(null);
      try {
        const respuesta = await browserApiFetch<ListExercisesResponse>(
          `exercises?search=${encodeURIComponent(busqueda)}&limit=10`,
        );
        setResultados(respuesta.items);
      } catch (err) {
        setError(err instanceof BrowserApiError ? err.message : 'No se pudo buscar.');
      } finally {
        setCargando(false);
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [busqueda]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3">
        <Search size={18} className="text-text-muted" aria-hidden />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar ejercicio para agregar..."
          className="min-h-11 w-full bg-transparent text-base text-text outline-none placeholder:text-text-muted"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {resultados.length > 0 && (
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-border bg-surface p-2">
          {resultados.map((ejercicio) => (
            <li key={ejercicio.id}>
              <button
                type="button"
                onClick={() => {
                  onAgregar(ejercicio);
                  setBusqueda('');
                  setResultados([]);
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-surface-alt"
              >
                <span className="text-sm text-text">{ejercicio.nombre}</span>
                <span className="text-xs capitalize text-text-muted">{ejercicio.parteCuerpo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!cargando && busqueda.trim().length >= 2 && resultados.length === 0 && !error && (
        <p className="text-sm text-text-muted">Sin resultados.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: El editor compartido con reordenamiento**

Crear `apps/web/components/routine-exercises-editor.tsx`:

```tsx
'use client';

import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';
import { ExercisePicker } from './exercise-picker';
import { EjercicioEnEdicion } from '../lib/routine-types';
import { ExerciseCardData } from './exercise-card';

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

/**
 * Componente compartido entre el editor de plantillas y el de instancias
 * — arma/reordena/edita la lista de ejercicios en memoria, y delega el
 * guardado (siempre replace-all) a `onGuardar`. Reordenar con dnd-kit
 * (drag táctil/mouse + flechas de teclado nativas de la librería).
 */
export function RoutineExercisesEditor({
  ejerciciosIniciales,
  onGuardar,
  guardando,
  error,
}: {
  ejerciciosIniciales: EjercicioEnEdicion[];
  onGuardar: (ejercicios: EjercicioEnEdicion[]) => Promise<void>;
  guardando: boolean;
  error: string | null;
}) {
  const [ejercicios, setEjercicios] = useState<EjercicioEnEdicion[]>(ejerciciosIniciales);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function agregar(ejercicio: ExerciseCardData) {
    if (ejercicios.some((e) => e.exerciseId === ejercicio.id)) return;
    setEjercicios((actuales) => [
      ...actuales,
      {
        exerciseId: ejercicio.id,
        nombre: ejercicio.nombre,
        imageUrl: ejercicio.imageUrl,
        orden: actuales.length + 1,
        series: 3,
        repeticiones: 10,
        peso: null,
        descanso: 60,
        notas: null,
      },
    ]);
  }

  function quitar(exerciseId: string) {
    setEjercicios((actuales) => actuales.filter((e) => e.exerciseId !== exerciseId));
  }

  function cambiarCampo(
    exerciseId: string,
    campo: 'series' | 'repeticiones' | 'peso' | 'descanso' | 'notas',
    valor: string,
  ) {
    setEjercicios((actuales) =>
      actuales.map((e) => {
        if (e.exerciseId !== exerciseId) return e;
        if (campo === 'notas') return { ...e, notas: valor || null };
        if (campo === 'peso') return { ...e, peso: valor === '' ? null : Number(valor) };
        return { ...e, [campo]: Number(valor) };
      }),
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setEjercicios((actuales) => {
      const desde = actuales.findIndex((e) => e.exerciseId === active.id);
      const hasta = actuales.findIndex((e) => e.exerciseId === over.id);
      return arrayMove(actuales, desde, hasta);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ExercisePicker onAgregar={agregar} />

      {ejercicios.length === 0 ? (
        <p className="text-sm text-text-muted">
          Todavía no agregaste ningún ejercicio — buscá uno arriba para empezar.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={ejercicios.map((e) => e.exerciseId)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-2">
              {ejercicios.map((ejercicio) => (
                <FilaEjercicio
                  key={ejercicio.exerciseId}
                  ejercicio={ejercicio}
                  onCambiar={(campo, valor) => cambiarCampo(ejercicio.exerciseId, campo, valor)}
                  onQuitar={() => quitar(ejercicio.exerciseId)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => onGuardar(ejercicios)}
        disabled={guardando || ejercicios.length === 0}
        className="min-h-11 self-start rounded-lg bg-accent px-6 text-sm font-medium text-accent-fg disabled:opacity-50"
      >
        {guardando ? 'Guardando...' : 'Guardar ejercicios'}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Verificar el build**

Run: `pnpm --filter web build`
Expected: build exitoso — nada consume estos componentes todavía, así que solo valida sintaxis/tipos propios.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/lib/routine-types.ts \
        apps/web/components/exercise-picker.tsx apps/web/components/routine-exercises-editor.tsx
git commit -m "feat(web): RoutineExercisesEditor compartido (buscador + dnd-kit)"
```

---

## Task 3: Lista y creación de plantillas (`/profesor/plantillas`)

**Files:**

- Create: `apps/web/app/(profesor)/profesor/plantillas/page.tsx`
- Create: `apps/web/app/(profesor)/profesor/plantillas/actions.ts`
- Create: `apps/web/app/(profesor)/profesor/plantillas/create-template-form.tsx`

**Nota de ruteo:** `(profesor)` es un route group — no aporta segmento de URL. El segmento `/profesor` lo da la carpeta literal `profesor/` ya existente dentro del grupo (mismo patrón que `(admin)/admin/`, `(catalogo)/catalogo/`). Los 3 archivos van DENTRO de esa carpeta (`profesor/plantillas/`), no directo bajo `(profesor)/` — si no, resuelven a `/plantillas` en vez de `/profesor/plantillas`. Los imports de este Step ya están calculados para esa profundidad (4 `../` hasta `apps/web/`, no 3).

**Interfaces:**

- Consumes: `apiFetch` (Server Component), `POST/GET /routine-templates` (backend, ya aprobado).
- Produces: la lista navega a `/profesor/plantillas/[id]` (Tarea 4).

- [ ] **Step 1: Server Actions de crear/desactivar/eliminar**

Crear `apps/web/app/(profesor)/profesor/plantillas/actions.ts`:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from '../../../../lib/api-client';

export interface CreateTemplateActionState {
  error: string | null;
}

export async function createTemplateAction(
  _prevState: CreateTemplateActionState,
  formData: FormData,
): Promise<CreateTemplateActionState> {
  const nombre = String(formData.get('nombre') ?? '');
  const descripcion = String(formData.get('descripcion') ?? '');

  try {
    const creada = await apiFetch<{ id: string }>('/routine-templates', {
      method: 'POST',
      body: JSON.stringify({ nombre, descripcion: descripcion || undefined }),
    });
    revalidatePath('/profesor/plantillas');
    return {
      error: `Creada — abrila desde la lista para agregarle ejercicios (id: ${creada.id}).`,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: 'Error inesperado creando la plantilla.' };
  }
}

export async function toggleActivaAction(
  templateId: string,
  activa: boolean,
): Promise<{ error: string | null }> {
  try {
    await apiFetch(`/routine-templates/${templateId}`, {
      method: 'PATCH',
      body: JSON.stringify({ activa }),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: 'Error inesperado.' };
  }
  revalidatePath('/profesor/plantillas');
  return { error: null };
}

export async function deleteTemplateAction(templateId: string): Promise<{ error: string | null }> {
  try {
    await apiFetch(`/routine-templates/${templateId}`, { method: 'DELETE' });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: 'Error inesperado.' };
  }
  revalidatePath('/profesor/plantillas');
  return { error: null };
}
```

- [ ] **Step 2: Formulario de creación**

Crear `apps/web/app/(profesor)/profesor/plantillas/create-template-form.tsx`:

```tsx
'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createTemplateAction, CreateTemplateActionState } from './actions';

const ESTADO_INICIAL: CreateTemplateActionState = { error: null };

function BotonCrear() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 w-full rounded-lg bg-accent px-4 text-base font-medium text-accent-fg disabled:opacity-50 sm:w-auto"
    >
      {pending ? 'Creando...' : 'Crear plantilla'}
    </button>
  );
}

export function CreateTemplateForm() {
  const [estado, formAction] = useFormState(createTemplateAction, ESTADO_INICIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-text">Nueva plantilla</h2>
      <input
        name="nombre"
        placeholder="Nombre (ej. Full body)"
        required
        minLength={2}
        className="min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted"
      />
      <input
        name="descripcion"
        placeholder="Descripción (opcional)"
        className="min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted"
      />
      <BotonCrear />
      {estado.error && <p className="text-sm text-text">{estado.error}</p>}
    </form>
  );
}
```

- [ ] **Step 3: Página de lista**

Crear `apps/web/app/(profesor)/profesor/plantillas/page.tsx`:

```tsx
import Link from 'next/link';
import { apiFetch } from '../../../../lib/api-client';
import { CreateTemplateForm } from './create-template-form';

interface TemplateSummary {
  id: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
}

export default async function PlantillasPage() {
  const plantillas = await apiFetch<TemplateSummary[]>('/routine-templates');

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold text-text">Mis plantillas</h1>

      <CreateTemplateForm />

      <ul className="flex flex-col gap-2">
        {plantillas.map((plantilla) => (
          <li key={plantilla.id}>
            <Link
              href={`/profesor/plantillas/${plantilla.id}`}
              className="flex min-h-11 items-center justify-between rounded-lg border border-border bg-surface px-4 py-2"
            >
              <div>
                <p className="text-sm font-medium text-text">{plantilla.nombre}</p>
                {plantilla.descripcion && (
                  <p className="text-xs text-text-muted">{plantilla.descripcion}</p>
                )}
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  plantilla.activa ? 'bg-success/15 text-success' : 'bg-surface-alt text-text-muted'
                }`}
              >
                {plantilla.activa ? 'Activa' : 'Inactiva'}
              </span>
            </Link>
          </li>
        ))}
        {plantillas.length === 0 && (
          <p className="text-sm text-text-muted">Todavía no armaste ninguna plantilla.</p>
        )}
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: Verificar el build**

Run: `pnpm --filter web build`
Expected: build exitoso, `/profesor/plantillas` listada.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(profesor)/profesor/plantillas"
git commit -m "feat(web): lista y creación de plantillas (HU-04)"
```

---

## Task 4: Editor de plantilla (`/profesor/plantillas/[id]`)

**Files:**

- Create: `apps/web/app/(profesor)/profesor/plantillas/[id]/page.tsx`
- Create: `apps/web/app/(profesor)/profesor/plantillas/[id]/template-editor.tsx`

**Nota de ruteo (aprendida en el fix de la Tarea 3):** `(profesor)` es un route group — no aporta segmento de URL. El segmento `/profesor` lo da la carpeta literal `profesor/` ya existente dentro del grupo (mismo patrón que `(admin)/admin/`, `(catalogo)/catalogo/`). Los dos archivos de esta tarea van DENTRO de esa carpeta (`profesor/plantillas/[id]/`), no directo bajo `(profesor)/` — si no, resuelven a `/plantillas/[id]` en vez de `/profesor/plantillas/[id]`. Los imports de este Step ya están calculados para esa profundidad correcta (5 `../` hasta `apps/web/`, no 4).

**Interfaces:**

- Consumes: `RoutineExercisesEditor`, `EjercicioEnEdicion`, `aPayloadDeEjercicios` (Tarea 2); `apiFetch` (Server Component); `toggleActivaAction`/`deleteTemplateAction` (Tarea 3); `browserApiFetch` (Client Component, para el `PUT .../exercises`).

- [ ] **Step 1: Componente cliente del editor**

Crear `apps/web/app/(profesor)/profesor/plantillas/[id]/template-editor.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { browserApiFetch, BrowserApiError } from '../../../../../lib/browser-api-client';
import { RoutineExercisesEditor } from '../../../../../components/routine-exercises-editor';
import { EjercicioEnEdicion, aPayloadDeEjercicios } from '../../../../../lib/routine-types';
import { toggleActivaAction, deleteTemplateAction } from '../actions';

interface TemplateDetail {
  id: string;
  nombre: string;
  activa: boolean;
  ejercicios: EjercicioEnEdicion[];
}

export function TemplateEditor({ plantilla }: { plantilla: TemplateDetail }) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accionError, setAccionError] = useState<string | null>(null);

  async function guardarEjercicios(ejercicios: EjercicioEnEdicion[]) {
    setGuardando(true);
    setError(null);
    try {
      await browserApiFetch(`routine-templates/${plantilla.id}/exercises`, {
        method: 'PUT',
        body: JSON.stringify({ ejercicios: aPayloadDeEjercicios(ejercicios) }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof BrowserApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  async function alternarActiva() {
    setAccionError(null);
    const resultado = await toggleActivaAction(plantilla.id, !plantilla.activa);
    if (resultado.error) setAccionError(resultado.error);
  }

  async function eliminar() {
    if (plantilla.activa) return;
    if (!window.confirm(`¿Eliminar definitivamente "${plantilla.nombre}"? No se puede deshacer.`)) {
      return;
    }
    setAccionError(null);
    const resultado = await deleteTemplateAction(plantilla.id);
    if (resultado.error) {
      setAccionError(resultado.error);
    } else {
      router.push('/profesor/plantillas');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">{plantilla.nombre}</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={alternarActiva}
            className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium text-text"
          >
            {plantilla.activa ? 'Desactivar' : 'Reactivar'}
          </button>
          <button
            type="button"
            onClick={eliminar}
            disabled={plantilla.activa}
            title={plantilla.activa ? 'Desactivala primero para poder eliminarla' : undefined}
            className="min-h-11 rounded-lg border border-danger/30 px-4 text-sm font-medium text-danger disabled:opacity-40"
          >
            Eliminar definitivamente
          </button>
        </div>
      </div>

      {accionError && (
        <p role="alert" className="text-sm text-danger">
          {accionError}
        </p>
      )}

      <RoutineExercisesEditor
        ejerciciosIniciales={plantilla.ejercicios}
        onGuardar={guardarEjercicios}
        guardando={guardando}
        error={error}
      />
    </div>
  );
}
```

- [ ] **Step 2: Página servidor**

Crear `apps/web/app/(profesor)/profesor/plantillas/[id]/page.tsx`:

```tsx
import { apiFetch } from '../../../../../lib/api-client';
import { TemplateEditor } from './template-editor';

interface TemplateDetailResponse {
  id: string;
  gymId: string;
  profesorId: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  ejercicios: Array<{
    exerciseId: string;
    orden: number;
    series: number;
    repeticiones: number;
    peso: number | null;
    descanso: number;
    notas: string | null;
  }>;
}

interface ExerciseSummary {
  id: string;
  nombre: string;
  imageUrl: string | null;
}

export default async function PlantillaDetailPage({ params }: { params: { id: string } }) {
  const plantilla = await apiFetch<TemplateDetailResponse>(`/routine-templates/${params.id}`);

  // El detalle de plantilla no trae nombre/imageUrl de cada ejercicio —
  // se resuelven acá con una consulta por ejercicio al catálogo (son a
  // lo sumo 50, y esto corre server-side una sola vez al abrir la
  // página, no en cada interacción del editor).
  const ejercicios = await Promise.all(
    plantilla.ejercicios.map(async (e) => {
      const detalle = await apiFetch<ExerciseSummary>(`/exercises/${e.exerciseId}`);
      return {
        exerciseId: e.exerciseId,
        nombre: detalle.nombre,
        imageUrl: detalle.imageUrl,
        orden: e.orden,
        series: e.series,
        repeticiones: e.repeticiones,
        peso: e.peso,
        descanso: e.descanso,
        notas: e.notas,
      };
    }),
  );

  return (
    <main className="mx-auto max-w-2xl p-4">
      <TemplateEditor
        plantilla={{
          id: plantilla.id,
          nombre: plantilla.nombre,
          activa: plantilla.activa,
          ejercicios,
        }}
      />
    </main>
  );
}
```

- [ ] **Step 3: Verificar el build**

Run: `pnpm --filter web build`
Expected: build exitoso, `/profesor/plantillas/[id]` listada.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(profesor)/profesor/plantillas/[id]"
git commit -m "feat(web): editor de ejercicios de plantilla con dnd-kit (HU-04, HU-07)"
```

---

## Task 5: Dashboard del profesor (cartera) + asignación/ajuste de rutina por alumno

**Files:**

- Create: `apps/web/app/(profesor)/profesor/page.tsx` (reemplaza el placeholder)
- Create: `apps/web/app/(profesor)/profesor/alumnos/[id]/page.tsx`
- Create: `apps/web/app/(profesor)/profesor/alumnos/[id]/instance-editor.tsx`
- Create: `apps/web/app/(profesor)/profesor/alumnos/[id]/assign-template-form.tsx`

**Nota de ruteo (mismo fix que la Tarea 3/4):** los 3 archivos de "alumnos" van dentro de la carpeta literal `profesor/` ya existente en el route group, no directo bajo `(profesor)/` — si no, resuelven a `/alumnos/[id]` en vez de `/profesor/alumnos/[id]`. Los imports de este Step ya están calculados para esa profundidad (5 `../` hasta `apps/web/`).

**Interfaces:**

- Consumes: `GET /users/me/alumnos` (3A, ya existe), `GET /users/:alumnoId/rutina-vigente`, `POST /routine-instances`, `PUT /routine-instances/:id/exercises`, `RoutineExercisesEditor` (Tarea 2), `GET /routine-templates` (Tarea 3 ya expone el endpoint, esta tarea lo consume).

- [ ] **Step 1: Dashboard del profesor**

Reemplazar `apps/web/app/(profesor)/profesor/page.tsx`:

```tsx
import Link from 'next/link';
import { apiFetch } from '../../../lib/api-client';

interface AlumnoRow {
  id: string;
  nombre: string;
  username: string;
  activo: boolean;
}

export default async function ProfesorDashboardPage() {
  const alumnos = await apiFetch<AlumnoRow[]>('/users/me/alumnos');

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Mi cartera</h1>
        <Link href="/profesor/plantillas" className="text-sm font-medium text-accent">
          Ver plantillas
        </Link>
      </div>

      <ul className="flex flex-col gap-2">
        {alumnos.map((alumno) => (
          <li key={alumno.id}>
            <Link
              href={`/profesor/alumnos/${alumno.id}`}
              className="flex min-h-11 items-center justify-between rounded-lg border border-border bg-surface px-4 py-2"
            >
              <div>
                <p className="text-sm font-medium text-text">{alumno.nombre}</p>
                <p className="text-xs text-text-muted">@{alumno.username}</p>
              </div>
              {!alumno.activo && (
                <span className="rounded-full bg-surface-alt px-2.5 py-1 text-xs font-medium text-text-muted">
                  Inactivo
                </span>
              )}
            </Link>
          </li>
        ))}
        {alumnos.length === 0 && (
          <p className="text-sm text-text-muted">
            Todavía no tenés alumnos asignados — pedile al Admin que te asigne alguno.
          </p>
        )}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Formulario para asignar una plantilla existente**

Crear `apps/web/app/(profesor)/profesor/alumnos/[id]/assign-template-form.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserApiFetch, BrowserApiError } from '../../../../../lib/browser-api-client';

interface TemplateOption {
  id: string;
  nombre: string;
  activa: boolean;
}

export function AssignTemplateForm({
  alumnoId,
  plantillas,
}: {
  alumnoId: string;
  plantillas: TemplateOption[];
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState('');
  const [nombre, setNombre] = useState('');
  const [asignando, setAsignando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plantillasActivas = plantillas.filter((p) => p.activa);

  async function asignar() {
    if (!templateId || !nombre.trim()) return;
    setAsignando(true);
    setError(null);
    try {
      await browserApiFetch('routine-instances', {
        method: 'POST',
        body: JSON.stringify({ alumnoId, nombre, origenTemplateId: templateId }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof BrowserApiError ? err.message : 'No se pudo asignar.');
    } finally {
      setAsignando(false);
    }
  }

  if (plantillasActivas.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        No tenés plantillas activas — armá una en{' '}
        <a href="/profesor/plantillas" className="text-accent underline">
          Mis plantillas
        </a>{' '}
        primero, o armá la rutina desde cero más abajo.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <select
        value={templateId}
        onChange={(e) => setTemplateId(e.target.value)}
        className="min-h-11 rounded-lg border border-border bg-surface px-3 text-text"
      >
        <option value="">Elegir plantilla...</option>
        {plantillasActivas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre de esta rutina para el alumno"
        className="min-h-11 rounded-lg border border-border bg-surface px-3 text-text placeholder:text-text-muted"
      />
      <button
        type="button"
        onClick={asignar}
        disabled={asignando || !templateId || !nombre.trim()}
        className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50"
      >
        {asignando ? 'Asignando...' : 'Asignar plantilla'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Editor de la instancia vigente (ajustar o armar desde cero)**

Crear `apps/web/app/(profesor)/profesor/alumnos/[id]/instance-editor.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserApiFetch, BrowserApiError } from '../../../../../lib/browser-api-client';
import { RoutineExercisesEditor } from '../../../../../components/routine-exercises-editor';
import { EjercicioEnEdicion, aPayloadDeEjercicios } from '../../../../../lib/routine-types';

interface InstanceExistente {
  id: string;
  nombre: string;
  ejercicios: EjercicioEnEdicion[];
}

export function InstanceEditor({
  alumnoId,
  instanciaVigente,
}: {
  alumnoId: string;
  instanciaVigente: InstanceExistente | null;
}) {
  const router = useRouter();
  const [nombreNueva, setNombreNueva] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Con instancia vigente: PUT sobre esa instancia (ajuste, HU-06).
  // Sin instancia vigente: primero POST /routine-instances desde cero
  // con la lista final de ejercicios (HU-05), en un solo paso — no hay
  // "crear vacía y después rellenar" porque el backend exige al menos un
  // criterio de origen en la creación.
  async function guardar(ejercicios: EjercicioEnEdicion[]) {
    setGuardando(true);
    setError(null);
    try {
      if (instanciaVigente) {
        await browserApiFetch(`routine-instances/${instanciaVigente.id}/exercises`, {
          method: 'PUT',
          body: JSON.stringify({ ejercicios: aPayloadDeEjercicios(ejercicios) }),
        });
      } else {
        await browserApiFetch('routine-instances', {
          method: 'POST',
          body: JSON.stringify({
            alumnoId,
            nombre: nombreNueva || 'Rutina personalizada',
            ejercicios: aPayloadDeEjercicios(ejercicios),
          }),
        });
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof BrowserApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {!instanciaVigente && (
        <input
          value={nombreNueva}
          onChange={(e) => setNombreNueva(e.target.value)}
          placeholder="Nombre de la rutina"
          className="min-h-11 rounded-lg border border-border bg-surface px-3 text-text placeholder:text-text-muted"
        />
      )}
      <RoutineExercisesEditor
        ejerciciosIniciales={instanciaVigente?.ejercicios ?? []}
        onGuardar={guardar}
        guardando={guardando}
        error={error}
      />
    </div>
  );
}
```

- [ ] **Step 4: Página del alumno**

Crear `apps/web/app/(profesor)/profesor/alumnos/[id]/page.tsx`:

```tsx
import { apiFetch, ApiError } from '../../../../../lib/api-client';
import { AssignTemplateForm } from './assign-template-form';
import { InstanceEditor } from './instance-editor';

interface TemplateOption {
  id: string;
  nombre: string;
  activa: boolean;
}

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
    notas: string | null;
  }>;
}

export default async function AlumnoDetailPage({ params }: { params: { id: string } }) {
  const plantillas = await apiFetch<TemplateOption[]>('/routine-templates');

  let rutinaVigente: RutinaVigenteResponse | null = null;
  try {
    rutinaVigente = await apiFetch<RutinaVigenteResponse>(`/users/${params.id}/rutina-vigente`);
  } catch (error) {
    // El backend responde 200 con el body vacío/null si no hay vigente
    // (ver GetAlumnoRutinaVigenteAsProfesorUseCase) — este catch es solo
    // para el caso de un 403/404 real (alumno fuera de cartera), que acá
    // no debería pasar porque /users/me/alumnos ya filtró la cartera.
    if (!(error instanceof ApiError)) throw error;
    rutinaVigente = null;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold text-text">
        {rutinaVigente ? `Rutina de ${rutinaVigente.nombre}` : 'Sin rutina asignada'}
      </h1>

      {!rutinaVigente && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-text-muted">Asignar plantilla existente</h2>
          <AssignTemplateForm alumnoId={params.id} plantillas={plantillas} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-muted">
          {rutinaVigente ? 'Ajustar ejercicios' : 'O armar rutina desde cero'}
        </h2>
        <InstanceEditor
          alumnoId={params.id}
          instanciaVigente={
            rutinaVigente
              ? {
                  id: rutinaVigente.id,
                  nombre: rutinaVigente.nombre,
                  ejercicios: rutinaVigente.ejercicios.map((e) => ({
                    exerciseId: e.exerciseId,
                    nombre: e.nombre,
                    imageUrl: e.imageUrl,
                    orden: e.orden,
                    series: e.series,
                    repeticiones: e.repeticiones,
                    peso: e.peso,
                    descanso: e.descanso,
                    notas: e.notas,
                  })),
                }
              : null
          }
        />
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Verificar el build**

Run: `pnpm --filter web build`
Expected: build exitoso, `/profesor`, `/profesor/alumnos/[id]` listadas.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(profesor)/profesor"
git commit -m "feat(web): dashboard de profesor + asignación/ajuste de rutina (HU-05, HU-06)"
```

---

## Task 6: Dashboard del alumno (`/alumno`) — rutina vigente

**Files:**

- Create: `apps/web/app/(alumno)/alumno/page.tsx` (reemplaza el placeholder)

**Interfaces:**

- Consumes: `GET /users/me/rutina-vigente`, `ExerciseCard`/`ExerciseCardData` (ya existen).

- [ ] **Step 1: Reemplazar la página del alumno**

Reemplazar `apps/web/app/(alumno)/alumno/page.tsx`:

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

Nota: `ExerciseCard` muestra un chip de región (`parteCuerpo`) que acá se pasa vacío (`''`) porque `RutinaVigenteOutput` no trae esa info — `regionColorVar('')` cae en el fallback `'waist'` (ver `lib/region-colors.ts`), así que el chip queda con un color válido pero mostrando un string vacío. Es un detalle visual menor aceptado para no pedirle al backend un campo que ninguna otra pantalla de esta tarea necesita — si molesta visualmente, ocultar el chip cuando `parteCuerpo === ''` es un ajuste de una línea en `ExerciseCard`, fuera del alcance de esta tarea.

- [ ] **Step 2: Verificar el build**

Run: `pnpm --filter web build`
Expected: build exitoso, `/alumno` listada.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(alumno)/alumno/page.tsx"
git commit -m "feat(web): rutina vigente del alumno (HU-08, HU-09)"
```

---

## Task 7: UI de hard-delete en `/admin`

**Files:**

- Modify: `apps/web/app/(admin)/admin/actions.ts`
- Create: `apps/web/app/(admin)/admin/delete-permanently-dialog.tsx`
- Modify: `apps/web/app/(admin)/admin/users-list.tsx`

**Interfaces:**

- Consumes: `GET /users/:id/deletion-impact`, `DELETE /users/:id/permanent` (Bloque 3B backend, ya aprobado); `browserApiFetch`.

- [ ] **Step 1: Server Action de eliminación definitiva**

En `apps/web/app/(admin)/admin/actions.ts`, agregar al final:

```typescript
export async function deletePermanentlyAction(
  userId: string,
): Promise<{ error: string | null; advertencia?: string }> {
  try {
    const resultado = await apiFetch<{ advertencia?: string }>(`/users/${userId}/permanent`, {
      method: 'DELETE',
    });
    revalidatePath('/admin');
    return { error: null, advertencia: resultado.advertencia };
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: 'Error inesperado eliminando el usuario.' };
  }
}
```

- [ ] **Step 2: Diálogo de impacto**

Crear `apps/web/app/(admin)/admin/delete-permanently-dialog.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { browserApiFetch, BrowserApiError } from '../../../lib/browser-api-client';
import { deletePermanentlyAction } from './actions';

interface DeletionImpact {
  plantillasABorrar: number;
  instanciasABorrar: number;
  instanciasQueSobreviven: number;
  vinculosDeCarteraABorrar: number;
}

/**
 * HU-03c: nunca un window.confirm genérico para esta acción — el Admin
 * tiene que ver el impacto real antes de poder confirmar (la cascada de
 * un PROFESOR no es predecible de memoria).
 */
export function DeletePermanentlyDialog({
  userId,
  nombre,
  onCerrado,
}: {
  userId: string;
  nombre: string;
  onCerrado: () => void;
}) {
  const [impacto, setImpacto] = useState<DeletionImpact | null>(null);
  const [cargando, setCargando] = useState(true);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advertencia, setAdvertencia] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    async function cargarImpacto() {
      try {
        const respuesta = await browserApiFetch<DeletionImpact>(`users/${userId}/deletion-impact`);
        if (!cancelado) setImpacto(respuesta);
      } catch (err) {
        if (cancelado) return;
        setError(err instanceof BrowserApiError ? err.message : 'No se pudo calcular el impacto.');
      } finally {
        if (!cancelado) setCargando(false);
      }
    }
    cargarImpacto();
    return () => {
      cancelado = true;
    };
  }, [userId]);

  async function confirmar() {
    setEliminando(true);
    setError(null);
    const resultado = await deletePermanentlyAction(userId);
    if (resultado.error) {
      setError(resultado.error);
      setEliminando(false);
      return;
    }
    if (resultado.advertencia) {
      setAdvertencia(resultado.advertencia);
      setEliminando(false);
      return;
    }
    onCerrado();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-surface p-4">
        <h2 className="text-lg font-semibold text-text">Eliminar a {nombre} definitivamente</h2>

        {cargando && <p className="text-sm text-text-muted">Calculando impacto...</p>}

        {impacto && (
          <ul className="flex flex-col gap-1 text-sm text-text">
            <li>Plantillas que se borran: {impacto.plantillasABorrar}</li>
            <li>Rutinas de alumnos que se borran: {impacto.instanciasABorrar}</li>
            <li>
              Rutinas que sobreviven (alumno con otro profesor): {impacto.instanciasQueSobreviven}
            </li>
            <li>Vínculos de cartera que se borran: {impacto.vinculosDeCarteraABorrar}</li>
          </ul>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {advertencia && (
          <p role="alert" className="text-sm text-danger">
            {advertencia}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCerrado}
            className="min-h-11 flex-1 rounded-lg border border-border px-4 text-sm font-medium text-text"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={cargando || eliminando || !impacto}
            className="min-h-11 flex-1 rounded-lg bg-danger px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {eliminando ? 'Eliminando...' : 'Eliminar definitivamente'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Integrar el botón en la lista de usuarios**

En `apps/web/app/(admin)/admin/users-list.tsx`, agregar el import:

```typescript
import { DeletePermanentlyDialog } from './delete-permanently-dialog';
```

Agregar un estado para el diálogo abierto, dentro del componente `UsersList` (junto a los `useState` existentes):

```typescript
const [usuarioAEliminar, setUsuarioAEliminar] = useState<UserRow | null>(null);
```

Agregar, dentro de `BotonDesactivar` o como un botón hermano en cada fila/tarjeta (mobile y desktop), un botón "Eliminar definitivamente" que solo se habilita si `!u.activo`:

```tsx
<button
  onClick={() => setUsuarioAEliminar(u)}
  disabled={u.activo}
  title={u.activo ? 'Desactivalo primero' : undefined}
  className="min-h-11 rounded-lg border border-danger/30 px-4 text-sm font-medium text-danger disabled:opacity-40"
>
  Eliminar
</button>
```

Y al final del `return` del componente, antes del cierre de `</section>`:

```tsx
{
  usuarioAEliminar && (
    <DeletePermanentlyDialog
      userId={usuarioAEliminar.id}
      nombre={usuarioAEliminar.nombre}
      onCerrado={() => setUsuarioAEliminar(null)}
    />
  );
}
```

- [ ] **Step 4: Verificar el build**

Run: `pnpm --filter web build`
Expected: build exitoso.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(admin\)/admin/actions.ts \
        apps/web/app/\(admin\)/admin/delete-permanently-dialog.tsx \
        apps/web/app/\(admin\)/admin/users-list.tsx
git commit -m "feat(web): diálogo de impacto + eliminación definitiva en /admin (HU-03c)"
```

---

## Task 8: Verificación final end-to-end

**Files:** ninguno nuevo — tarea de verificación, sin cambios de código salvo lo que un hallazgo real obligue a corregir.

**Interfaces:**

- Consumes: todo lo producido por las Tareas 1-7, y el backend completo del plan `2026-09-06-routines-backend.md`.

- [ ] **Step 1: Suite y build completos**

Run: `pnpm --filter web build && pnpm --filter api test && pnpm --filter api build`
Expected: los tres en verde. El build de `apps/web` lista todas las rutas nuevas: `/catalogo`, `/catalogo/[id]`, `/profesor`, `/profesor/plantillas`, `/profesor/plantillas/[id]`, `/profesor/alumnos/[id]`, `/alumno`.

- [ ] **Step 2: Verificación manual end-to-end contra Supabase real — HU-04 a HU-09 completo**

Con un ADMIN real: crear un PROFESOR y un ALUMNO reales (o usar los que ya existan), asignar el alumno a la cartera del profesor. Con el PROFESOR: armar una plantilla con 2-3 ejercicios reordenados por drag & drop, asignarla al alumno desde `/profesor/alumnos/[id]`, confirmar que se ve en la lista. Con el ALUMNO: entrar a `/alumno`, confirmar que ve la rutina con imágenes, series/reps/peso, y que el click a un ejercicio lleva al detalle con GIF y pasos.

- [ ] **Step 3: Verificación manual — hard-delete**

Con el ADMIN: sobre un usuario de prueba desechable ya desactivado, abrir el diálogo de eliminación definitiva en `/admin`, confirmar que los números del impacto son reales (comparar contra una consulta directa a la DB), confirmar, y verificar que desapareció de la lista.

- [ ] **Step 4: Inspección visual mobile-first**

Abrir `/profesor/plantillas/[id]` y `/profesor/alumnos/[id]` en un viewport de celular real: confirmar que el reordenamiento por drag funciona con el dedo (no solo con mouse), que los inputs numéricos son usables con el teclado táctil, y que el toggle claro/oscuro no deja ningún elemento con colores viejos. Repetir en `/alumno` y en el diálogo de hard-delete de `/admin`.

- [ ] **Step 5: Reportar el estado**

Sin commitear ni pushear nada adicional — autorización explícita del usuario requerida para cualquier `git push`. Informar: resultado de los 3 comandos del Step 1, resultado de las verificaciones manuales, y cualquier hallazgo que haya requerido un fix fuera de lo ya descrito en este plan.
