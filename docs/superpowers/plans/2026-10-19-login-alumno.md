# Login del alumno en página propia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El alumno ingresa en `/alumno/login` solo con su usuario; `/login` queda para profesor/admin con contraseña obligatoria, y cada redirección "al login" lleva al login del rol correcto.

**Architecture:** Solo `apps/web`. Un módulo puro `lib/login-routes.ts` decide los destinos (testeado con jest); una página + server action nuevas para el alumno, igual que `app/super-admin/login`; `logoutAction` resuelve el destino por rol cuando no recibe uno explícito.

**Tech Stack:** Next.js App Router (server actions, `useActionState`), Supabase SSR, jest.

**Spec:** `docs/superpowers/specs/2026-10-19-login-alumno-design.md`

## Global Constraints

- Sin cambios en `apps/api` (`POST /auth/login` ya usa la rama alumno cuando no viaja `password`).
- Textos: título "Ingresar"; placeholder "Usuario"; placeholder de staff "Contraseña"; error alumno "Usuario incorrecto."; error staff "Usuario o contraseña incorrectos."; links "¿Sos profesor o admin? Ingresá acá" y "¿Sos alumno? Ingresá acá".
- Cada login acepta solo sus roles: `/alumno/login` → `ALUMNO`; `/login` → `ADMIN`/`PROFESOR`. Rol equivocado → `signOut()` + error genérico.
- Commits solo con autorización del usuario.

---

### Task 1: `lib/login-routes.ts`

**Files:**

- Create: `apps/web/lib/login-routes.ts`
- Test: `apps/web/lib/login-routes.spec.ts`

**Interfaces:**

- Produces: `type RolUsuario = 'ADMIN' | 'PROFESOR' | 'ALUMNO' | 'SUPER_ADMIN'`; `loginDeRol(role: RolUsuario): string`; `loginPorSesionVencida(pathname: string): string`; `LOGIN_ALUMNO = '/alumno/login'`.

- [ ] **Step 1: Test que falla**

```ts
import { loginDeRol, loginPorSesionVencida } from './login-routes';

describe('loginDeRol', () => {
  it.each([
    ['ALUMNO', '/alumno/login'],
    ['PROFESOR', '/login'],
    ['ADMIN', '/login'],
    ['SUPER_ADMIN', '/super-admin/login'],
  ] as const)('%s → %s', (rol, destino) => {
    expect(loginDeRol(rol)).toBe(destino);
  });
});

describe('loginPorSesionVencida', () => {
  it.each([
    ['/profesor/alumnos/1', '/login?sessionExpired=1'],
    ['/admin', '/login?sessionExpired=1'],
    ['/super-admin', '/super-admin/login'],
    ['/alumno', '/alumno/login?sessionExpired=1'],
    ['/catalogo/x', '/alumno/login?sessionExpired=1'],
    ['/', '/alumno/login?sessionExpired=1'],
  ])('%s → %s', (ruta, destino) => {
    expect(loginPorSesionVencida(ruta)).toBe(destino);
  });

  it('no confunde /administracion con /admin', () => {
    expect(loginPorSesionVencida('/administracion')).toBe('/alumno/login?sessionExpired=1');
  });
});
```

- [ ] **Step 2:** `cd apps/web && pnpm test -- login-routes` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementación**

```ts
export type RolUsuario = 'ADMIN' | 'PROFESOR' | 'ALUMNO' | 'SUPER_ADMIN';

export const LOGIN_ALUMNO = '/alumno/login';

const LOGIN_POR_ROL: Record<RolUsuario, string> = {
  ALUMNO: LOGIN_ALUMNO,
  PROFESOR: '/login',
  ADMIN: '/login',
  SUPER_ADMIN: '/super-admin/login',
};

export function loginDeRol(role: RolUsuario): string {
  return LOGIN_POR_ROL[role];
}

function empiezaCon(pathname: string, prefijo: string): boolean {
  return pathname === prefijo || pathname.startsWith(`${prefijo}/`);
}

/**
 * Destino ante una sesión vencida detectada en el navegador, que no sabe
 * el rol: se infiere por la sección. Las pantallas compartidas
 * (`/catalogo`) caen en el login de alumno, que linkea al de staff.
 */
export function loginPorSesionVencida(pathname: string): string {
  if (empiezaCon(pathname, '/super-admin')) return '/super-admin/login';
  if (empiezaCon(pathname, '/profesor') || empiezaCon(pathname, '/admin')) {
    return '/login?sessionExpired=1';
  }
  return `${LOGIN_ALUMNO}?sessionExpired=1`;
}
```

- [ ] **Step 4:** `pnpm test -- login-routes` → PASS.

---

### Task 2: Login de alumno y `/login` solo para staff

**Files:**

- Create: `apps/web/app/alumno/login/page.tsx`, `apps/web/app/alumno/login/actions.ts`
- Modify: `apps/web/app/login/page.tsx`, `apps/web/app/login/actions.ts`

**Interfaces:** Consumes `LOGIN_ALUMNO` (Task 1).

- [ ] **Step 1: `app/alumno/login/actions.ts`**

```ts
'use server';

import { redirect } from 'next/navigation';
import { createWritableSupabaseServerClient } from '../../../lib/session-writable';
import { apiFetch } from '../../../lib/api-client';

export interface AlumnoLoginActionState {
  error: string | null;
}

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const ERROR_GENERICO = 'Usuario incorrecto.';

/** Sin `password`: el backend toma la rama de alumno (contraseña derivada). */
export async function alumnoLoginAction(
  _prevState: AlumnoLoginActionState,
  formData: FormData,
): Promise<AlumnoLoginActionState> {
  const gymId = String(formData.get('gymId') ?? '');
  const username = String(formData.get('username') ?? '');

  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gymId, username }),
    cache: 'no-store',
  });
  if (!response.ok) {
    return { error: ERROR_GENERICO };
  }

  const { accessToken, refreshToken } = await response.json();
  const supabase = await createWritableSupabaseServerClient();
  await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });

  const { role } = await apiFetch<{ role: string }>('/users/me');
  if (role !== 'ALUMNO') {
    await supabase.auth.signOut();
    return { error: ERROR_GENERICO };
  }

  redirect('/alumno');
}
```

- [ ] **Step 2: `app/alumno/login/page.tsx`** — mismo layout que `app/login/page.tsx` (logo, `h1` "Ingresar", aviso `sessionExpired` en `Suspense`, `gymId` oculto, botón con `useFormStatus`), con un solo campo:

```tsx
'use client';

import { Suspense, useActionState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { alumnoLoginAction, AlumnoLoginActionState } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import logoGimnasio from '../../../../../logo/mix-entrenamiento.png';

const ESTADO_INICIAL: AlumnoLoginActionState = { error: null };
const GYM_ID = process.env.NEXT_PUBLIC_GYM_ID ?? '';

function BotonIngresar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="brand" disabled={pending} className="w-full">
      {pending && <Spinner data-icon="inline-start" />}
      {pending ? 'Ingresando...' : 'Ingresar'}
    </Button>
  );
}

function AvisoSesionExpirada() {
  const searchParams = useSearchParams();
  if (searchParams.get('sessionExpired') !== '1') return null;
  return (
    <Alert className="mb-4">
      <AlertDescription>Tu sesión expiró. Ingresá de nuevo.</AlertDescription>
    </Alert>
  );
}

export default function AlumnoLoginPage() {
  const [estado, formAction] = useActionState(alumnoLoginAction, ESTADO_INICIAL);

  return (
    <main className="flex min-h-dvh flex-col justify-end bg-background px-6 pb-10 pt-8 lg:items-center lg:justify-center lg:px-4 lg:py-8">
      <div className="lg:w-full lg:max-w-sm lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:p-8">
        <div className="mb-6 flex justify-center">
          <div className="h-24 w-24 overflow-hidden rounded-full bg-card">
            <Image
              src={logoGimnasio}
              alt="Logo del gimnasio"
              className="h-full w-full object-cover"
              priority
            />
          </div>
        </div>
        <h1 className="mb-6 text-2xl font-semibold text-gradient-brand lg:text-xl">Ingresar</h1>
        <Suspense fallback={null}>
          <AvisoSesionExpirada />
        </Suspense>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="gymId" value={GYM_ID} />
          <Field>
            <FieldLabel htmlFor="alumno-login-username" className="sr-only">
              Usuario
            </FieldLabel>
            <Input
              id="alumno-login-username"
              name="username"
              placeholder="Usuario"
              required
              autoCapitalize="none"
              autoCorrect="off"
            />
          </Field>
          <BotonIngresar />
          {estado.error && (
            <Alert variant="destructive">
              <AlertDescription>{estado.error}</AlertDescription>
            </Alert>
          )}
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          ¿Sos profesor o admin?{' '}
          <Link href="/login" className="underline underline-offset-2 hover:text-foreground">
            Ingresá acá
          </Link>
        </p>
      </div>
    </main>
  );
}
```

Verificar la ruta relativa del logo contra la de `app/login/page.tsx` (`../../../../logo/...` desde `app/login/`; desde `app/alumno/login/` es un nivel más).

- [ ] **Step 3: `app/login/actions.ts`** — exigir contraseña y rechazar alumnos:
  - después de leer el form: `if (!password) return { error: 'Usuario o contraseña incorrectos.' };` y mandar siempre `{ gymId, username, password }`;
  - tipar `/users/me` como `{ role: 'ADMIN' | 'PROFESOR' | 'ALUMNO' }`; si `role === 'ALUMNO'`: `await supabase.auth.signOut(); return { error: 'Usuario o contraseña incorrectos.' };`;
  - `destinoPorRole` queda con `ADMIN` y `PROFESOR` (`Record<'ADMIN' | 'PROFESOR', string>`).

- [ ] **Step 4: `app/login/page.tsx`** — input de contraseña con `required` y `placeholder="Contraseña"`; agregar `import Link from 'next/link';` y, después de `</form>`:

```tsx
<p className="mt-6 text-center text-sm text-muted-foreground">
  ¿Sos alumno?{' '}
  <Link href="/alumno/login" className="underline underline-offset-2 hover:text-foreground">
    Ingresá acá
  </Link>
</p>
```

- [ ] **Step 5:** `npx tsc --noEmit && pnpm test` (desde `apps/web`) → limpio.

---

### Task 3: Redirecciones y cerrar sesión por rol

**Files:**

- Modify: `apps/web/app/page.tsx`, `apps/web/app/(alumno)/layout.tsx`, `apps/web/app/(catalogo)/layout.tsx`, `apps/web/lib/browser-api-client.ts`, `apps/web/lib/logout-action.ts`, `apps/web/components/logout-button.tsx`, `apps/web/components/ui/app-shell.tsx`, `apps/web/components/ui/sidebar.tsx`

**Interfaces:** Consumes `LOGIN_ALUMNO`, `loginDeRol`, `loginPorSesionVencida`, `RolUsuario` (Task 1).

- [ ] **Step 1:** `app/page.tsx`: en el 401/403, `redirect(LOGIN_ALUMNO)` (actualizar el comentario: sin sesión → login de alumno).
- [ ] **Step 2:** `app/(alumno)/layout.tsx`: los dos `redirect('/login')` → `redirect(LOGIN_ALUMNO)`.
- [ ] **Step 3:** `app/(catalogo)/layout.tsx`: `redirect('/login')` → `redirect('/')`.
- [ ] **Step 4:** `lib/browser-api-client.ts`: `window.location.href = loginPorSesionVencida(window.location.pathname);`.
- [ ] **Step 5: `lib/logout-action.ts`**

```ts
'use server';

import { redirect } from 'next/navigation';
import { createWritableSupabaseServerClient } from './session-writable';
import { apiFetch } from './api-client';
import { loginDeRol, RolUsuario } from './login-routes';

async function loginDelUsuarioActual(): Promise<string> {
  try {
    const { role } = await apiFetch<{ role: RolUsuario }>('/users/me');
    return loginDeRol(role);
  } catch {
    return '/';
  }
}

/**
 * Invalida la sesión de Supabase y redirige. Sin `redirectTo`, el destino
 * es el login del rol del usuario, resuelto ANTES de cerrar la sesión
 * (después ya no hay token para preguntar); si no se puede resolver, `/`.
 */
export async function logoutAction(redirectTo?: string): Promise<void> {
  const destino = redirectTo ?? (await loginDelUsuarioActual());
  const supabase = await createWritableSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(destino);
}
```

- [ ] **Step 6:** `components/logout-button.tsx`: prop `redirectTo?: string` sin default; `logoutAction.bind(null, redirectTo)`; actualizar el comentario (sin destino → login según rol).
- [ ] **Step 7:** `components/ui/app-shell.tsx` y `components/ui/sidebar.tsx`: quitar el default `logoutRedirectTo = '/login'` (queda `logoutRedirectTo?: string` y se pasa tal cual). `(super-admin)/layout.tsx` y `super-admin/page.tsx` siguen pasando `/super-admin/login`.
- [ ] **Step 8:** `grep -rn "'/login'" apps/web --include=*.ts --include=*.tsx | grep -v node_modules` → solo quedan los usos de staff (`app/alumno/login/page.tsx` link, `lib/login-routes.ts`).
- [ ] **Step 9:** `npx tsc --noEmit && pnpm test && npx prettier --check` sobre los archivos tocados → limpio.

### Verificación manual (con el usuario, `pnpm dev`)

1. `/` sin sesión → `/alumno/login`.
2. Alumno con solo usuario → `/alumno`. Cerrar sesión → `/alumno/login`.
3. Alumno en `/login` (sin contraseña no deja enviar; con cualquier contraseña) → error.
4. Profe en `/alumno/login` → "Usuario incorrecto.". Profe en `/login` → `/profesor`; cerrar sesión → `/login`.
5. Links entre páginas.
