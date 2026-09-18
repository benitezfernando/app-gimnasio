# Mobile App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el shell de navegación tipo "página web suelta" (topbar de logout, header que scrollea, columnas centradas con márgenes visibles) por un shell de app mobile: barra de navegación inferior fija por rol, header fijo arriba con logout ícono-solo, contenido a ancho completo en mobile, y una pantalla de login a pantalla completa.

**Architecture:** Un componente `BottomNav` client-side (usa `usePathname()`) con 3 listas de items exportadas (una por rol), montado en cada layout de route group ((alumno)/(profesor)/(admin)/(catalogo)) en vez del topbar de logout que hoy tienen los 4. El logout se muda al slot `right` de `PageHeader` (ahora sticky) en cada pantalla raíz de pestaña. La lógica de "qué item está activo" se extrae a una función pura testeable sin DOM.

**Tech Stack:** Next.js 14 App Router (route groups + layouts), Tailwind, lucide-react (íconos ya instalados: `Dumbbell`, `LayoutGrid`, `Users`, `ClipboardList`, `LayoutDashboard`, `LogOut`), Jest (`testEnvironment: 'node'`, `testMatch: ['**/*.spec.ts']` — **sin** infraestructura de testing de componentes React en este proyecto; ningún componente de UI existente tiene test, así que este plan no agrega tests de render, solo de lógica pura en `.spec.ts`).

## Global Constraints

- Items de navegación por rol (exactos, mapean a rutas ya existentes — no se crea ninguna ruta nueva):
  - Alumno: `{ href: '/alumno', label: 'Rutina', icon: Dumbbell }`, `{ href: '/catalogo', label: 'Catálogo', icon: LayoutGrid }`
  - Profesor: `{ href: '/profesor', label: 'Cartera', icon: Users }`, `{ href: '/profesor/plantillas', label: 'Plantillas', icon: ClipboardList }`, `{ href: '/catalogo', label: 'Catálogo', icon: LayoutGrid }`
  - Admin: `{ href: '/admin', label: 'Panel', icon: LayoutDashboard }`, `{ href: '/catalogo', label: 'Catálogo', icon: LayoutGrid }`
- `BottomNav`: `fixed inset-x-0 bottom-0 z-10 flex h-16 items-center justify-around border-t border-border bg-surface-alt`, con `style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}` inline (no hay utilidad Tailwind para `env()` en este proyecto). Item activo: ícono envuelto en `bg-gradient-accent` + `text-accent-fg`, label en `text-accent-text`. Inactivo: ícono y label en `text-text-muted`.
- Todo `<main>` de contenido de página lleva `pb-28` (112px, más que `h-16` de la barra + el máximo safe-area-inset-bottom real de ~34px) para que la barra fija no tape el último elemento.
- Patrón de contenedor: `flex w-full flex-col ... px-4 pb-28 pt-4 sm:mx-auto sm:max-w-<N>` — nunca combinar `py-4` y `pb-28` en el mismo elemento (Tailwind resuelve el conflicto por orden de la hoja de estilos generada, no por orden en el string de clases — usar siempre `pt-4` + `pb-28` por separado).
- `PageHeader`: su div raíz pasa a `sticky top-0 z-10 flex items-center justify-between gap-3 bg-surface py-2` (antes sin `sticky`/`bg-surface`).
- `Card`: pierde `border border-border`, queda `rounded-2xl bg-surface-alt p-4`.
- `LogoutButton`: pasa a ícono-solo, `flex h-11 w-11 items-center justify-center rounded-full text-text active:bg-surface-alt`, mantiene `aria-label="Cerrar sesión"`.
- Ningún endpoint, modelo de datos, ni lógica de negocio cambia — solo componentes de presentación y layouts de Next.js.

---

### Task 1: Helper de navegación activa + primitivas visuales del shell

**Files:**

- Create: `apps/web/components/ui/bottom-nav-active.ts`
- Create: `apps/web/components/ui/bottom-nav-active.spec.ts`
- Create: `apps/web/components/ui/bottom-nav.tsx`
- Modify: `apps/web/components/logout-button.tsx`
- Modify: `apps/web/components/ui/page-header.tsx`
- Modify: `apps/web/components/ui/card.tsx`

**Interfaces:**

- Produces: `getActiveNavHref(pathname: string, hrefs: string[]): string | null` — usado por `BottomNav`.
- Produces: `interface BottomNavItem { href: string; label: string; icon: LucideIcon }`, `export function BottomNav({ items }: { items: BottomNavItem[] })`, y las 3 constantes `ALUMNO_NAV_ITEMS`, `PROFESOR_NAV_ITEMS`, `ADMIN_NAV_ITEMS: BottomNavItem[]` — las consumen todos los layouts en las Tasks 2-5.
- Consumes: `Card`, `PageHeader`, `LogoutButton` ya existen (`apps/web/components/ui/card.tsx`, `apps/web/components/ui/page-header.tsx`, `apps/web/components/logout-button.tsx`) — esta task los modifica in-place, no cambia sus firmas (`Card({ children, className })`, `PageHeader({ title, onBack, right })`, `LogoutButton()` sin props).

- [ ] **Step 1: Escribir el test de `getActiveNavHref`**

Crear `apps/web/components/ui/bottom-nav-active.spec.ts`:

```ts
import { getActiveNavHref } from './bottom-nav-active';

describe('getActiveNavHref', () => {
  const PROFESOR_HREFS = ['/profesor', '/profesor/plantillas', '/catalogo'];

  it('matchea un pathname exacto', () => {
    expect(getActiveNavHref('/profesor', PROFESOR_HREFS)).toBe('/profesor');
  });

  it('matchea una subruta contra el href padre', () => {
    expect(getActiveNavHref('/profesor/alumnos/abc123', PROFESOR_HREFS)).toBe('/profesor');
  });

  it('prefiere el href mas especifico cuando varios matchean', () => {
    expect(getActiveNavHref('/profesor/plantillas', PROFESOR_HREFS)).toBe('/profesor/plantillas');
    expect(getActiveNavHref('/profesor/plantillas/xyz', PROFESOR_HREFS)).toBe(
      '/profesor/plantillas',
    );
  });

  it('matchea una subruta de catalogo', () => {
    expect(getActiveNavHref('/catalogo/abc', PROFESOR_HREFS)).toBe('/catalogo');
  });

  it('devuelve null si ningun href matchea', () => {
    expect(getActiveNavHref('/login', PROFESOR_HREFS)).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/web && npx jest bottom-nav-active.spec.ts`
Expected: FAIL — `Cannot find module './bottom-nav-active'`

- [ ] **Step 3: Implementar `getActiveNavHref`**

Crear `apps/web/components/ui/bottom-nav-active.ts`:

```ts
/**
 * Elige, de una lista de hrefs de items de navegación, cuál corresponde a
 * la pestaña activa para un pathname dado. Un href matchea si es igual al
 * pathname o si el pathname es una subruta suya (`${href}/...`). Cuando
 * más de un href matchea (ej. "/profesor" y "/profesor/plantillas" ambos
 * matchean "/profesor/plantillas/abc"), gana el más específico (el más
 * largo) — así una subruta de Plantillas no enciende también Cartera.
 */
export function getActiveNavHref(pathname: string, hrefs: string[]): string | null {
  let mejor: string | null = null;
  for (const href of hrefs) {
    const matchea = pathname === href || pathname.startsWith(`${href}/`);
    if (matchea && (mejor === null || href.length > mejor.length)) {
      mejor = href;
    }
  }
  return mejor;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/web && npx jest bottom-nav-active.spec.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Crear `BottomNav` y las listas de items por rol**

Crear `apps/web/components/ui/bottom-nav.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { Dumbbell, LayoutGrid, Users, ClipboardList, LayoutDashboard } from 'lucide-react';
import { getActiveNavHref } from './bottom-nav-active';

export interface BottomNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const ALUMNO_NAV_ITEMS: BottomNavItem[] = [
  { href: '/alumno', label: 'Rutina', icon: Dumbbell },
  { href: '/catalogo', label: 'Catálogo', icon: LayoutGrid },
];

export const PROFESOR_NAV_ITEMS: BottomNavItem[] = [
  { href: '/profesor', label: 'Cartera', icon: Users },
  { href: '/profesor/plantillas', label: 'Plantillas', icon: ClipboardList },
  { href: '/catalogo', label: 'Catálogo', icon: LayoutGrid },
];

export const ADMIN_NAV_ITEMS: BottomNavItem[] = [
  { href: '/admin', label: 'Panel', icon: LayoutDashboard },
  { href: '/catalogo', label: 'Catálogo', icon: LayoutGrid },
];

/**
 * Barra de navegación fija por rol — reemplaza el topbar de logout que
 * tenían los 4 layouts de route group. `usePathname()` obliga a que este
 * componente sea client-side; los layouts que lo montan siguen siendo
 * Server Components (RSC), montar un client component adentro no los
 * fuerza a serlo también.
 */
export function BottomNav({ items }: { items: BottomNavItem[] }) {
  const pathname = usePathname();
  const activeHref = getActiveNavHref(
    pathname,
    items.map((item) => item.href),
  );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 flex h-16 items-center justify-around border-t border-border bg-surface-alt"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {items.map((item) => {
        const activo = item.href === activeHref;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-w-11 flex-col items-center gap-1 px-3 py-1"
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full ${
                activo ? 'bg-gradient-accent' : ''
              }`}
            >
              <Icon
                size={18}
                className={activo ? 'text-accent-fg' : 'text-text-muted'}
                aria-hidden
              />
            </span>
            <span
              className={`text-xs font-medium ${activo ? 'text-accent-text' : 'text-text-muted'}`}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 6: `LogoutButton` a ícono-solo**

En `apps/web/components/logout-button.tsx`, reemplazar el `<button>` completo:

```tsx
import { LogOut } from 'lucide-react';
import { logoutAction } from '../lib/logout-action';

/**
 * Form action plano — no necesita 'use client', un <form action={...}>
 * de Server Action funciona sin JS del lado del browser.
 */
export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        aria-label="Cerrar sesión"
        className="flex h-11 w-11 items-center justify-center rounded-full text-text active:bg-surface-alt"
      >
        <LogOut size={20} aria-hidden />
      </button>
    </form>
  );
}
```

- [ ] **Step 7: `PageHeader` sticky**

En `apps/web/components/ui/page-header.tsx`, cambiar la línea del div raíz:

```tsx
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-surface py-2">
```

(reemplaza `<div className="flex items-center justify-between gap-3 py-2">` — el resto del archivo no cambia)

- [ ] **Step 8: `Card` sin borde**

En `apps/web/components/ui/card.tsx`, cambiar:

```tsx
    <div className={`rounded-2xl bg-surface-alt p-4 ${className}`}>
```

(reemplaza `rounded-2xl border border-border bg-surface-alt p-4` — quita `border border-border`)

- [ ] **Step 9: Verificar que compila y los tests pasan**

Run: `cd apps/web && npx jest && npx next build`
Expected: jest PASS (incluye los 5 tests nuevos), build sin errores de tipos

- [ ] **Step 10: Commit**

```bash
git add apps/web/components/ui/bottom-nav.tsx apps/web/components/ui/bottom-nav-active.ts apps/web/components/ui/bottom-nav-active.spec.ts apps/web/components/logout-button.tsx apps/web/components/ui/page-header.tsx apps/web/components/ui/card.tsx
git commit -m "feat(web): BottomNav, logout icono-solo, PageHeader sticky, Card sin borde"
```

---

### Task 2: Alumno — layout + página

**Files:**

- Modify: `apps/web/app/(alumno)/layout.tsx`
- Modify: `apps/web/app/(alumno)/alumno/page.tsx`

**Interfaces:**

- Consumes: `BottomNav`, `ALUMNO_NAV_ITEMS` de `apps/web/components/ui/bottom-nav.tsx` (Task 1). `LogoutButton` de `apps/web/components/logout-button.tsx` (Task 1). `PageHeader` de `apps/web/components/ui/page-header.tsx` (ya sticky por Task 1).

- [ ] **Step 1: Layout — cambiar topbar por BottomNav**

Reemplazar el contenido completo de `apps/web/app/(alumno)/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api-client';
import { BottomNav, ALUMNO_NAV_ITEMS } from '../../components/ui/bottom-nav';

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

  return (
    <>
      {children}
      <BottomNav items={ALUMNO_NAV_ITEMS} />
    </>
  );
}
```

- [ ] **Step 2: Página — importar `LogoutButton`, agregar `right`, ajustar contenedores**

En `apps/web/app/(alumno)/alumno/page.tsx`:

Agregar el import (junto a los otros de `components/`):

```tsx
import { LogoutButton } from '../../../components/logout-button';
```

Reemplazar el bloque del estado sin rutina:

```tsx
if (!rutina) {
  return (
    <main className="flex w-full flex-col items-center gap-2 px-8 pb-28 pt-8 text-center sm:mx-auto sm:max-w-2xl">
      <PageHeader title="Rutina" right={<LogoutButton />} />
      <h1 className="text-xl font-semibold text-text">Todavía no tenés una rutina asignada</h1>
      <p className="text-sm text-text-muted">
        Tu profesor te va a asignar una pronto — volvé a revisar más tarde.
      </p>
    </main>
  );
}
```

Reemplazar la apertura del `<main>` con rutina y su `PageHeader`:

```tsx
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl">
      <PageHeader title={rutina.nombre} right={<LogoutButton />} />
```

(el resto del archivo — la lista de ejercicios — no cambia)

- [ ] **Step 3: Verificar manualmente**

Run: `cd apps/web && npx next build`
Expected: build sin errores. Luego, con la app corriendo (`pnpm dev`), loguearse como alumno y confirmar: la barra inferior muestra "Rutina" y "Catálogo", el header queda fijo al scrollear la lista de ejercicios, y el botón de logout (ícono, arriba a la derecha) cierra sesión.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(alumno)/layout.tsx" "apps/web/app/(alumno)/alumno/page.tsx"
git commit -m "feat(web): shell mobile para /alumno (BottomNav + header sticky + logout)"
```

---

### Task 3: Profesor — layout + dashboard

**Files:**

- Modify: `apps/web/app/(profesor)/layout.tsx`
- Modify: `apps/web/app/(profesor)/profesor/page.tsx`

**Interfaces:**

- Consumes: `BottomNav`, `PROFESOR_NAV_ITEMS`, `LogoutButton`, `PageHeader` (Task 1).

- [ ] **Step 1: Layout — cambiar topbar por BottomNav**

Reemplazar el contenido completo de `apps/web/app/(profesor)/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api-client';
import { BottomNav, PROFESOR_NAV_ITEMS } from '../../components/ui/bottom-nav';

interface MeResponse {
  id: string;
  gymId: string;
  role: 'ADMIN' | 'PROFESOR' | 'ALUMNO';
}

/**
 * Exige rol PROFESOR real — pendiente desde el Bloque 3A, que dejó este
 * layout validando solo sesión porque /catalogo vivía acá adentro y lo
 * necesitaban los tres roles. Con /catalogo movido a su propio route
 * group (Bloque 3B), esta sección puede exigir el rol de verdad.
 * `/users/me` nunca devuelve 403 por rol (no tiene `@Roles`) — el
 * chequeo de rol se hace acá, comparando el campo `role` de la respuesta.
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

  return (
    <>
      {children}
      <BottomNav items={PROFESOR_NAV_ITEMS} />
    </>
  );
}
```

- [ ] **Step 2: Página — `PageHeader` + logout, sacar el link "Ver plantillas"**

Reemplazar el contenido completo de `apps/web/app/(profesor)/profesor/page.tsx`:

```tsx
import Link from 'next/link';
import { apiFetch } from '../../../lib/api-client';
import { PageHeader } from '../../../components/ui/page-header';
import { LogoutButton } from '../../../components/logout-button';

interface AlumnoRow {
  id: string;
  nombre: string;
  username: string;
  activo: boolean;
}

export default async function ProfesorDashboardPage() {
  const alumnos = await apiFetch<AlumnoRow[]>('/users/me/alumnos');

  return (
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl">
      <PageHeader title="Mi cartera" right={<LogoutButton />} />

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

(el link "Ver plantillas" desaparece — la pestaña "Plantillas" de la barra inferior ya cubre esa navegación; mantenerlo duplicaba la misma acción de dos formas distintas, justo el tipo de redundancia que este plan busca sacar)

- [ ] **Step 3: Verificar manualmente**

Run: `cd apps/web && npx next build`
Expected: build sin errores. Con la app corriendo, loguearse como profesor y confirmar: barra inferior con "Cartera"/"Plantillas"/"Catálogo", "Cartera" activa en `/profesor`, "Plantillas" activa al entrar a `/profesor/plantillas` y también al entrar al detalle de una plantilla, "Cartera" se mantiene activa al entrar al detalle de un alumno.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(profesor)/layout.tsx" "apps/web/app/(profesor)/profesor/page.tsx"
git commit -m "feat(web): shell mobile para /profesor (BottomNav + header sticky + logout)"
```

---

### Task 4: Admin — layout + página

**Files:**

- Modify: `apps/web/app/(admin)/layout.tsx`
- Modify: `apps/web/app/(admin)/admin/page.tsx`

**Interfaces:**

- Consumes: `BottomNav`, `ADMIN_NAV_ITEMS`, `LogoutButton`, `PageHeader` (Task 1).

- [ ] **Step 1: Layout — cambiar topbar por BottomNav**

Reemplazar el contenido completo de `apps/web/app/(admin)/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { ApiError } from '../../lib/api-client';
import { getUsersList } from '../../lib/get-users-list';
import { BottomNav, ADMIN_NAV_ITEMS } from '../../components/ui/bottom-nav';

/**
 * Valida server-side que la sesión actual pertenece a un ADMIN — sin
 * reimplementar la verificación del JWT: llama a `GET /users` del backend,
 * gateado por `@Roles(ADMIN)` + `JwtAuthGuard`. Si responde 401/403,
 * redirige a `/login`. Usa `getUsersList()` (memoizada por request) en vez
 * de `apiFetch` directo — admin/page.tsx pide la misma lista para sus
 * datos, y sin la memoización se pagaba el round-trip dos veces por
 * navegación.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await getUsersList();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  return (
    <>
      {children}
      <BottomNav items={ADMIN_NAV_ITEMS} />
    </>
  );
}
```

(nota: `ReactNode` ya estaba importado como tipo en el original vía `import type { ReactNode } from 'react'` — mantener ese import y usar `ReactNode` en vez de `React.ReactNode` en la firma, igual que en los otros 2 layouts; se escribe explícito acá solo para que quede claro qué reemplaza)

- [ ] **Step 2: Página — `PageHeader` + logout**

En `apps/web/app/(admin)/admin/page.tsx`, agregar imports:

```tsx
import { PageHeader } from '../../../components/ui/page-header';
import { LogoutButton } from '../../../components/logout-button';
```

Reemplazar el `return`:

```tsx
return (
  <main className="min-h-dvh bg-surface-alt px-4 pb-28 pt-6 sm:px-6 lg:px-8">
    <div className="flex w-full flex-col gap-6 sm:mx-auto sm:max-w-3xl">
      <PageHeader title="Panel Admin" right={<LogoutButton />} />
      <div className="flex flex-col gap-6 sm:grid sm:grid-cols-2">
        <CreateProfesorForm />
        <CreateAlumnoForm />
      </div>
      <UsersList usuariosIniciales={usuarios} />
    </div>
  </main>
);
```

- [ ] **Step 3: Verificar manualmente**

Run: `cd apps/web && npx next build`
Expected: build sin errores. Con la app corriendo, loguearse como admin y confirmar: barra inferior con "Panel"/"Catálogo", header fijo con "Panel Admin" y logout ícono arriba a la derecha.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(admin)/layout.tsx" "apps/web/app/(admin)/admin/page.tsx"
git commit -m "feat(web): shell mobile para /admin (BottomNav + header sticky + logout)"
```

---

### Task 5: Catálogo — layout con BottomNav por rol + página de lista

**Files:**

- Modify: `apps/web/app/(catalogo)/layout.tsx`
- Modify: `apps/web/app/(catalogo)/catalogo/page.tsx`

**Interfaces:**

- Consumes: `BottomNav`, `ALUMNO_NAV_ITEMS`, `PROFESOR_NAV_ITEMS`, `ADMIN_NAV_ITEMS`, `LogoutButton`, `PageHeader` (Task 1).

- [ ] **Step 1: Layout — capturar `me.role` y elegir la variante de BottomNav**

Reemplazar el contenido completo de `apps/web/app/(catalogo)/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '../../lib/api-client';
import {
  BottomNav,
  ALUMNO_NAV_ITEMS,
  PROFESOR_NAV_ITEMS,
  ADMIN_NAV_ITEMS,
  type BottomNavItem,
} from '../../components/ui/bottom-nav';

interface MeResponse {
  id: string;
  gymId: string;
  role: 'ADMIN' | 'PROFESOR' | 'ALUMNO';
}

const NAV_ITEMS_POR_ROL: Record<MeResponse['role'], BottomNavItem[]> = {
  ALUMNO: ALUMNO_NAV_ITEMS,
  PROFESOR: PROFESOR_NAV_ITEMS,
  ADMIN: ADMIN_NAV_ITEMS,
};

/**
 * Solo valida sesión — el catálogo es legible por ADMIN/PROFESOR/ALUMNO
 * por igual. Route group propio (separado de (profesor)/(alumno)/(admin),
 * que sí exigen rol) porque el alumno necesita esta pantalla para HU-09
 * y no puede vivir bajo un layout que excluya su rol. Captura `me.role`
 * (antes se descartaba, la respuesta se usaba solo como chequeo de sesión)
 * para saber qué variante de BottomNav mostrar — es la única pantalla
 * compartida por los 3 roles.
 */
export default async function CatalogoLayout({ children }: { children: ReactNode }) {
  let me: MeResponse;
  try {
    me = await apiFetch<MeResponse>('/users/me');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  return (
    <>
      {children}
      <BottomNav items={NAV_ITEMS_POR_ROL[me.role]} />
    </>
  );
}
```

- [ ] **Step 2: Página de lista — `PageHeader` + logout, contenedor a ancho completo**

En `apps/web/app/(catalogo)/catalogo/page.tsx`, agregar imports (junto a los existentes):

```tsx
import { PageHeader } from '../../../components/ui/page-header';
import { LogoutButton } from '../../../components/logout-button';
```

Reemplazar la apertura del `return`:

```tsx
  return (
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-5xl">
      <PageHeader title="Catálogo de ejercicios" right={<LogoutButton />} />
```

(reemplaza `<main className="mx-auto flex max-w-5xl flex-col gap-4 p-4">` seguido de
`<h1 className="text-xl font-semibold text-text">Catálogo de ejercicios</h1>` — el
`h1` se saca, `PageHeader` ya renderiza el título)

- [ ] **Step 3: Verificar manualmente**

Run: `cd apps/web && npx next build`
Expected: build sin errores. Con la app corriendo, entrar a `/catalogo` logueado como cada uno de los 3 roles y confirmar que la barra inferior muestra el set de tabs correcto para ese rol, con "Catálogo" activo.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(catalogo)/layout.tsx" "apps/web/app/(catalogo)/catalogo/page.tsx"
git commit -m "feat(web): BottomNav por rol en /catalogo + header sticky con logout"
```

---

### Task 6: Barrido mecánico de contenedores en las sub-páginas restantes

**Files:**

- Modify: `apps/web/app/(profesor)/profesor/plantillas/page.tsx`
- Modify: `apps/web/app/(profesor)/profesor/plantillas/[id]/page.tsx`
- Modify: `apps/web/app/(profesor)/profesor/alumnos/[id]/page.tsx`
- Modify: `apps/web/app/(catalogo)/catalogo/[id]/page.tsx`

Estas 4 páginas son sub-pantallas (se llega por navegación, no son destino de
la barra inferior) y no suman `PageHeader`/logout por fuera de alcance del
spec — solo necesitan `pb-28` para no quedar tapadas por la barra fija del
layout que las envuelve, y el mismo ajuste de ancho responsive del resto del
plan.

**Interfaces:**

- Ninguna — cambio de solo `className`, no toca lógica ni props.

- [ ] **Step 1: `plantillas/page.tsx`**

En `apps/web/app/(profesor)/profesor/plantillas/page.tsx`, reemplazar:

```tsx
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
```

por:

```tsx
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl">
```

- [ ] **Step 2: `plantillas/[id]/page.tsx`**

En `apps/web/app/(profesor)/profesor/plantillas/[id]/page.tsx`, reemplazar:

```tsx
    <main className="mx-auto max-w-2xl p-4">
```

por:

```tsx
    <main className="w-full px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl">
```

- [ ] **Step 3: `alumnos/[id]/page.tsx`**

En `apps/web/app/(profesor)/profesor/alumnos/[id]/page.tsx`, reemplazar:

```tsx
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4">
```

por:

```tsx
    <main className="flex w-full flex-col gap-6 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl">
```

- [ ] **Step 4: `catalogo/[id]/page.tsx`**

En `apps/web/app/(catalogo)/catalogo/[id]/page.tsx`, reemplazar:

```tsx
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
```

por:

```tsx
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl">
```

(su `PageHeader` con `onBack` no cambia — sigue sin `right`, sub-pantalla con
back button no lleva logout)

- [ ] **Step 5: Verificar**

Run: `cd apps/web && npx jest && npx next build`
Expected: PASS / build sin errores. Verificar manualmente que en cada una de
las 4 pantallas el último elemento de la página no queda tapado por la barra
inferior al scrollear hasta el final.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(profesor)/profesor/plantillas/page.tsx" "apps/web/app/(profesor)/profesor/plantillas/[id]/page.tsx" "apps/web/app/(profesor)/profesor/alumnos/[id]/page.tsx" "apps/web/app/(catalogo)/catalogo/[id]/page.tsx"
git commit -m "fix(web): pb-28 y ancho responsive en sub-pantallas para la barra inferior fija"
```

---

### Task 7: Login a pantalla completa

**Files:**

- Modify: `apps/web/app/login/page.tsx`

**Interfaces:**

- Ninguna — cambio de layout puro, `loginAction`/`LoginActionState` no cambian.

- [ ] **Step 1: Sacar la tarjeta centrada, anclar el form abajo**

En `apps/web/app/login/page.tsx`, reemplazar el `return` de `LoginPage`:

```tsx
return (
  <main className="flex min-h-dvh flex-col justify-end bg-surface px-6 pb-10 pt-8">
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
  </main>
);
```

(equivalente al original sin el `<div className="w-full max-w-sm rounded-2xl bg-surface-alt p-6">` que envolvía todo — el form pasa a ocupar el ancho completo, anclado abajo de la pantalla en vez de centrado en una tarjeta)

- [ ] **Step 2: Verificar manualmente**

Run: `cd apps/web && npx next build`
Expected: build sin errores. Abrir `/login` y confirmar que el form ocupa el ancho completo de la pantalla, anclado abajo, sin tarjeta ni borde alrededor.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/login/page.tsx
git commit -m "feat(web): login a pantalla completa, sin tarjeta centrada"
```
