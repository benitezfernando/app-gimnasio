# Sidebar Glassmorphism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un sidebar lateral glassmorphism en desktop (lg+) para los 5 route groups de la app (`(admin)`, `(profesor)`, `(alumno)`, `(catalogo)`, `(super-admin)`), reemplazando la barra superior fina actual, y modernizar visualmente el bottom nav de mobile para que comparta el mismo lenguaje — manteniendo los colores ya definidos en `globals.css`.

**Architecture:** `BottomNav` se simplifica a mobile-only; un `Sidebar` nuevo cubre desktop con los mismos datos (`BottomNavItem[]`, `getActiveNavHref`) más un bloque de usuario (nombre/rol) y logout; un `AppShell` nuevo compone ambos y el padding del contenido, reemplazando el patrón repetido en los 5 layouts. El bloque de usuario necesita `nombre`/`username`, hoy ausentes de `GET /users/me` — se agregan vía un `GetCurrentUserUseCase` nuevo que sí golpea la DB (el guard de cada request no lo hace, solo este endpoint puntual).

**Tech Stack:** NestJS + Prisma (backend), Next.js App Router + Tailwind v4 + shadcn (frontend). Sin dependencias nuevas — no hay React Testing Library en el repo, así que no se agregan tests de render de componentes (sigue el patrón existente: lógica pura testeada, JSX verificado manualmente).

## Global Constraints

- Tema oscuro único — no agregar modo claro ni nuevos colores. Todo mapea a los tokens existentes en `apps/web/app/globals.css` (`--card`, `--border`, `--primary`, `--primary-soft`, `--brand-from/via/to`, `bg-gradient-brand`).
- Sidebar fijo, sin colapsar (decisión ya tomada — no agregar estado de expand/collapse).
- Logout queda duplicado en desktop (sidebar + `PageHeader` de cada página) — decisión ya tomada, no tocar las 9 páginas que usan `LogoutButton` en su header.
- `GET /users/me` sigue sin requerir rol (`@Roles`) — cualquier usuario autenticado puede llamarlo, solo cambia qué devuelve.
- Seguir el patrón hexagonal ya establecido en `apps/api/src/identity`: el controller no accede a Prisma directo, pasa por un `UseCase` que usa `UserRepositoryPort` (`USER_REPOSITORY` token).
- No se instala React Testing Library ni se agregan tests de render — exactamente como hoy (`getActiveNavHref` es la única lógica de `bottom-nav.tsx` testeada, el resto es JSX verificado a mano).
- **Baseline conocido de `apps/api`:** antes de este plan ya fallan 10 suites al compilar por un error de TS preexistente en `apps/api/src/test-support/base-de-prueba.int.spec.ts:17` (`Parameter 'tx' implicitly has an 'any' type`). No es parte de este plan — no arreglarlo ni contarlo como regresión. "Suite en verde" significa: los 285 tests que hoy corren siguen pasando, más los nuevos, y no aparecen suites fallando además de esas 10.
- **Ítem activo accesible:** en `Sidebar` y en `BottomNav`, el `<Link>` del ítem activo lleva `aria-current="page"` (y ningún otro lo lleva).
- **Orden de deploy (producción):** el frontend nuevo lee `nombre` de `GET /users/me`. Si Vercel (deploy automático al pushear) sale antes que el API (Manual Deploy en Render), `user.nombre` llega `undefined` y los layouts revientan. Primero se deploya el API con Task 1, después se pushea el frontend.

---

### Task 1: Backend — `GetCurrentUserUseCase` y extender `GET /users/me`

**Files:**

- Create: `apps/api/src/identity/application/get-current-user.use-case.ts`
- Create: `apps/api/src/identity/application/get-current-user.use-case.spec.ts`
- Modify: `apps/api/src/identity/infrastructure/http/users.controller.ts:69-72` (método `me`)
- Modify: `apps/api/src/identity/identity.module.ts` (agregar `GetCurrentUserUseCase` a `providers`)

**Interfaces:**

- Consumes: `UserRepositoryPort.findById(id: string): Promise<UserRecord | null>` (ya existe, `apps/api/src/identity/application/ports/user-repository.port.ts`). `UserNotFoundError` (ya existe, `apps/api/src/identity/application/errors/user-not-found.error.ts`). `toUserResponse(user: UserRecord): UserResponse` (ya existe, `apps/api/src/identity/infrastructure/http/user-response.mapper.ts`) — devuelve `{ id, gymId, username, nombre, role, activo }`.
- Produces: `GetCurrentUserUseCase.execute({ userId: string }): Promise<UserRecord>` — usado solo por `UsersController.me`, ningún otro task depende de esto directamente.

- [ ] **Step 1: Escribir el test que falla**

```typescript
// apps/api/src/identity/application/get-current-user.use-case.spec.ts
import { Role } from '../domain/role';
import { GetCurrentUserUseCase } from './get-current-user.use-case';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { UserNotFoundError } from './errors/user-not-found.error';

describe('GetCurrentUserUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let useCase: GetCurrentUserUseCase;

  const usuario: UserRecord = {
    id: 'user-1',
    authUserId: 'auth-1',
    gymId: 'gym-1',
    username: 'fernando',
    nombre: 'Fernando Benitez',
    role: Role.ADMIN,
    activo: true,
  };

  beforeEach(() => {
    userRepository = {
      findByAuthUserId: jest.fn(),
      findByGymIdAndUsername: jest.fn(),
      findByGymId: jest.fn(),
      findById: jest.fn(),
      deactivate: jest.fn(),
      create: jest.fn(),
      updateNombre: jest.fn(),
    };
    useCase = new GetCurrentUserUseCase(userRepository);
  });

  it('devuelve el UserRecord completo cuando existe', async () => {
    userRepository.findById.mockResolvedValue(usuario);

    const resultado = await useCase.execute({ userId: 'user-1' });

    expect(resultado).toEqual(usuario);
    expect(userRepository.findById).toHaveBeenCalledWith('user-1');
  });

  it('lanza UserNotFoundError si no existe', async () => {
    userRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute({ userId: 'no-existe' })).rejects.toThrow(UserNotFoundError);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/api && npx jest get-current-user.use-case.spec.ts`
Expected: FAIL — `Cannot find module './get-current-user.use-case'`

- [ ] **Step 3: Implementar `GetCurrentUserUseCase`**

```typescript
// apps/api/src/identity/application/get-current-user.use-case.ts
import { Inject, Injectable } from '@nestjs/common';
import { USER_REPOSITORY, UserRecord, UserRepositoryPort } from './ports/user-repository.port';
import { UserNotFoundError } from './errors/user-not-found.error';

export interface GetCurrentUserInput {
  userId: string;
}

/**
 * A diferencia de `req.user` (poblado desde el JWT, sin ir a la DB), esto
 * trae el `UserRecord` completo — lo necesita `GET /users/me` para
 * devolver `nombre`/`username`, que no viajan en el JWT. Solo este
 * endpoint paga el round-trip extra; el guard de cada request sigue sin
 * tocar la DB.
 */
@Injectable()
export class GetCurrentUserUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort) {}

  async execute(input: GetCurrentUserInput): Promise<UserRecord> {
    const user = await this.userRepository.findById(input.userId);
    if (!user) {
      throw new UserNotFoundError(input.userId);
    }
    return user;
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/api && npx jest get-current-user.use-case.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Conectar el use case en `UsersController.me` y registrarlo en el módulo**

En `apps/api/src/identity/infrastructure/http/users.controller.ts`:

```typescript
// Agregar al import existente de use cases:
import { GetCurrentUserUseCase } from '../../application/get-current-user.use-case';

// Agregar al constructor (junto a los demás):
private readonly getCurrentUserUseCase: GetCurrentUserUseCase,

// Reemplazar el método me() actual:
@Get('me')
async me(@Req() req: RequestWithUser) {
  const user = await this.getCurrentUserUseCase.execute({ userId: req.user.id });
  return toUserResponse(user);
}
```

En `apps/api/src/identity/identity.module.ts`, agregar el import y sumarlo a `providers`:

```typescript
import { GetCurrentUserUseCase } from './application/get-current-user.use-case';
// ...
providers: [
  // ...providers existentes...
  GetCurrentUserUseCase,
],
```

- [ ] **Step 6: Correr toda la suite de `apps/api` y verificar que no rompió nada**

Run: `cd apps/api && npx jest`
Expected: los 285 tests existentes siguen pasando, más los 2 nuevos. Las únicas suites que fallan son las 10 del baseline conocido (ver Global Constraints) — ninguna suite nueva fallando.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/identity/application/get-current-user.use-case.ts \
        apps/api/src/identity/application/get-current-user.use-case.spec.ts \
        apps/api/src/identity/infrastructure/http/users.controller.ts \
        apps/api/src/identity/identity.module.ts
git commit -m "feat(identity): agregar nombre y username a GET /users/me"
```

---

### Task 2: Frontend — fetcher de usuario actual + helper de inicial

**Files:**

- Create: `apps/web/lib/get-current-user.ts`
- Create: `apps/web/components/ui/avatar-initial.ts`
- Create: `apps/web/components/ui/avatar-initial.spec.ts`

**Interfaces:**

- Consumes: `apiFetch<T>(path: string): Promise<T>` (ya existe, `apps/web/lib/api-client.ts`).
- Produces: `export type Role = 'ADMIN' | 'PROFESOR' | 'ALUMNO' | 'SUPER_ADMIN'` y `export interface CurrentUser { id: string; gymId: string | null; role: Role; nombre: string; username: string }`, exportados desde `apps/web/lib/get-current-user.ts`, junto a `export const getCurrentUser: () => Promise<CurrentUser>` (memoizado por request). `export function inicialDe(nombre: string): string`, exportado desde `apps/web/components/ui/avatar-initial.ts`. `CurrentUser`/`Role`/`inicialDe` los consume Task 4 (`Sidebar`); `CurrentUser` también Task 6 (`AppShell`); `getCurrentUser`/`CurrentUser` los consume Task 7 (los 5 layouts).

- [ ] **Step 1: Escribir el test que falla, para `inicialDe`**

```typescript
// apps/web/components/ui/avatar-initial.spec.ts
import { inicialDe } from './avatar-initial';

describe('inicialDe', () => {
  it('devuelve la primera letra en mayúscula', () => {
    expect(inicialDe('Fernando Benitez')).toBe('F');
  });

  it('funciona con un solo nombre', () => {
    expect(inicialDe('fernando')).toBe('F');
  });

  it('devuelve "?" si el nombre está vacío', () => {
    expect(inicialDe('')).toBe('?');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/web && npx jest avatar-initial.spec.ts`
Expected: FAIL — `Cannot find module './avatar-initial'`

- [ ] **Step 3: Implementar `inicialDe`**

```typescript
// apps/web/components/ui/avatar-initial.ts
export function inicialDe(nombre: string): string {
  const primera = nombre.trim().charAt(0);
  return primera ? primera.toUpperCase() : '?';
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/web && npx jest avatar-initial.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Crear el fetcher `getCurrentUser`**

```typescript
// apps/web/lib/get-current-user.ts
import { cache } from 'react';
import { apiFetch } from './api-client';

export type Role = 'ADMIN' | 'PROFESOR' | 'ALUMNO' | 'SUPER_ADMIN';

export interface CurrentUser {
  id: string;
  gymId: string | null;
  role: Role;
  nombre: string;
  username: string;
}

/**
 * `React.cache`, mismo patrón que `getUsersList` (`./get-users-list.ts`):
 * memoiza por request para que el layout (gate de rol) y `AppShell`
 * (bloque de usuario) puedan llamarla sin pagar el round-trip dos veces.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  return apiFetch<CurrentUser>('/users/me');
});
```

No hay paso de test automatizado para `getCurrentUser` en sí (es un wrapper directo de `apiFetch`, mismo patrón sin lógica propia que `getUsersList`, que tampoco tiene test dedicado).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/get-current-user.ts \
        apps/web/components/ui/avatar-initial.ts \
        apps/web/components/ui/avatar-initial.spec.ts
git commit -m "feat(web): agregar fetcher de usuario actual y helper de inicial para avatar"
```

---

### Task 3: Fondo decorativo glow

**Files:**

- Modify: `apps/web/app/globals.css`

**Interfaces:**

- Consumes: tokens `--brand-from`, `--brand-via`, `--brand-to` (ya existen en `:root`, `apps/web/app/globals.css:69-71`).
- Produces: nada que otros tasks consuman directamente — es un cambio puramente visual de fondo global, independiente del resto.

- [ ] **Step 1: Agregar el glow decorativo al fondo**

En `apps/web/app/globals.css`, agregar después del bloque `@layer base` existente (después de la línea 107):

```css
/*
 * Glow decorativo del fondo: dos manchas radiales grandes y difuminadas
 * con los colores de marca, muy baja opacidad. Sin esto el panel de
 * vidrio del sidebar (bg-card/60 + backdrop-blur) no tiene nada de color
 * debajo para que se note el efecto — el --background es un oklch sólido
 * parejo. Puramente decorativo, position: fixed para que no se mueva con
 * el scroll, pointer-events: none para no interceptar clicks.
 */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image:
    radial-gradient(
      circle at 15% 20%,
      color-mix(in oklch, var(--brand-from) 18%, transparent) 0%,
      transparent 45%
    ),
    radial-gradient(
      circle at 85% 75%,
      color-mix(in oklch, var(--brand-to) 15%, transparent) 0%,
      transparent 45%
    );
}
```

- [ ] **Step 2: Verificar que el build de CSS no rompe**

Run: `cd apps/web && npx jest`
Expected: PASS (los tests existentes no dependen del CSS; esto confirma que nada más se tocó). La verificación visual del glow se hace en Task 7, Step 9, cuando el sidebar ya está montado encima.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat(web): fondo con glow decorativo de marca"
```

---

### Task 4: Componente `Sidebar`

**Files:**

- Create: `apps/web/components/ui/sidebar.tsx`

**Interfaces:**

- Consumes: `BottomNavItem` (tipo, ya existe en `apps/web/components/ui/bottom-nav.tsx:9-13`), `getActiveNavHref` (ya existe, `apps/web/components/ui/bottom-nav-active.ts`), `CurrentUser` (Task 2), `inicialDe` (Task 2), `LogoutButton` (ya existe, `apps/web/components/logout-button.tsx`), `usePathname` de `next/navigation`.
- Produces: `export function Sidebar({ items, user, logoutRedirectTo }: { items: BottomNavItem[]; user: CurrentUser; logoutRedirectTo?: string })`. Lo consume Task 6 (`AppShell`).
- Nota: `items` llega desde Server Components (los layouts) y contiene íconos (`LucideIcon`, funciones). Funciona porque los arrays `*_NAV_ITEMS` están definidos en `bottom-nav.tsx`, que es un módulo `'use client'`: el server los pasa como client references. No mover esos arrays a un módulo sin `'use client'`.

- [ ] **Step 1: Implementar `Sidebar`**

```tsx
// apps/web/components/ui/sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { BottomNavItem } from './bottom-nav';
import { getActiveNavHref } from './bottom-nav-active';
import { inicialDe } from './avatar-initial';
import { LogoutButton } from '../logout-button';
import type { CurrentUser, Role } from '../../lib/get-current-user';

const ETIQUETA_ROL: Record<Role, string> = {
  ADMIN: 'Admin',
  PROFESOR: 'Profesor',
  ALUMNO: 'Alumno',
  SUPER_ADMIN: 'Súper Admin',
};

/**
 * Panel lateral fijo, solo desktop (`lg+`) — `hidden lg:flex`. Geometría
 * de columna completa (bloque de usuario arriba, nav al medio, logout
 * abajo) demasiado distinta de la barra inferior de mobile como para
 * compartir JSX con `BottomNav`; comparten datos (`items`,
 * `getActiveNavHref`), no markup.
 */
export function Sidebar({
  items,
  user,
  logoutRedirectTo = '/login',
}: {
  items: BottomNavItem[];
  user: CurrentUser;
  logoutRedirectTo?: string;
}) {
  const pathname = usePathname();
  const activeHref = getActiveNavHref(
    pathname,
    items.map((item) => item.href),
  );

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-border/60 bg-card/60 backdrop-blur-xl lg:flex">
      <div className="px-5 pb-2 pt-6">
        <span className="text-lg font-bold tracking-wide text-gradient-brand">Gimnasio Mix</span>
      </div>

      <div className="flex items-center gap-3 border-b border-border/60 px-5 py-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-sm font-semibold text-primary-foreground">
          {inicialDe(user.nombre)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{user.nombre}</p>
          <p className="truncate text-xs text-muted-foreground">{ETIQUETA_ROL[user.role]}</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {items.map((item) => {
          const activo = item.href === activeHref;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={activo ? 'page' : undefined}
              className={`group flex items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 transition-colors duration-200 ${
                activo
                  ? 'border-primary bg-primary/12 text-primary-soft'
                  : 'border-transparent text-muted-foreground hover:bg-accent/50'
              }`}
            >
              <Icon
                size={18}
                className="shrink-0 transition-transform duration-200 group-hover:scale-105"
                aria-hidden
              />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center justify-between border-t border-border/60 px-3 py-3">
        <span className="text-xs text-muted-foreground">Cerrar sesión</span>
        <LogoutButton redirectTo={logoutRedirectTo} />
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores nuevos relacionados a `sidebar.tsx` (puede haber ruido preexistente que no toca este archivo — ignorarlo).

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/ui/sidebar.tsx
git commit -m "feat(web): agregar componente Sidebar para desktop"
```

---

### Task 5: Simplificar `BottomNav` a mobile-only + pulido visual

**Files:**

- Modify: `apps/web/components/ui/bottom-nav.tsx`

**Interfaces:**

- Consumes: nada nuevo — mismos `BottomNavItem`, `getActiveNavHref` que ya usaba.
- Produces: mismo `export function BottomNav({ items }: { items: BottomNavItem[] })` — la firma no cambia, así que Task 6 no necesita tocar cómo se lo invoca, solo dónde.

- [ ] **Step 1: Simplificar el `<nav>` a mobile-only y pulir transiciones**

En `apps/web/components/ui/bottom-nav.tsx`, reemplazar el `return` completo de `BottomNav` (líneas 45-77):

```tsx
export function BottomNav({ items }: { items: BottomNavItem[] }) {
  const pathname = usePathname();
  const activeHref = getActiveNavHref(
    pathname,
    items.map((item) => item.href),
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex min-h-16 items-center justify-around border-t border-border/60 bg-card/70 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] lg:hidden">
      {items.map((item) => {
        const activo = item.href === activeHref;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={activo ? 'page' : undefined}
            className="flex min-w-11 flex-col items-center gap-1 px-3 py-1 transition-transform duration-150 active:scale-95"
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200 ${
                activo ? 'bg-gradient-brand' : ''
              }`}
            >
              <Icon
                size={18}
                className={activo ? 'text-primary-foreground' : 'text-muted-foreground'}
                aria-hidden
              />
            </span>
            <span
              className={`text-xs font-medium ${activo ? 'text-primary-soft' : 'text-muted-foreground'}`}
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

Cambios respecto al original: se eliminan todas las clases `lg:` que convertían esto en barra superior (`lg:top-0 lg:bottom-auto lg:h-12 lg:min-h-0 lg:border-b lg:border-t-0 lg:pb-0`), reemplazadas por `lg:hidden` — `AppShell` (Task 6) monta `Sidebar` aparte para desktop. Se sube `backdrop-blur` a `backdrop-blur-xl`, `border-border` a `border-border/60` (coherente con el panel del sidebar), se agrega `active:scale-95` con transición para feedback táctil y `aria-current="page"` en el ítem activo.

Nota: entre esta task y la Task 7 el desktop queda sin nav (la barra superior se fue y el sidebar todavía no está montado en los layouts). Es esperable en la rama; se resuelve en Task 7.

- [ ] **Step 2: Correr el test existente de la lógica de nav activa**

Run: `cd apps/web && npx jest bottom-nav-active.spec.ts`
Expected: PASS — no se tocó `getActiveNavHref`, sigue en verde sin cambios.

- [ ] **Step 3: Verificar que compila**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores nuevos en `bottom-nav.tsx`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/ui/bottom-nav.tsx
git commit -m "feat(web): BottomNav mobile-only con pulido visual (blur, transiciones)"
```

---

### Task 6: Componente `AppShell`

**Files:**

- Create: `apps/web/components/ui/app-shell.tsx`

**Interfaces:**

- Consumes: `Sidebar` (Task 4), `BottomNav` (Task 5, ya con firma mobile-only), `BottomNavItem`, `CurrentUser`.
- Produces: `export function AppShell({ items, user, logoutRedirectTo, children }: { items: BottomNavItem[]; user: CurrentUser; logoutRedirectTo?: string; children: ReactNode })`. Lo consume Task 7 (los 5 layouts).

- [ ] **Step 1: Implementar `AppShell`**

```tsx
// apps/web/components/ui/app-shell.tsx
import type { ReactNode } from 'react';
import type { BottomNavItem } from './bottom-nav';
import { BottomNav } from './bottom-nav';
import { Sidebar } from './sidebar';
import type { CurrentUser } from '../../lib/get-current-user';

/**
 * Compone la nav completa (Sidebar en desktop, BottomNav en mobile) y el
 * padding-left del contenido para que no quede tapado por el sidebar
 * fijo (`lg:pl-64`, mismo ancho que `Sidebar`). Centraliza acá el
 * patrón que antes se repetía en los 5 layouts de route group.
 */
export function AppShell({
  items,
  user,
  logoutRedirectTo = '/login',
  children,
}: {
  items: BottomNavItem[];
  user: CurrentUser;
  logoutRedirectTo?: string;
  children: ReactNode;
}) {
  return (
    <>
      <Sidebar items={items} user={user} logoutRedirectTo={logoutRedirectTo} />
      <div className="lg:pl-64">{children}</div>
      <BottomNav items={items} />
    </>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores nuevos en `app-shell.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/ui/app-shell.tsx
git commit -m "feat(web): agregar AppShell que compone Sidebar + BottomNav"
```

---

### Task 7: Wirear los 5 layouts a `AppShell` + ajustar offsets de desktop

**Files:**

- Modify: `apps/web/app/(admin)/layout.tsx`
- Modify: `apps/web/app/(profesor)/layout.tsx`
- Modify: `apps/web/app/(alumno)/layout.tsx`
- Modify: `apps/web/app/(catalogo)/layout.tsx`
- Modify: `apps/web/app/(super-admin)/layout.tsx`
- Modify: `apps/web/components/ui/page-header.tsx:17`
- Modify (solo la clase del `<main>`, `lg:pt-16` → `lg:pt-6`): `apps/web/app/(admin)/admin/page.tsx:15`, `apps/web/app/(super-admin)/super-admin/page.tsx:22`, `apps/web/app/(profesor)/profesor/page.tsx:26`, `apps/web/app/(profesor)/profesor/plantillas/page.tsx:27`, `apps/web/app/(profesor)/profesor/plantillas/[id]/page.tsx:32`, `apps/web/app/(profesor)/profesor/alumnos/[id]/page.tsx:36`, `apps/web/app/(alumno)/alumno/page.tsx:32` y `:56` (dos `<main>`), `apps/web/app/(catalogo)/catalogo/page.tsx:85`, `apps/web/app/(catalogo)/catalogo/[id]/page.tsx:62`

**Interfaces:**

- Consumes: `AppShell` (Task 6), `getCurrentUser` y `CurrentUser` (Task 2). `ADMIN_NAV_ITEMS`, `PROFESOR_NAV_ITEMS`, `ALUMNO_NAV_ITEMS`, tipo `BottomNavItem` (ya existen, `apps/web/components/ui/bottom-nav.tsx`).
- Produces: nada — última capa, ningún task posterior depende de esto.

- [ ] **Step 1: `(admin)/layout.tsx`**

Reemplazar todo el archivo:

```tsx
// apps/web/app/(admin)/layout.tsx
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { ApiError } from '../../lib/api-client';
import { getUsersList } from '../../lib/get-users-list';
import { getCurrentUser } from '../../lib/get-current-user';
import { AppShell } from '../../components/ui/app-shell';
import { ADMIN_NAV_ITEMS } from '../../components/ui/bottom-nav';

/**
 * Valida server-side que la sesión actual pertenece a un ADMIN — sin
 * reimplementar la verificación del JWT: llama a `GET /users` del backend,
 * gateado por `@Roles(ADMIN)` + `JwtAuthGuard`. Si responde 401/403,
 * redirige a `/login`. Usa `getUsersList()` (memoizada por request) en vez
 * de `apiFetch` directo — admin/page.tsx pide la misma lista para sus
 * datos, y sin la memoización se pagaba el round-trip dos veces por
 * navegación.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  try {
    await getUsersList();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  const user = await getCurrentUser();

  return (
    <AppShell items={ADMIN_NAV_ITEMS} user={user}>
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 2: `(profesor)/layout.tsx`**

Reemplazar todo el archivo:

```tsx
// apps/web/app/(profesor)/layout.tsx
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { ApiError } from '../../lib/api-client';
import { getCurrentUser, CurrentUser } from '../../lib/get-current-user';
import { AppShell } from '../../components/ui/app-shell';
import { PROFESOR_NAV_ITEMS } from '../../components/ui/bottom-nav';

/**
 * Exige rol PROFESOR real — pendiente desde el Bloque 3A, que dejó este
 * layout validando solo sesión porque /catalogo vivía acá adentro y lo
 * necesitaban los tres roles. Con /catalogo movido a su propio route
 * group (Bloque 3B), esta sección puede exigir el rol de verdad.
 * `/users/me` nunca devuelve 403 por rol (no tiene `@Roles`) — el
 * chequeo de rol se hace acá, comparando el campo `role` de la respuesta.
 */
export default async function ProfesorLayout({ children }: { children: ReactNode }) {
  let user: CurrentUser;
  try {
    user = await getCurrentUser();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  if (user.role !== 'PROFESOR') {
    redirect('/login');
  }

  return (
    <AppShell items={PROFESOR_NAV_ITEMS} user={user}>
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 3: `(alumno)/layout.tsx`**

Reemplazar todo el archivo:

```tsx
// apps/web/app/(alumno)/layout.tsx
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { ApiError } from '../../lib/api-client';
import { getCurrentUser, CurrentUser } from '../../lib/get-current-user';
import { AppShell } from '../../components/ui/app-shell';
import { ALUMNO_NAV_ITEMS } from '../../components/ui/bottom-nav';

/** Exige rol ALUMNO real — mismo criterio que (profesor)/layout.tsx. */
export default async function AlumnoLayout({ children }: { children: ReactNode }) {
  let user: CurrentUser;
  try {
    user = await getCurrentUser();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  if (user.role !== 'ALUMNO') {
    redirect('/login');
  }

  return (
    <AppShell items={ALUMNO_NAV_ITEMS} user={user}>
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 4: `(catalogo)/layout.tsx`**

Reemplazar todo el archivo. Mismo comportamiento que hoy (solo valida sesión, ítems de nav según rol, fallback a `ALUMNO_NAV_ITEMS`), pero vía `getCurrentUser` + `AppShell`:

```tsx
// apps/web/app/(catalogo)/layout.tsx
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { ApiError } from '../../lib/api-client';
import { getCurrentUser, CurrentUser } from '../../lib/get-current-user';
import { AppShell } from '../../components/ui/app-shell';
import {
  ALUMNO_NAV_ITEMS,
  PROFESOR_NAV_ITEMS,
  ADMIN_NAV_ITEMS,
  type BottomNavItem,
} from '../../components/ui/bottom-nav';

const NAV_ITEMS_POR_ROL: Partial<Record<CurrentUser['role'], BottomNavItem[]>> = {
  ALUMNO: ALUMNO_NAV_ITEMS,
  PROFESOR: PROFESOR_NAV_ITEMS,
  ADMIN: ADMIN_NAV_ITEMS,
};

/**
 * Solo valida sesión — el catálogo es legible por ADMIN/PROFESOR/ALUMNO
 * por igual. Route group propio (separado de (profesor)/(alumno)/(admin),
 * que sí exigen rol) porque el alumno necesita esta pantalla para HU-09
 * y no puede vivir bajo un layout que excluya su rol. Usa `user.role`
 * para saber qué variante de nav mostrar — es la única pantalla
 * compartida por los 3 roles.
 */
export default async function CatalogoLayout({ children }: { children: ReactNode }) {
  let user: CurrentUser;
  try {
    user = await getCurrentUser();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  return (
    <AppShell items={NAV_ITEMS_POR_ROL[user.role] ?? ALUMNO_NAV_ITEMS} user={user}>
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 5: `(super-admin)/layout.tsx`**

Reemplazar todo el archivo. Este caso no tiene `NAV_ITEMS` propio (una sola página, `/super-admin`, nunca tuvo nav) — se le pasa `items={[]}`, el sidebar muestra solo el bloque de usuario y logout, sin filas de nav:

```tsx
// apps/web/app/(super-admin)/layout.tsx
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { ApiError } from '../../lib/api-client';
import { getCurrentUser, CurrentUser } from '../../lib/get-current-user';
import { AppShell } from '../../components/ui/app-shell';

/**
 * Gate de rol SUPER_ADMIN. Mismo patrón que `(admin)/layout.tsx`, pero
 * usando `getCurrentUser()` (no hay lista propia del super admin que
 * memoizar) y redirigiendo a `/super-admin/login` en vez de `/login`.
 * `items={[]}`: no hay NAV_ITEMS propio (una sola página), el sidebar
 * muestra solo el bloque de usuario + logout.
 */
export default async function SuperAdminLayout({ children }: { children: ReactNode }) {
  let user: CurrentUser;
  try {
    user = await getCurrentUser();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/super-admin/login');
    }
    throw error;
  }

  if (user.role !== 'SUPER_ADMIN') {
    redirect('/super-admin/login');
  }

  return (
    <AppShell items={[]} user={user} logoutRedirectTo="/super-admin/login">
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 6: `PageHeader` sin offset de barra superior y con efecto glass**

En `apps/web/components/ui/page-header.tsx:17`, cambiar:

```tsx
// Antes:
<div className="sticky top-0 z-10 flex w-full items-center justify-between gap-3 bg-background py-2 lg:top-12">

// Después:
<div className="sticky top-0 z-10 flex w-full items-center justify-between gap-3 bg-background/70 py-2 backdrop-blur-xl">
```

Se elimina `lg:top-12` (asumía la barra superior fina que ya no existe: el header se pega al top en cualquier breakpoint) y la franja sólida `bg-background` pasa a `bg-background/70 backdrop-blur-xl`, para que no corte el efecto glass del fondo.

- [ ] **Step 7: Ajustar el padding superior de desktop en las páginas**

En cada `<main>` listado en **Files** (11 ocurrencias en 10 archivos), reemplazar `lg:pt-16` por `lg:pt-6`. Ese `lg:pt-16` compensaba la barra superior de 48px; sin ella, deja un hueco de 64px arriba del contenido.

En los dos `<main>` que además tienen `min-h-dvh bg-background` (`apps/web/app/(admin)/admin/page.tsx:15` y `apps/web/app/(super-admin)/super-admin/page.tsx:22`), sacar también `bg-background`: es opaco y tapa el glow del fondo en esas pantallas (`body` ya pinta ese mismo color de fondo). Ejemplo de `admin/page.tsx`:

```tsx
// Antes:
<main className="min-h-dvh bg-background px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-6 lg:pt-16">

// Después:
<main className="min-h-dvh px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-6 lg:pt-6">
```

No tocar ninguna otra clase de esos `<main>` (`pb-28` es el espacio del bottom nav de mobile y sigue siendo necesario).

Verificar que no quedó ninguna:

Run: `cd apps/web && grep -rn "lg:pt-16\|lg:top-12" app components`
Expected: sin resultados.

- [ ] **Step 8: Correr toda la suite de `apps/web` y verificar que no rompió nada**

Run: `cd apps/web && npx jest`
Expected: PASS — todos los tests existentes en verde, más los nuevos de `avatar-initial.spec.ts`.

- [ ] **Step 9: Verificar que compila**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 10: Verificación visual manual en las 5 secciones**

Run: `cd apps/web && pnpm dev` (con `apps/api` corriendo en paralelo, `pnpm dev` en esa carpeta — tiene que ser el API con Task 1, si no `nombre` no llega)

Loguearse como ADMIN, PROFESOR, ALUMNO y SUPER_ADMIN (uno por vez) y confirmar en cada caso, incluyendo `/catalogo` para los tres roles de gym:

- Desktop (ventana ancha, `lg+`): aparece el sidebar a la izquierda con "Gimnasio Mix" arriba, bloque de usuario (nombre + rol correcto), ítems de nav (vacío solo para super-admin; en `/catalogo` los del rol logueado), ítem activo resaltado según la página actual, logout funcional.
- Mobile (ventana angosta): sigue apareciendo el bottom nav de siempre, con el blur/transiciones nuevas, sin el sidebar.
- El contenido no queda tapado por el sidebar en desktop (`lg:pl-64` de `AppShell`) y no hay hueco arriba (`lg:pt-6`).
- Se nota el glow sutil del fondo detrás del sidebar y del `PageHeader` al hacer scroll.
- El logout del sidebar cierra sesión y redirige a `/login` (o `/super-admin/login` para ese caso).

Este paso no es automatizable razonablemente — es la verificación final de que todo el conjunto (Tasks 1-7) se ve y funciona como describe la spec.

- [ ] **Step 11: Commit**

```bash
git add apps/web/app/\(admin\)/layout.tsx \
        apps/web/app/\(profesor\)/layout.tsx \
        apps/web/app/\(alumno\)/layout.tsx \
        apps/web/app/\(catalogo\)/layout.tsx \
        apps/web/app/\(super-admin\)/layout.tsx \
        apps/web/components/ui/page-header.tsx \
        apps/web/app/\(admin\)/admin/page.tsx \
        apps/web/app/\(super-admin\)/super-admin/page.tsx \
        apps/web/app/\(profesor\)/profesor/page.tsx \
        apps/web/app/\(profesor\)/profesor/plantillas/page.tsx \
        "apps/web/app/(profesor)/profesor/plantillas/[id]/page.tsx" \
        "apps/web/app/(profesor)/profesor/alumnos/[id]/page.tsx" \
        apps/web/app/\(alumno\)/alumno/page.tsx \
        apps/web/app/\(catalogo\)/catalogo/page.tsx \
        "apps/web/app/(catalogo)/catalogo/[id]/page.tsx"
git commit -m "feat(web): wirear los 5 layouts a AppShell con sidebar de desktop"
```

---

## Rollout (fuera de las tasks — lo hace el usuario)

1. Llevar a `master` **solo** el commit de Task 1 (cherry-pick, es backend-only) y pushear. Vercel redeploya el web sin cambios visibles (inofensivo). Hacer **Manual Deploy en Render** de `apps/api` y verificar que un `GET /users/me` autenticado devuelve `nombre` y `username`.
2. Recién después, mergear el resto de la rama a `master` y pushear (Vercel deploya el frontend nuevo). Si se pushea todo junto, Vercel puede salir antes que Render y los layouts revientan por `user.nombre` `undefined` (ver Global Constraints).
