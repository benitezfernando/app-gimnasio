# Densidad Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar densidad real de desktop (`lg:` = 1024px+) a toda la app — nav arriba en vez de abajo, botones/inputs/tarjetas más chicos — sin cambiar absolutamente nada del comportamiento/apariencia por debajo de ese breakpoint.

**Architecture:** Todo cambio es una clase `lg:` agregada encima de las clases mobile existentes, nunca un reemplazo. El `BottomNav` se reposiciona vía clases condicionales al breakpoint (mismo componente, misma lógica de tab activo). Se extrae un componente `PrimaryButton` para centralizar la densidad del botón de acción principal, duplicado hoy en 7 archivos. El resto (Card, Pill, inputs, botones secundarios) recibe overrides `lg:` mecánicos por archivo.

**Tech Stack:** Next.js 14 App Router, Tailwind (breakpoint `lg:` = `@media (min-width: 1024px)`, nativo, sin config extra).

## Global Constraints

- Breakpoint de desktop: `lg:` (1024px+). Nunca `sm:`/`md:` para densidad — esos rangos incluyen tablets/ventanas angostas donde el dedo sigue siendo el input principal.
- Toda clase nueva es `lg:<algo>` agregada — ningún archivo pierde una clase mobile existente.
- `BottomNav` en desktop: `lg:inset-x-0 lg:top-0 lg:bottom-auto lg:h-12 lg:min-h-0 lg:border-b lg:border-t-0`, items en fila (`lg:flex-row lg:gap-2`) en vez de columna.
- `PageHeader` en desktop: `lg:top-12` (coincide exacto con `h-12` del nav — si no coinciden, el header sticky queda tapado por el nav o deja un hueco). Título `lg:text-sm`.
- Cada `<main>` de pantalla-con-nav: el `pb-28` mobile (lugar para el nav abajo) pasa a `lg:pb-6` en desktop; el `pt-*` mobile (4/6/8 según pantalla) pasa a **`lg:pt-16`** en TODAS — no `lg:pt-4`. Motivo (afinado durante este plan, no en el spec original): `BottomNav` es `fixed`, sale del flujo del documento; en desktop pasa a `top-0` con `h-12` (48px) — si el `<main>` no reserva al menos esos 48px arriba, su primer hijo (el `PageHeader`) renderiza detrás del nav fijo. `pt-16` (64px) dan 48px de clearance + 16px de aire, superando cualquier valor de `pt-*` mobile que hubiera antes.
- Botón primario (`PrimaryButton`, Task 1): base `min-h-11 rounded-lg bg-gradient-accent font-medium text-accent-fg disabled:opacity-50 lg:min-h-9`, + una variante de tamaño (`size`) que fija texto/padding para mobile Y desktop en un solo lugar (evita el bug ya documentado en este proyecto de dos clases del mismo breakpoint pisándose por orden de hoja de estilos, ej. `px-4` del caller vs `px-6` de una variante — acá `size` decide un único string sin solaparse con lo que el caller pasa en `className`).
- Botones/inputs secundarios (fuera de `PrimaryButton`): agregan `lg:min-h-9` (y `lg:text-sm`/`lg:px-3` donde corresponda) directo en su archivo — sin extraer componente nuevo, mecánico.
- Los íconos de Lucide (`size={...}` como prop numérica) NO cambian de tamaño en este plan — solo el contenedor (botón/círculo) se achica. Es una simplificación deliberada, no un placeholder: un ícono levemente más grande relativo a su contenedor en desktop es un costo estético aceptado, no un bug.

---

### Task 1: Componente `PrimaryButton` + migración de los 7 call sites

**Files:**

- Create: `apps/web/components/ui/primary-button.tsx`
- Modify: `apps/web/app/login/page.tsx`
- Modify: `apps/web/app/(admin)/admin/create-alumno-form.tsx`
- Modify: `apps/web/app/(admin)/admin/create-profesor-form.tsx`
- Modify: `apps/web/app/(profesor)/profesor/plantillas/create-template-form.tsx`
- Modify: `apps/web/app/(profesor)/profesor/alumnos/[id]/assign-template-form.tsx`
- Modify: `apps/web/app/(admin)/admin/cartera-panel.tsx`
- Modify: `apps/web/components/routine-exercises-editor.tsx`

**Interfaces:**

- Produces: `export function PrimaryButton({ children, type, onClick, disabled, size, className }: { children: ReactNode; type?: 'button' | 'submit'; onClick?: () => void; disabled?: boolean; size?: 'base' | 'sm' | 'sm-wide'; className?: string })` — usado en todas las tasks siguientes que toquen botones de acción primaria (ninguna otra task de este plan lo hace, pero queda disponible).

- [ ] **Step 1: Crear `PrimaryButton`**

Crear `apps/web/components/ui/primary-button.tsx`:

```tsx
import type { ReactNode } from 'react';

type PrimaryButtonSize = 'base' | 'sm' | 'sm-wide';

// Cada variante fija texto + padding-x para mobile Y desktop en un único
// string — así el `className` del caller nunca necesita pisar `px-*`/
// `text-*` (evita el conflicto de especificidad entre dos clases del
// mismo breakpoint que ya se documentó en este proyecto).
const TAMANOS: Record<PrimaryButtonSize, string> = {
  base: 'px-4 text-base lg:px-4 lg:text-sm',
  sm: 'px-4 text-sm lg:px-3 lg:text-sm',
  'sm-wide': 'px-6 text-sm lg:px-4 lg:text-sm',
};

export function PrimaryButton({
  children,
  type = 'button',
  onClick,
  disabled,
  size = 'base',
  className = '',
}: {
  children: ReactNode;
  type?: 'button' | 'submit';
  onClick?: () => void;
  disabled?: boolean;
  size?: PrimaryButtonSize;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 rounded-lg bg-gradient-accent font-medium text-accent-fg disabled:opacity-50 lg:min-h-9 ${TAMANOS[size]} ${className}`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: `app/login/page.tsx` — migrar `BotonIngresar`**

Agregar el import (junto a los otros):

```tsx
import { PrimaryButton } from '../../components/ui/primary-button';
```

Reemplazar:

```tsx
<button
  type="submit"
  disabled={pending}
  className="min-h-11 rounded-lg bg-gradient-accent px-4 text-base font-medium text-accent-fg active:opacity-90 disabled:opacity-50"
>
  {pending ? 'Ingresando...' : 'Ingresar'}
</button>
```

por:

```tsx
<PrimaryButton type="submit" disabled={pending} className="active:opacity-90">
  {pending ? 'Ingresando...' : 'Ingresar'}
</PrimaryButton>
```

- [ ] **Step 3: `app/(admin)/admin/create-alumno-form.tsx` — migrar `BotonCrear`**

Agregar import: `import { PrimaryButton } from '../../../components/ui/primary-button';`

Reemplazar:

```tsx
<button
  type="submit"
  disabled={pending}
  className="min-h-11 w-full rounded-lg bg-gradient-accent px-4 text-base font-medium text-accent-fg active:opacity-90 disabled:opacity-50 sm:w-auto"
>
  {pending ? 'Creando...' : 'Crear alumno'}
</button>
```

por:

```tsx
<PrimaryButton type="submit" disabled={pending} className="w-full active:opacity-90 sm:w-auto">
  {pending ? 'Creando...' : 'Crear alumno'}
</PrimaryButton>
```

- [ ] **Step 4: `app/(admin)/admin/create-profesor-form.tsx` — migrar `BotonCrear`**

Agregar import: `import { PrimaryButton } from '../../../components/ui/primary-button';`

Reemplazar:

```tsx
<button
  type="submit"
  disabled={pending}
  className="min-h-11 w-full rounded-lg bg-gradient-accent px-4 text-base font-medium text-accent-fg active:opacity-90 disabled:opacity-50 sm:w-auto"
>
  {pending ? 'Creando...' : 'Crear profesor'}
</button>
```

por:

```tsx
<PrimaryButton type="submit" disabled={pending} className="w-full active:opacity-90 sm:w-auto">
  {pending ? 'Creando...' : 'Crear profesor'}
</PrimaryButton>
```

- [ ] **Step 5: `app/(profesor)/profesor/plantillas/create-template-form.tsx` — migrar `BotonCrear`**

Agregar import: `import { PrimaryButton } from '../../../../components/ui/primary-button';`

Reemplazar (nota: esta variante NO tenía `active:opacity-90` en el original — no agregarlo):

```tsx
<button
  type="submit"
  disabled={pending}
  className="min-h-11 w-full rounded-lg bg-gradient-accent px-4 text-base font-medium text-accent-fg disabled:opacity-50 sm:w-auto"
>
  {pending ? 'Creando...' : 'Crear plantilla'}
</button>
```

por:

```tsx
<PrimaryButton type="submit" disabled={pending} className="w-full sm:w-auto">
  {pending ? 'Creando...' : 'Crear plantilla'}
</PrimaryButton>
```

- [ ] **Step 6: `app/(profesor)/profesor/alumnos/[id]/assign-template-form.tsx` — migrar el botón "Asignar plantilla"**

Agregar import: `import { PrimaryButton } from '../../../../../components/ui/primary-button';`

Reemplazar:

```tsx
<button
  type="button"
  onClick={asignar}
  disabled={asignando || !templateId || !nombre.trim()}
  className="min-h-11 rounded-lg bg-gradient-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50"
>
  {asignando ? 'Asignando...' : 'Asignar plantilla'}
</button>
```

por:

```tsx
<PrimaryButton
  type="button"
  onClick={asignar}
  disabled={asignando || !templateId || !nombre.trim()}
  size="sm"
>
  {asignando ? 'Asignando...' : 'Asignar plantilla'}
</PrimaryButton>
```

- [ ] **Step 7: `app/(admin)/admin/cartera-panel.tsx` — migrar el botón "Asignar"**

Agregar import: `import { PrimaryButton } from '../../../components/ui/primary-button';`

Reemplazar:

```tsx
<button
  onClick={asignar}
  disabled={!profesorSeleccionado}
  className="min-h-11 rounded-lg bg-gradient-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-50"
>
  Asignar
</button>
```

por (se agrega `type="button"` explícito — el original no lo tenía pero no está dentro de un `<form>`, así que no cambia comportamiento, solo lo hace explícito):

```tsx
<PrimaryButton type="button" onClick={asignar} disabled={!profesorSeleccionado} size="sm">
  Asignar
</PrimaryButton>
```

- [ ] **Step 8: `components/routine-exercises-editor.tsx` — migrar el botón "Guardar ejercicios"**

Agregar import: `import { PrimaryButton } from './ui/primary-button';`

Reemplazar:

```tsx
<button
  type="button"
  onClick={() => onGuardar(ejercicios)}
  disabled={guardando || ejercicios.length === 0}
  className="min-h-11 self-start rounded-lg bg-gradient-accent px-6 text-sm font-medium text-accent-fg disabled:opacity-50"
>
  {guardando ? 'Guardando...' : 'Guardar ejercicios'}
</button>
```

por:

```tsx
<PrimaryButton
  type="button"
  onClick={() => onGuardar(ejercicios)}
  disabled={guardando || ejercicios.length === 0}
  size="sm-wide"
  className="self-start"
>
  {guardando ? 'Guardando...' : 'Guardar ejercicios'}
</PrimaryButton>
```

- [ ] **Step 9: Verificar**

Run: `cd apps/web && npx jest && npx next build`
Expected: PASS / build sin errores. Verificación manual: las 7 pantallas (login, crear alumno, crear profesor, crear plantilla, asignar plantilla a alumno, asignar profesor en cartera, guardar ejercicios de rutina) se ven idénticas a como estaban en mobile (viewport < 1024px); en viewport ≥1024px los 7 botones se ven más chicos (`min-h-9`, texto `text-sm`, padding reducido).

- [ ] **Step 10: Commit**

```bash
git add apps/web/components/ui/primary-button.tsx apps/web/app/login/page.tsx "apps/web/app/(admin)/admin/create-alumno-form.tsx" "apps/web/app/(admin)/admin/create-profesor-form.tsx" "apps/web/app/(profesor)/profesor/plantillas/create-template-form.tsx" "apps/web/app/(profesor)/profesor/alumnos/[id]/assign-template-form.tsx" "apps/web/app/(admin)/admin/cartera-panel.tsx" apps/web/components/routine-exercises-editor.tsx
git commit -m "feat(web): extrae PrimaryButton con densidad de desktop"
```

---

### Task 2: `BottomNav` a top-nav en desktop + `PageHeader`/`LogoutButton` ajustados

**Files:**

- Modify: `apps/web/components/ui/bottom-nav.tsx`
- Modify: `apps/web/components/ui/page-header.tsx`
- Modify: `apps/web/components/logout-button.tsx`

**Interfaces:**

- Consumes/Produces: ninguna interfaz cambia (`BottomNav({ items })`, `PageHeader({ title, onBack, right })`, `LogoutButton()` — mismas firmas, solo cambian classNames internos). Ningún consumidor de estos 3 componentes necesita cambios.

- [ ] **Step 1: `bottom-nav.tsx` — nav arriba en desktop**

Reemplazar el `<nav>` completo:

```tsx
    <nav
      className="fixed inset-x-0 bottom-0 z-10 flex min-h-16 items-center justify-around border-t border-border bg-surface-alt"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
```

por:

```tsx
    <nav
      className="fixed inset-x-0 bottom-0 z-10 flex min-h-16 items-center justify-around border-t border-border bg-surface-alt lg:inset-x-0 lg:top-0 lg:bottom-auto lg:h-12 lg:min-h-0 lg:border-b lg:border-t-0"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
```

Reemplazar el `<Link>` de cada item:

```tsx
          <Link
            key={item.href}
            href={item.href}
            className="flex min-w-11 flex-col items-center gap-1 px-3 py-1"
          >
```

por:

```tsx
          <Link
            key={item.href}
            href={item.href}
            className="flex min-w-11 flex-col items-center gap-1 px-3 py-1 lg:flex-row lg:gap-2"
          >
```

(el `style` inline con `env(safe-area-inset-bottom)` queda igual — no aplica en desktop porque el nav ya no está en `bottom`, pero un `padding-bottom` inofensivo en un elemento `top` no rompe nada)

- [ ] **Step 2: `page-header.tsx` — offset y densidad de desktop**

Reemplazar:

```tsx
    <div className="sticky top-0 z-10 flex w-full items-center justify-between gap-3 bg-surface py-2">
```

por:

```tsx
    <div className="sticky top-0 z-10 flex w-full items-center justify-between gap-3 bg-surface py-2 lg:top-12">
```

Reemplazar:

```tsx
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-text"
          >
```

por:

```tsx
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-text lg:min-h-9 lg:min-w-9"
          >
```

Reemplazar:

```tsx
<h1 className="flex-1 text-center text-base font-semibold text-text">{title}</h1>
```

por:

```tsx
<h1 className="flex-1 text-center text-base font-semibold text-text lg:text-sm">{title}</h1>
```

- [ ] **Step 3: `logout-button.tsx` — densidad de desktop**

Reemplazar:

```tsx
className =
  'flex h-11 w-11 items-center justify-center rounded-full text-text active:bg-surface-alt';
```

por:

```tsx
className =
  'flex h-11 w-11 items-center justify-center rounded-full text-text active:bg-surface-alt lg:h-9 lg:w-9';
```

- [ ] **Step 4: Verificar**

Run: `cd apps/web && npx jest && npx next build`
Expected: PASS / build sin errores. Verificación manual en viewport ≥1024px: el nav aparece arriba (no abajo), en fila; el `PageHeader` de cada pantalla queda pegado justo debajo del nav, sin superponerse ni dejar hueco. En viewport <1024px: todo igual que antes (nav abajo en columna, header pegado arriba de la pantalla).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui/bottom-nav.tsx apps/web/components/ui/page-header.tsx apps/web/components/logout-button.tsx
git commit -m "feat(web): BottomNav pasa a top-nav en desktop, PageHeader se acomoda debajo"
```

---

### Task 3: `Card` y `Pill` — densidad de desktop

**Files:**

- Modify: `apps/web/components/ui/card.tsx`
- Modify: `apps/web/components/ui/pill.tsx`

**Interfaces:** ninguna cambia.

- [ ] **Step 1: `card.tsx`**

Reemplazar:

```tsx
return <div className={`rounded-2xl bg-surface-alt p-4 ${className}`}>{children}</div>;
```

por:

```tsx
return <div className={`rounded-2xl bg-surface-alt p-4 lg:p-3 ${className}`}>{children}</div>;
```

- [ ] **Step 2: `pill.tsx`**

Reemplazar:

```tsx
      className={`inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-muted ${className}`}
```

por:

```tsx
      className={`inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-muted lg:px-2 lg:py-0.5 ${className}`}
```

- [ ] **Step 3: Verificar**

Run: `cd apps/web && npx jest && npx next build`
Expected: PASS / build sin errores. Verificación manual: las tarjetas de ejercicio/rutina y las pills de series/reps/peso se ven idénticas en mobile, levemente más compactas en viewport ≥1024px.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/ui/card.tsx apps/web/components/ui/pill.tsx
git commit -m "feat(web): Card y Pill con densidad de desktop"
```

---

### Task 4: Los 9 `<main>` de pantalla-con-nav — clearance correcto para el nav arriba

**Files:**

- Modify: `apps/web/app/(profesor)/profesor/plantillas/page.tsx`
- Modify: `apps/web/app/(profesor)/profesor/alumnos/[id]/page.tsx`
- Modify: `apps/web/app/(alumno)/alumno/page.tsx` (2 ocurrencias de `<main>`)
- Modify: `apps/web/app/(catalogo)/catalogo/page.tsx`
- Modify: `apps/web/app/(profesor)/profesor/page.tsx`
- Modify: `apps/web/app/(catalogo)/catalogo/[id]/page.tsx`
- Modify: `apps/web/app/(admin)/admin/page.tsx`
- Modify: `apps/web/app/(profesor)/profesor/plantillas/[id]/page.tsx`

**Interfaces:** ninguna cambia — solo `className`.

- [ ] **Step 1: `app/(profesor)/profesor/plantillas/page.tsx`**

Reemplazar:

```tsx
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl">
```

por:

```tsx
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-16">
```

- [ ] **Step 2: `app/(profesor)/profesor/alumnos/[id]/page.tsx`**

Reemplazar:

```tsx
    <main className="flex w-full flex-col gap-6 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl">
```

por:

```tsx
    <main className="flex w-full flex-col gap-6 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-16">
```

- [ ] **Step 3: `app/(alumno)/alumno/page.tsx` — las 2 ocurrencias**

Reemplazar:

```tsx
      <main className="flex w-full flex-col items-center gap-2 px-8 pb-28 pt-8 text-center sm:mx-auto sm:max-w-2xl">
```

por:

```tsx
      <main className="flex w-full flex-col items-center gap-2 px-8 pb-28 pt-8 text-center sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-16">
```

Reemplazar:

```tsx
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl">
```

por:

```tsx
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-16">
```

- [ ] **Step 4: `app/(catalogo)/catalogo/page.tsx`**

Reemplazar:

```tsx
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-5xl">
```

por:

```tsx
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-5xl lg:pb-6 lg:pt-16">
```

- [ ] **Step 5: `app/(profesor)/profesor/page.tsx`**

Reemplazar:

```tsx
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl">
```

por:

```tsx
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-16">
```

- [ ] **Step 6: `app/(catalogo)/catalogo/[id]/page.tsx`**

Reemplazar:

```tsx
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl">
```

por:

```tsx
    <main className="flex w-full flex-col gap-4 px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-16">
```

- [ ] **Step 7: `app/(admin)/admin/page.tsx`**

Reemplazar:

```tsx
    <main className="min-h-dvh bg-surface px-4 pb-28 pt-6 sm:px-6 lg:px-8">
```

por:

```tsx
    <main className="min-h-dvh bg-surface px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-6 lg:pt-16">
```

- [ ] **Step 8: `app/(profesor)/profesor/plantillas/[id]/page.tsx`**

Reemplazar:

```tsx
    <main className="w-full px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl">
```

por:

```tsx
    <main className="w-full px-4 pb-28 pt-4 sm:mx-auto sm:max-w-2xl lg:pb-6 lg:pt-16">
```

- [ ] **Step 9: Verificar**

Run: `cd apps/web && npx jest && npx next build`
Expected: PASS / build sin errores. Verificación manual crítica en viewport ≥1024px, las 9 pantallas: el `PageHeader`/título de cada una debe verse completo, nunca tapado por el nav superior — es el punto de mayor riesgo de este plan (clearance incorrecto = header invisible).

- [ ] **Step 10: Commit**

```bash
git add "apps/web/app/(profesor)/profesor/plantillas/page.tsx" "apps/web/app/(profesor)/profesor/alumnos/[id]/page.tsx" "apps/web/app/(alumno)/alumno/page.tsx" "apps/web/app/(catalogo)/catalogo/page.tsx" "apps/web/app/(profesor)/profesor/page.tsx" "apps/web/app/(catalogo)/catalogo/[id]/page.tsx" "apps/web/app/(admin)/admin/page.tsx" "apps/web/app/(profesor)/profesor/plantillas/[id]/page.tsx"
git commit -m "fix(web): clearance correcto en los 9 <main> para el nav fijo arriba en desktop"
```

---

### Task 5: Inputs y selects sueltos — densidad de desktop

**Files:**

- Modify: `apps/web/app/(profesor)/profesor/plantillas/create-template-form.tsx` (2 inputs)
- Modify: `apps/web/app/login/page.tsx` (2 inputs)
- Modify: `apps/web/app/(admin)/admin/create-profesor-form.tsx` (1 constante `INPUT_CLASSES`)
- Modify: `apps/web/app/(admin)/admin/create-alumno-form.tsx` (1 constante `INPUT_CLASSES`)
- Modify: `apps/web/app/(admin)/admin/users-list.tsx` (1 select)
- Modify: `apps/web/app/(profesor)/profesor/alumnos/[id]/instance-editor.tsx` (1 input)
- Modify: `apps/web/app/(profesor)/profesor/alumnos/[id]/assign-template-form.tsx` (1 select + 1 input)
- Modify: `apps/web/app/(catalogo)/catalogo/page.tsx` (1 input de búsqueda + 1 select)
- Modify: `apps/web/app/(admin)/admin/cartera-panel.tsx` (1 select)

**Interfaces:** ninguna cambia — solo `className`.

- [ ] **Step 1: `create-template-form.tsx` — las 2 ocurrencias de**

```tsx
className =
  'min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted';
```

reemplazar CADA UNA por:

```tsx
className =
  'min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted lg:min-h-9 lg:text-sm';
```

- [ ] **Step 2: `login/page.tsx` — las 2 ocurrencias de**

```tsx
className =
  'min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted focus:border-accent focus:outline-none';
```

reemplazar CADA UNA por:

```tsx
className =
  'min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted focus:border-accent focus:outline-none lg:min-h-9 lg:text-sm';
```

- [ ] **Step 3: `create-profesor-form.tsx`**

Reemplazar:

```tsx
const INPUT_CLASSES =
  'min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted focus:border-accent focus:outline-none';
```

por:

```tsx
const INPUT_CLASSES =
  'min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted focus:border-accent focus:outline-none lg:min-h-9 lg:text-sm';
```

- [ ] **Step 4: `create-alumno-form.tsx`**

Reemplazar:

```tsx
const INPUT_CLASSES =
  'min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted focus:border-accent focus:outline-none';
```

por:

```tsx
const INPUT_CLASSES =
  'min-h-11 rounded-lg border border-border bg-surface px-4 text-base text-text placeholder:text-text-muted focus:border-accent focus:outline-none lg:min-h-9 lg:text-sm';
```

- [ ] **Step 5: `users-list.tsx` — el select de filtro por rol**

Reemplazar:

```tsx
className = 'min-h-11 rounded-lg border border-border bg-surface px-3 text-base text-text';
```

por:

```tsx
className =
  'min-h-11 rounded-lg border border-border bg-surface px-3 text-base text-text lg:min-h-9 lg:text-sm';
```

- [ ] **Step 6: `instance-editor.tsx`**

Reemplazar:

```tsx
className =
  'min-h-11 rounded-lg border border-border bg-surface px-3 text-text placeholder:text-text-muted';
```

por:

```tsx
className =
  'min-h-11 rounded-lg border border-border bg-surface px-3 text-text placeholder:text-text-muted lg:min-h-9';
```

(esta ya no tenía `text-base` explícito en el original — no se agrega `lg:text-sm`, solo se achica el alto)

- [ ] **Step 7: `assign-template-form.tsx` — el select y el input**

Reemplazar:

```tsx
className = 'min-h-11 rounded-lg border border-border bg-surface px-3 text-text';
```

por:

```tsx
className = 'min-h-11 rounded-lg border border-border bg-surface px-3 text-text lg:min-h-9';
```

Reemplazar:

```tsx
className =
  'min-h-11 rounded-lg border border-border bg-surface px-3 text-text placeholder:text-text-muted';
```

por:

```tsx
className =
  'min-h-11 rounded-lg border border-border bg-surface px-3 text-text placeholder:text-text-muted lg:min-h-9';
```

- [ ] **Step 8: `catalogo/page.tsx` — input de búsqueda y select de equipamiento**

Reemplazar:

```tsx
className =
  'min-h-11 w-full bg-transparent text-base text-text outline-none placeholder:text-text-muted';
```

por:

```tsx
className =
  'min-h-11 w-full bg-transparent text-base text-text outline-none placeholder:text-text-muted lg:min-h-9 lg:text-sm';
```

Reemplazar:

```tsx
className = 'min-h-11 rounded-lg border border-border bg-surface px-3 text-base text-text';
```

por:

```tsx
className =
  'min-h-11 rounded-lg border border-border bg-surface px-3 text-base text-text lg:min-h-9 lg:text-sm';
```

- [ ] **Step 9: `cartera-panel.tsx` — el select de profesor**

Reemplazar:

```tsx
className = 'min-h-11 flex-1 rounded-lg border border-border bg-surface px-3 text-base text-text';
```

por:

```tsx
className =
  'min-h-11 flex-1 rounded-lg border border-border bg-surface px-3 text-base text-text lg:min-h-9 lg:text-sm';
```

- [ ] **Step 10: Verificar**

Run: `cd apps/web && npx jest && npx next build`
Expected: PASS / build sin errores. Verificación manual en viewport ≥1024px de cada uno de los 9 archivos tocados: inputs/selects más bajos, mobile sin cambios.

- [ ] **Step 11: Commit**

```bash
git add "apps/web/app/(profesor)/profesor/plantillas/create-template-form.tsx" apps/web/app/login/page.tsx "apps/web/app/(admin)/admin/create-profesor-form.tsx" "apps/web/app/(admin)/admin/create-alumno-form.tsx" "apps/web/app/(admin)/admin/users-list.tsx" "apps/web/app/(profesor)/profesor/alumnos/[id]/instance-editor.tsx" "apps/web/app/(profesor)/profesor/alumnos/[id]/assign-template-form.tsx" "apps/web/app/(catalogo)/catalogo/page.tsx" "apps/web/app/(admin)/admin/cartera-panel.tsx"
git commit -m "fix(web): densidad de desktop en inputs y selects sueltos"
```

---

### Task 6: Botones secundarios, chips de filtro e íconos táctiles — densidad de desktop

**Files:**

- Modify: `apps/web/app/(admin)/admin/users-list.tsx` (2 botones: Desactivar/Eliminar)
- Modify: `apps/web/app/(profesor)/profesor/plantillas/[id]/template-editor.tsx` (2 botones: Desactivar-Reactivar/Eliminar)
- Modify: `apps/web/app/(catalogo)/catalogo/page.tsx` (2 chips de filtro + botón "Cargar más")
- Modify: `apps/web/components/routine-exercises-editor.tsx` (drag handle, botón quitar, 4 inputs numéricos)

**Interfaces:** ninguna cambia — solo `className`.

- [ ] **Step 1: `users-list.tsx` — botones Desactivar y Eliminar**

Reemplazar:

```tsx
        className={`min-h-11 rounded-lg border border-danger/30 px-4 text-sm font-medium text-danger active:bg-danger/10 disabled:border-border disabled:text-text-muted ${className}`}
```

por:

```tsx
        className={`min-h-11 rounded-lg border border-danger/30 px-4 text-sm font-medium text-danger active:bg-danger/10 disabled:border-border disabled:text-text-muted lg:min-h-9 ${className}`}
```

Reemplazar:

```tsx
        className={`min-h-11 rounded-lg border border-danger/30 px-4 text-sm font-medium text-danger disabled:opacity-40 ${className}`}
```

por:

```tsx
        className={`min-h-11 rounded-lg border border-danger/30 px-4 text-sm font-medium text-danger disabled:opacity-40 lg:min-h-9 ${className}`}
```

- [ ] **Step 2: `template-editor.tsx` — botones Desactivar/Reactivar y Eliminar definitivamente**

Reemplazar:

```tsx
className = 'min-h-11 rounded-lg border border-border px-4 text-sm font-medium text-text';
```

por:

```tsx
className =
  'min-h-11 rounded-lg border border-border px-4 text-sm font-medium text-text lg:min-h-9';
```

Reemplazar:

```tsx
className =
  'min-h-11 rounded-lg border border-danger/30 px-4 text-sm font-medium text-danger disabled:opacity-40';
```

por:

```tsx
className =
  'min-h-11 rounded-lg border border-danger/30 px-4 text-sm font-medium text-danger disabled:opacity-40 lg:min-h-9';
```

- [ ] **Step 3: `catalogo/page.tsx` — los 2 chips de filtro y el botón "Cargar más"**

Reemplazar CADA UNA de las 2 ocurrencias (chip "Todos" y chip por parte del cuerpo, son template strings con backticks — el texto a matchear es idéntico en ambas):

```tsx
          className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium ${
```

por:

```tsx
          className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium lg:min-h-9 lg:px-3 ${
```

Reemplazar:

```tsx
className =
  'min-h-11 self-center rounded-lg border border-border px-6 text-sm font-medium text-text disabled:opacity-50';
```

por:

```tsx
className =
  'min-h-11 self-center rounded-lg border border-border px-6 text-sm font-medium text-text disabled:opacity-50 lg:min-h-9';
```

- [ ] **Step 4: `routine-exercises-editor.tsx` — drag handle, botón quitar, 4 inputs numéricos**

Reemplazar:

```tsx
className = 'flex min-h-11 min-w-11 items-center justify-center text-text-muted';
```

por:

```tsx
className =
  'flex min-h-11 min-w-11 items-center justify-center text-text-muted lg:min-h-9 lg:min-w-9';
```

Reemplazar CADA UNA de las 4 ocurrencias idénticas:

```tsx
className = 'min-h-11 w-16 rounded-lg border border-border bg-surface px-2 text-text';
```

por:

```tsx
className = 'min-h-11 w-16 rounded-lg border border-border bg-surface px-2 text-text lg:min-h-9';
```

Reemplazar:

```tsx
className = 'min-h-11 min-w-11 text-danger';
```

por:

```tsx
className = 'min-h-11 min-w-11 text-danger lg:min-h-9 lg:min-w-9';
```

- [ ] **Step 5: Verificar**

Run: `cd apps/web && npx jest && npx next build`
Expected: PASS / build sin errores. Verificación manual en viewport ≥1024px: chips de filtro, botones de desactivar/eliminar, drag handle e inputs numéricos del editor de rutina, todos más compactos; mobile sin cambios.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(admin)/admin/users-list.tsx" "apps/web/app/(profesor)/profesor/plantillas/[id]/template-editor.tsx" "apps/web/app/(catalogo)/catalogo/page.tsx" apps/web/components/routine-exercises-editor.tsx
git commit -m "fix(web): densidad de desktop en botones secundarios, chips e inputs numericos"
```
