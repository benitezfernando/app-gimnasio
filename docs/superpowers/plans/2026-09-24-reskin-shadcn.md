# Reskin de apps/web con shadcn/ui — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cambiar la piel de `apps/web` a shadcn/ui (tema oscuro único, gradiente violeta→magenta→azul, mobile-first) sin tocar rutas, Server Actions, fetches ni lógica de negocio.

**Architecture:** Tarea 1 migra Tailwind v3 → v4 a mano y monta la fundación shadcn (tokens OKLCH en `globals.css`, `components.json`, `cn`, codemod de clases legacy). Tarea 2 instala los primitivos shadcn, los ajusta a mobile y restylea los componentes propios de navegación. Tareas 3–6 migran pantallas por rol, en orden de uso real. Tarea 7 limpia primitivos legacy y actualiza el HLD.

**Tech Stack:** Next.js 15.5 (App Router), React 19.3, Tailwind CSS 4.3.3 (`@tailwindcss/postcss`), shadcn CLI 4.21.0 (base Radix, estilo `radix-maia`), `radix-ui` 1.6.x, `cn` 0.4.x, `tw-animate-css` 1.4.x, `lucide-react` (ya instalado), pnpm workspaces.

Spec: `docs/superpowers/specs/2026-09-24-reskin-shadcn-design.md`

## Global Constraints

- Cambio de piel únicamente: no se modifica ninguna ruta, Server Action, llamada a `apiFetch`/`browserApiFetch`, estado de React ni condición de negocio. Los textos visibles se mantienen (la única excepción son las confirmaciones: el texto de `window.confirm` se reparte entre título y descripción del diálogo, sin cambiar su significado).
- Tema oscuro único: `<html className="dark">`, valores de tokens solo bajo `:root`. Nunca agregar toggle, `next-themes` ni un bloque de tokens claros.
- Gradiente de marca de tres paradas: `--brand-from` `oklch(0.582 0.210 292.9)`, `--brand-via` `oklch(0.591 0.257 322.9)`, `--brand-to` `oklch(0.623 0.188 259.8)`, 135°.
- Mobile-first: alto táctil `h-11` en mobile y `lg:h-9` en desktop para `Button` (tamaño `default`), `Input`, `NativeSelect`; inputs `text-base` en mobile y `lg:text-sm`. Los callers no pisan alturas.
- Sintaxis vigente de shadcn/ui (docs consultadas 2026-09-24): estilo `radix-maia`, tokens OKLCH, `@theme inline`, `tw-animate-css`, `cn` desde el paquete `cn`. Prohibido: `tailwindcss-animate`, `clsx`/`tailwind-merge` directos, `shadcn@2.x`, estilo `new-york`/`default`, tokens HSL.
- Comandos de shadcn siempre con versión fija y desde `apps/web`: `pnpm dlx shadcn@4.21.0 add <componentes> --yes`.
- Imports nuevos con alias `@/` (`@/components/ui/button`, `@/lib/utils`). Los imports relativos existentes que no se tocan se dejan como están.
- El gradiente de marca (`bg-gradient-brand`, variante `brand` de `Button`) solo en: botón principal de cada pantalla, ítem activo de `BottomNav`, chip de filtro activo del catálogo, `GradientIcon`, título del login. Nunca en acciones destructivas.
- Colores de región muscular (`--color-region-*`, triples RGB) no cambian de valor ni de nombre.
- Commits: Conventional Commits en minúscula (commitlint `subject-case`), trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Se commitea solo con autorización explícita de Fernando para esta ejecución.
- Trabajo en la rama `feature/reskin-shadcn`, nunca directo en `master`.

### Recetas de reemplazo (aplican a las Tareas 3–7)

Cada tarea de pantalla indica qué recetas aplicar en qué archivo. Imports que usan las recetas:

```tsx
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/confirm-dialog';
```

**R1 — Botón principal.** `PrimaryButton` → `Button variant="brand"`. Tamaños: `base` → sin `size`; `sm` → `size="sm"`; `sm-wide` → `size="sm"` + `className="px-6"`. Se borra `active:opacity-90` del `className` (ya está en la variante). Si el label cambia por un estado pendiente (`pending`, `guardando`, `asignando`), se antepone `{pending && <Spinner data-icon="inline-start" />}` usando la misma variable.

```tsx
// antes
<PrimaryButton type="submit" disabled={pending} className="w-full active:opacity-90 sm:w-auto">
  {pending ? 'Creando...' : 'Crear alumno'}
</PrimaryButton>
// después
<Button type="submit" variant="brand" disabled={pending} className="w-full sm:w-auto">
  {pending && <Spinner data-icon="inline-start" />}
  {pending ? 'Creando...' : 'Crear alumno'}
</Button>
```

**R2 — Botones secundarios.** Un `<button>` con clases `border border-border ... text-foreground` → `<Button variant="outline" size="sm">`. Uno con `border-destructive/30 ... text-destructive` → `<Button variant="outline" size="sm" className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive">`. Uno con `bg-destructive` sólido → `<Button variant="destructive">`. Se conservan `type`, `onClick`, `disabled`, `title`, `aria-*` y las clases de layout (`w-full`, `flex-1`, `self-center`, márgenes); se borran las de color, borde, alto, padding y tipografía.

**R3 — Botón de ícono redondo.** `<button ... className="flex h-11 w-11 items-center justify-center rounded-full ...">` → `<Button variant="ghost" size="icon" className="rounded-full" ...>` conservando `aria-label`, `onClick`, `type` y el ícono hijo.

**R4 — Campo de texto.** Se borra la constante `INPUT_CLASSES`. Cada `<input>` visible pasa a:

```tsx
<Field>
  <FieldLabel htmlFor="crear-alumno-nombre" className="sr-only">
    Nombre
  </FieldLabel>
  <Input id="crear-alumno-nombre" name="nombre" placeholder="Nombre" required />
</Field>
```

El `id` es `<formulario>-<name>` en kebab-case (único por página). El texto del `FieldLabel` es el placeholder sin puntos suspensivos. Se conservan todos los atributos del input original (`name`, `type`, `required`, `minLength`, `value`, `onChange`, `autoCapitalize`, `autoCorrect`, `list`, `placeholder`, `defaultValue`) y se borran sus clases de estilo. Si el input ya estaba dentro de un `<label>` visible, se usa `FieldLabel` visible (sin `sr-only`) con ese texto. `<input type="hidden">` no se toca.

**R5 — Select.** `<select ...>` → `<NativeSelect ...>` y cada `<option>` → `<NativeSelectOption>`, conservando `value`, `onChange`, `name`, `required`, `disabled`, `key`; se borran las clases de estilo del select.

**R6 — Error de formulario o de acción.**

```tsx
// antes
{
  error && (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );
}
// después
{
  error && (
    <Alert variant="destructive">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );
}
```

Se conservan las clases de margen del `<p>` original en el `Alert` (`mb-2`, `mb-4`…).

**R7 — Pill/chip.** `<Pill>x</Pill>` → `<Badge variant="outline">x</Badge>`. Chip de estado (`rounded-full bg-card ... text-muted-foreground`, ej. "Inactivo") → `<Badge variant="secondary">`.

**R8 — Estado vacío.**

```tsx
<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon">
      <Users />
    </EmptyMedia>
    <EmptyTitle>Todavía no tenés alumnos</EmptyTitle>
    <EmptyDescription>Creá uno arriba o pedile al Admin que te asigne alguno.</EmptyDescription>
  </EmptyHeader>
</Empty>
```

El texto original se reparte: la primera oración (hasta el primer `—` o `.`) va a `EmptyTitle`, el resto a `EmptyDescription`. El ícono (`lucide-react`) lo indica cada tarea.

**R9 — Confirmación.** `window.confirm(texto)` → `await confirmar({...})` con `const confirmar = useConfirm();` al inicio del componente. La función que la contiene pasa a `async` si no lo era. Los valores exactos de cada confirmación están en su tarea.

---

## File Structure

| Archivo                                                                                                                                                      | Responsabilidad                                        | Tarea |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ----- |
| `apps/web/package.json`                                                                                                                                      | deps Tailwind v4 + shadcn                              | 1     |
| `apps/web/postcss.config.mjs` (nuevo, reemplaza `.js`)                                                                                                       | plugin `@tailwindcss/postcss`                          | 1     |
| `apps/web/tailwind.config.ts`                                                                                                                                | se borra (config pasa a CSS)                           | 1     |
| `apps/web/app/tokens.css`                                                                                                                                    | se borra (tokens pasan a `globals.css`)                | 1     |
| `apps/web/app/globals.css`                                                                                                                                   | Tailwind v4 + tokens shadcn + gradiente + región       | 1     |
| `apps/web/components.json` (nuevo)                                                                                                                           | config shadcn                                          | 1     |
| `apps/web/lib/utils.ts` (nuevo)                                                                                                                              | `cn`                                                   | 1     |
| `apps/web/app/layout.tsx`                                                                                                                                    | `className="dark"`, `themeColor`, `ConfirmProvider`    | 1, 2  |
| `apps/web/app/manifest.ts`                                                                                                                                   | colores del manifest PWA alineados al fondo            | 1     |
| `apps/web/components/ui/{button,card,badge,input,label,field,separator,native-select,input-group,alert,alert-dialog,checkbox,empty,spinner}.tsx` (generados) | primitivos shadcn                                      | 2     |
| `apps/web/components/confirm-dialog.tsx` (nuevo)                                                                                                             | `ConfirmProvider` + `useConfirm()` sobre `AlertDialog` | 2     |
| `apps/web/components/ui/{bottom-nav,page-header,back-link,home-link,gradient-icon}.tsx`, `components/logout-button.tsx`                                      | navegación propia restyleada                           | 2     |
| pantallas de alumno/catálogo/login                                                                                                                           | Tarea 3                                                | 3     |
| pantallas y componentes de profesor                                                                                                                          | Tarea 4                                                | 4     |
| pantallas de admin                                                                                                                                           | Tarea 5                                                | 5     |
| pantallas de super-admin                                                                                                                                     | Tarea 6                                                | 6     |
| `privacidad`, `error`, `global-error`, `primary-button.tsx`, `pill.tsx`, `docs/hld-mvp.md`                                                                   | limpieza y docs                                        | 7     |

---

### Task 1: Tailwind v4 + fundación shadcn

**Files:**

- Modify: `apps/web/package.json`
- Create: `apps/web/postcss.config.mjs`
- Delete: `apps/web/postcss.config.js`, `apps/web/tailwind.config.ts`, `apps/web/app/tokens.css`
- Modify: `apps/web/app/globals.css` (reescritura completa)
- Create: `apps/web/components.json`, `apps/web/lib/utils.ts`
- Modify: `apps/web/app/layout.tsx`, `apps/web/app/manifest.ts`, `apps/web/components/ui/gradient-icon.tsx`
- Modify (codemod): todos los `.tsx`/`.ts` bajo `apps/web/app` y `apps/web/components`

**Interfaces:**

- Produces: clases Tailwind `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-primary-foreground`, `text-primary-soft`, `text-destructive`, `text-success`, utilidades `bg-gradient-brand` y `text-gradient-brand`; `cn` exportado desde `@/lib/utils`; `components.json` con estilo `radix-maia`.

- [ ] **Step 1: Crear la rama**

```bash
cd /home/fernando/Escritorio/Dev/Fernando/app-gimnasio
git status --short   # debe estar limpio salvo .worktrees/
git checkout -b feature/reskin-shadcn
```

- [ ] **Step 2: Dependencias**

```bash
cd apps/web
pnpm remove tailwindcss autoprefixer
pnpm add -D tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3 tw-animate-css@^1.4.0
pnpm add shadcn@4.21.0 class-variance-authority cn@^0.4.0
```

Expected: `apps/web/package.json` con `tailwindcss` `4.3.3` y `@tailwindcss/postcss` `4.3.3` en devDependencies; `shadcn`, `class-variance-authority`, `cn` en dependencies; sin `autoprefixer`. `postcss` queda (lo usa Next).

- [ ] **Step 3: PostCSS**

Borrar `apps/web/postcss.config.js` y crear `apps/web/postcss.config.mjs`:

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

- [ ] **Step 4: Borrar config y tokens legacy**

```bash
git rm apps/web/tailwind.config.ts apps/web/app/tokens.css apps/web/postcss.config.js
```

- [ ] **Step 5: `globals.css` completo**

Reemplazar `apps/web/app/globals.css` entero por:

```css
@import 'tailwindcss';
@import 'tw-animate-css';
@import 'shadcn/tailwind.css';

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary-soft: var(--primary-soft);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-success: var(--success);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

/*
 * Tema oscuro único (decisión de producto): no hay bloque claro ni
 * `.dark` con otros valores. `<html class="dark">` existe solo para que
 * las variantes `dark:` de los componentes shadcn apliquen.
 */
:root {
  color-scheme: dark;
  --radius: 0.75rem;

  --background: oklch(0.163 0.015 284.7);
  --foreground: oklch(0.972 0.007 286.3);
  --card: oklch(0.214 0.022 284.4);
  --card-foreground: oklch(0.972 0.007 286.3);
  --popover: oklch(0.214 0.022 284.4);
  --popover-foreground: oklch(0.972 0.007 286.3);
  --primary: oklch(0.582 0.21 292.9);
  --primary-foreground: oklch(1 0 0);
  --primary-soft: oklch(0.827 0.108 306.4);
  --secondary: oklch(0.258 0.024 284.6);
  --secondary-foreground: oklch(0.972 0.007 286.3);
  --muted: oklch(0.258 0.024 284.6);
  --muted-foreground: oklch(0.645 0.022 285.8);
  --accent: oklch(0.258 0.024 284.6);
  --accent-foreground: oklch(0.972 0.007 286.3);
  --destructive: oklch(0.711 0.166 22.2);
  --destructive-foreground: oklch(1 0 0);
  --success: oklch(0.8 0.182 151.7);
  --border: oklch(0.304 0.027 284.7);
  --input: oklch(0.304 0.027 284.7);
  --ring: oklch(0.582 0.21 292.9);

  --brand-from: oklch(0.582 0.21 292.9);
  --brand-via: oklch(0.591 0.257 322.9);
  --brand-to: oklch(0.623 0.188 259.8);

  /* Triples RGB leídos por lib/region-colors.ts en estilos inline. */
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

@utility bg-gradient-brand {
  background-image: linear-gradient(135deg, var(--brand-from), var(--brand-via), var(--brand-to));
}

@utility text-gradient-brand {
  background-image: linear-gradient(135deg, var(--brand-from), var(--brand-via), var(--brand-to));
  background-clip: text;
  color: transparent;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  button:not(:disabled),
  [role='button']:not(:disabled) {
    cursor: pointer;
  }
}
```

- [ ] **Step 6: `components.json` y `lib/utils.ts`**

`apps/web/components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "radix-maia",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

`apps/web/lib/utils.ts`:

```ts
export { cn } from 'cn';
```

Verificar que el CLI lee la config:

```bash
cd apps/web && pnpm dlx shadcn@4.21.0 info
```

Expected: reporta framework Next.js, Tailwind v4, estilo `radix-maia`, `iconLibrary` lucide, sin errores de config.

- [ ] **Step 7: Layout y manifest**

`apps/web/app/layout.tsx`: el `viewport.themeColor` pasa a `'#0D0D14'` (igual al nuevo `--background`, así la barra de estado de Android se funde con el fondo) y el `return` queda:

```tsx
return (
  <html lang="es" className="dark">
    <body>{children}</body>
  </html>
);
```

(`bg-background text-foreground` ya lo aplica `@layer base` sobre `body`.)

`apps/web/app/manifest.ts`: `background_color` y `theme_color` pasan a `'#0D0D14'`.

- [ ] **Step 8: `GradientIcon` a los tokens nuevos**

En `apps/web/components/ui/gradient-icon.tsx`, reemplazar el `style.background` inline por la utilidad:

```tsx
import type { LucideIcon } from 'lucide-react';

export function GradientIcon({ icon: Icon, size = 24 }: { icon: LucideIcon; size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full bg-gradient-brand"
      style={{ width: size * 1.8, height: size * 1.8 }}
    >
      <Icon size={size} className="text-primary-foreground" aria-hidden />
    </div>
  );
}
```

- [ ] **Step 9: Codemod de clases legacy y renombres de Tailwind v4**

Desde `apps/web`, en este orden exacto (cada regla asume la anterior):

```bash
cd apps/web
FILES=$(grep -rlE "surface|text-text|accent|danger|outline-none|shadow-sm|!p-" app components --include=*.tsx --include=*.ts)
perl -pi -e '
  s/(?<![\w-])bg-gradient-accent\b/bg-gradient-brand/g;
  s/(?<!color)-surface-alt\b/-card/g;
  s/(?<!color)-surface\b/-background/g;
  s/(?<!color)-text-muted\b/-muted-foreground/g;
  s/\btext-text\b/text-foreground/g;
  s/(?<!color)-accent-fg\b/-primary-foreground/g;
  s/(?<!color)-accent-text\b/-primary-soft/g;
  s/(?<!color)(?<!gradient)-accent\b/-primary/g;
  s/(?<!color)-danger\b/-destructive/g;
  s/\boutline-none\b/outline-hidden/g;
  s/\bshadow-sm\b/shadow-xs/g;
  s/(^|[\s"`:])!(p-2\.5|p-3)\b/$1$2!/g;
' $FILES
```

Luego verificar que no quedó nada legacy:

```bash
grep -rnE "(bg|text|border|ring|placeholder:text|from|to)-(surface|text-muted|accent|danger)\b|\btext-text\b|gradient-accent|--color-(surface|text|accent|danger|success|border)|outline-none|\bshadow-sm\b|\s!p-" app components
```

Expected: sin salida. Revisar a ojo `components/routine-exercises-editor.tsx` línea ~44: debe quedar `className="p-2.5! flex items-center gap-1 sm:p-3! sm:gap-2"`.

- [ ] **Step 10: Verificación**

```bash
cd /home/fernando/Escritorio/Dev/Fernando/app-gimnasio
pnpm --filter web build
pnpm lint
pnpm --filter web test
```

Expected: build OK, lint sin errores nuevos, tests de `web` en verde.

Visual: `pnpm --filter web dev`, abrir `http://localhost:3000/login` y `/catalogo` con el viewport del navegador en 375px. Expected: mismo layout que antes, fondo casi negro, textos legibles, gradiente del botón de login ahora con tres paradas (violeta → magenta → azul).

- [ ] **Step 11: Commit**

```bash
git add -A apps/web
git status --short   # revisar que no entra nada fuera de apps/web
git commit -m "$(cat <<'EOF'
feat(web): migrar a tailwind v4 y fundacion de tokens shadcn

Tailwind 3.4 -> 4.3 (postcss plugin, config en CSS), tokens semanticos
de shadcn en OKLCH con tema oscuro unico, gradiente de marca de tres
paradas y codemod de clases legacy. Sin cambios de layout ni logica.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Primitivos shadcn, `ConfirmProvider` y navegación propia

**Files:**

- Create (CLI): `apps/web/components/ui/{button,card,badge,input,label,field,separator,native-select,input-group,alert,alert-dialog,checkbox,empty,spinner}.tsx`
- Create: `apps/web/components/confirm-dialog.tsx`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/components/ui/button.tsx`, `input.tsx`, `native-select.tsx` (ajuste mobile tras generarlos)
- Modify: `apps/web/components/ui/bottom-nav.tsx`, `page-header.tsx`, `back-link.tsx`, `home-link.tsx`, `apps/web/components/logout-button.tsx`
- Modify: callers de `Card` propio: `apps/web/app/(alumno)/alumno/page.tsx`, `apps/web/components/exercise-card.tsx`, `apps/web/components/routine-exercises-editor.tsx`

**Interfaces:**

- Consumes: `cn` de `@/lib/utils`, tokens de la Tarea 1.
- Produces: `Button` con `variant` ∈ {`default`,`brand`,`outline`,`secondary`,`ghost`,`destructive`,`link`} y `size` ∈ {`default`,`sm`,`lg`,`icon`, + los que genere el CLI}; `buttonVariants`; `ConfirmProvider`; `useConfirm(): (opciones: ConfirmOptions) => Promise<boolean>` con `ConfirmOptions = { titulo: string; descripcion: string; confirmarLabel?: string; destructiva?: boolean }`.

- [ ] **Step 1: Instalar componentes**

```bash
cd /home/fernando/Escritorio/Dev/Fernando/app-gimnasio/apps/web
pnpm dlx shadcn@4.21.0 add button card badge input label field separator native-select input-group alert alert-dialog checkbox empty spinner --yes --overwrite
```

`--overwrite` es necesario porque existe `components/ui/card.tsx` propio: se reemplaza a propósito (sus 3 callers se ajustan en el Step 6).

Expected: archivos creados en `components/ui/`, dependencia `radix-ui` agregada a `apps/web/package.json`.

- [ ] **Step 2: Revisar que el CLI no pisó tokens**

```bash
git diff --stat app/globals.css
```

Expected: sin cambios. Si el CLI agregó variables o modificó valores, revertir con `git checkout app/globals.css` (los tokens de la Tarea 1 son la fuente de verdad).

- [ ] **Step 3: Ajustes mobile-first en los primitivos generados**

`components/ui/button.tsx`, dentro de `buttonVariants`:

- En `variants.variant` agregar la entrada:

```ts
        brand:
          'bg-gradient-brand text-primary-foreground shadow-xs hover:opacity-90 active:opacity-90',
```

- En `variants.size`, en cada string reemplazar solo la clase de altura (`h-*` o `size-*`) y dejar el resto de las clases generadas intactas: `default` → `h-11 lg:h-9`; `sm` → `h-10 lg:h-8`; `lg` → `h-12 lg:h-10`; `icon` → `size-11 lg:size-9`. Otros tamaños generados (`xs`, `icon-sm`, `icon-lg`, etc.) no se tocan.

`components/ui/input.tsx` y el `<select>` de `components/ui/native-select.tsx`: reemplazar la clase de altura por `h-11 lg:h-9` y la de tipografía responsiva (`md:text-sm` o equivalente) por `lg:text-sm`, manteniendo `text-base`.

Verificar:

```bash
grep -n "brand:" components/ui/button.tsx
grep -n "h-11 lg:h-9" components/ui/button.tsx components/ui/input.tsx components/ui/native-select.tsx
```

Expected: una línea `brand:` y al menos una coincidencia de `h-11 lg:h-9` por archivo.

- [ ] **Step 4: `ConfirmProvider` / `useConfirm`**

Crear `apps/web/components/confirm-dialog.tsx`:

```tsx
'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';

export interface ConfirmOptions {
  titulo: string;
  descripcion: string;
  confirmarLabel?: string;
  destructiva?: boolean;
}

type Confirmar = (opciones: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirmar | null>(null);

// Reemplaza window.confirm: en la app Android (TWA) el diálogo nativo de
// Chrome muestra el dominio del sitio y rompe la sensación de app.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opciones, setOpciones] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((valor: boolean) => void) | null>(null);

  const confirmar = useCallback<Confirmar>(
    (nuevas) =>
      new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
        setOpciones(nuevas);
      }),
    [],
  );

  function cerrar(valor: boolean) {
    resolverRef.current?.(valor);
    resolverRef.current = null;
    setOpciones(null);
  }

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      <AlertDialog
        open={opciones !== null}
        onOpenChange={(abierto) => {
          if (!abierto) cerrar(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opciones?.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{opciones?.descripcion}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => cerrar(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cerrar(true)}
              className={
                opciones?.destructiva ? buttonVariants({ variant: 'destructive' }) : undefined
              }
            >
              {opciones?.confirmarLabel ?? 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirmar {
  const confirmar = useContext(ConfirmContext);
  if (!confirmar) {
    throw new Error('useConfirm requiere <ConfirmProvider> en el layout raíz');
  }
  return confirmar;
}
```

En `apps/web/app/layout.tsx`, importar y envolver:

```tsx
import { ConfirmProvider } from '@/components/confirm-dialog';
// ...
<html lang="es" className="dark">
  <body>
    <ConfirmProvider>{children}</ConfirmProvider>
  </body>
</html>;
```

- [ ] **Step 5: Navegación propia**

`components/ui/page-header.tsx`: el `<button>` de volver aplica R3 (`<Button variant="ghost" size="icon" className="rounded-full" type="button" onClick={onBack} aria-label="Volver">`), import `Button` de `@/components/ui/button`.

`components/ui/back-link.tsx` y `components/ui/home-link.tsx`: el `<Link>` pasa a `Button` con `asChild`:

```tsx
<Button asChild variant="ghost" size="icon" className="rounded-full">
  <Link href={href} aria-label="Volver">
    <ArrowLeft size={22} aria-hidden />
  </Link>
</Button>
```

(`home-link.tsx` igual con `aria-label="Ir al inicio"` y `<Home size={20} aria-hidden />`.)

`components/logout-button.tsx`: el `<button type="submit">` aplica R3 conservando `type="submit"` y `aria-label="Cerrar sesión"`.

`components/ui/bottom-nav.tsx`: sin cambio de estructura. El `<nav>` cambia `bg-card` por `bg-card/90 backdrop-blur` (el resto de sus clases se conserva); el span del ícono activo usa `bg-gradient-brand` (ya renombrado por el codemod); el label activo usa `text-primary-soft` (ya renombrado). Verificar con:

```bash
grep -n "bg-gradient-brand\|text-primary-soft\|backdrop-blur" components/ui/bottom-nav.tsx
```

Expected: tres coincidencias como mínimo.

- [ ] **Step 6: Callers del `Card` reemplazado**

El `Card` de shadcn no trae el padding del propio; se hace explícito en cada caller:

- `app/(alumno)/alumno/page.tsx`: `<Card className="flex items-center gap-3">` → `<Card className="flex flex-row items-center gap-3 p-4 lg:p-3">` y el import pasa a `import { Card } from '@/components/ui/card';`.
- `components/exercise-card.tsx`: `<Card className="flex flex-col gap-3">` → `<Card className="flex flex-col gap-3 p-4 lg:p-3">`, mismo cambio de import.
- `components/routine-exercises-editor.tsx`: `<Card className="p-2.5! flex items-center gap-1 sm:p-3! sm:gap-2">` → `<Card className="flex flex-row items-center gap-1 p-2.5! sm:gap-2 sm:p-3!">`, mismo cambio de import.

- [ ] **Step 7: Verificación**

```bash
cd /home/fernando/Escritorio/Dev/Fernando/app-gimnasio
pnpm --filter web build && pnpm lint && pnpm --filter web test
```

Expected: todo verde. Visual a 375px: `/alumno` (lista de ejercicios con cards a igual padding que antes), `/catalogo` (grilla de cards), header con botones de ícono redondos, bottom nav con blur y gradiente en el ítem activo.

- [ ] **Step 8: Commit**

```bash
git add -A apps/web
git commit -m "$(cat <<'EOF'
feat(web): primitivos shadcn, confirm dialog y navegacion restyleada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Recorrido del alumno (login, rutina, catálogo)

**Files:**

- Modify: `apps/web/app/login/page.tsx`
- Modify: `apps/web/app/(alumno)/alumno/page.tsx`
- Modify: `apps/web/app/(catalogo)/catalogo/page.tsx`
- Modify: `apps/web/app/(catalogo)/catalogo/[id]/page.tsx`
- Modify: `apps/web/components/exercise-card.tsx`

**Interfaces:**

- Consumes: primitivos y recetas R1, R4, R5, R6, R7, R8 (Global Constraints).

- [ ] **Step 1: Login**

En `app/login/page.tsx` se conserva todo lo que no es JSX de presentación (`ESTADO_INICIAL`, `GYM_ID`, `AvisoSesionExpirada` con su `Suspense`, `useActionState`, imports de logo y acción). Cambios:

- `BotonIngresar`: R1 (`<Button type="submit" variant="brand" disabled={pending} className="w-full">` con `Spinner` cuando `pending`).
- `AvisoSesionExpirada`: el `<p role="alert">` pasa a `<Alert className="mb-4"><AlertDescription>Tu sesión expiró. Ingresá de nuevo.</AlertDescription></Alert>` (variante default, no es un error del usuario).
- El `<h1>` pasa a `className="mb-6 text-2xl font-semibold text-gradient-brand lg:text-xl"`.
- El contenedor de escritorio `lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:p-8` se conserva.
- Inputs `username` y `password`: R4 con ids `login-username` y `login-password`, labels `Usuario` y `Contraseña`. Se conservan `autoCapitalize="none"` y `autoCorrect="off"` en `username`.
- Error del formulario: R6.

- [ ] **Step 2: Rutina del alumno**

En `app/(alumno)/alumno/page.tsx`:

- Estado sin rutina: se reemplazan los dos `<p>` por R8 con ícono `Dumbbell`, `EmptyTitle` "Todavía no tenés una rutina asignada", `EmptyDescription` "Tu profesor te va a asignar una pronto — volvé a revisar más tarde.". El `<main>` conserva sus clases.
- Pills de series/reps/peso: R7 (`Badge variant="outline"`). Borrar el import de `Pill`.
- El `<Link>` de cada ejercicio agrega `className="block rounded-2xl focus-visible:ring-2 focus-visible:ring-ring"` para foco visible con teclado.

- [ ] **Step 3: Catálogo (lista)**

En `app/(catalogo)/catalogo/page.tsx` (toda la lógica de `cargar`/`useEffect` queda igual):

- Buscador: el `<div>` con `Search` + `<input>` pasa a:

```tsx
<InputGroup>
  <InputGroupAddon align="inline-start">
    <Search aria-hidden />
  </InputGroupAddon>
  <InputGroupInput
    value={busqueda}
    onChange={(e) => setBusqueda(e.target.value)}
    placeholder="Buscar ejercicio..."
    aria-label="Buscar ejercicio"
  />
</InputGroup>
```

con `import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';`.

- Chips de parte del cuerpo ("Todos" y cada `parte`): cada `<button>` pasa a

```tsx
<Button
  type="button"
  size="sm"
  variant={parteCuerpo === null ? 'brand' : 'outline'}
  onClick={() => setParteCuerpo(null)}
  className="shrink-0 rounded-full"
>
  Todos
</Button>
```

(para cada parte: `variant={parteCuerpo === parte ? 'brand' : 'outline'}`, `onClick={() => setParteCuerpo(parte)}`, `key={parte}`).

- Select de equipamiento: R5.
- Error: R6.
- "No se encontraron ejercicios…": R8 con ícono `SearchX`, `EmptyTitle` "No se encontraron ejercicios", `EmptyDescription` "Probá con otros filtros.".
- "Cargar más": `<Button type="button" variant="outline" onClick={() => cargar(pagina + 1, false)} disabled={cargando} className="self-center">` con `{cargando && <Spinner data-icon="inline-start" />}` antes del texto existente.

- [ ] **Step 4: Detalle de ejercicio y `ExerciseCard`**

- `app/(catalogo)/catalogo/[id]/page.tsx`: todas las `Pill` → R7; error → R6.
- `components/exercise-card.tsx`: la `Pill` de equipamiento → R7; el chip de región (`<span className="inline-flex ... text-white" style={{ backgroundColor: ... }}>`) pasa a `<Badge className="border-transparent text-white" style={{ backgroundColor: regionColorVar(ejercicio.parteCuerpo) }}>` con el mismo texto.

- [ ] **Step 5: Verificación**

```bash
cd /home/fernando/Escritorio/Dev/Fernando/app-gimnasio
pnpm --filter web build && pnpm lint && pnpm --filter web test
grep -nP "PrimaryButton|<Pill|<select|<input(?! type=\"hidden\")|role=\"alert\"" apps/web/app/login/page.tsx "apps/web/app/(alumno)/alumno/page.tsx" "apps/web/app/(catalogo)/catalogo/page.tsx" "apps/web/app/(catalogo)/catalogo/[id]/page.tsx" apps/web/components/exercise-card.tsx
```

Expected: build/lint/test verdes; el grep sin salida. Visual a 375px: login (título con gradiente, inputs de 44px, error como alerta), `/alumno` con y sin rutina, `/catalogo` (buscador con ícono, chips scrolleables, chip activo con gradiente, select nativo abre el picker del sistema), `/catalogo/[id]`.

- [ ] **Step 6: Commit**

```bash
git add -A apps/web
git commit -m "$(cat <<'EOF'
feat(web): reskin shadcn del login, rutina del alumno y catalogo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Pantallas del profesor

**Files:**

- Modify: `apps/web/app/(profesor)/profesor/page.tsx`
- Modify: `apps/web/app/(profesor)/profesor/alumno-row.tsx`
- Modify: `apps/web/app/(profesor)/profesor/create-alumno-form.tsx`
- Modify: `apps/web/app/(profesor)/profesor/alumnos/[id]/page.tsx`
- Modify: `apps/web/app/(profesor)/profesor/alumnos/[id]/assign-template-form.tsx`
- Modify: `apps/web/app/(profesor)/profesor/alumnos/[id]/instance-editor.tsx`
- Modify: `apps/web/app/(profesor)/profesor/plantillas/page.tsx`
- Modify: `apps/web/app/(profesor)/profesor/plantillas/create-template-form.tsx`
- Modify: `apps/web/app/(profesor)/profesor/plantillas/[id]/template-editor.tsx`
- Modify: `apps/web/components/edit-user-form.tsx`
- Modify: `apps/web/components/exercise-picker.tsx`
- Modify: `apps/web/components/routine-exercises-editor.tsx`

**Interfaces:**

- Consumes: primitivos, `useConfirm` y recetas R1–R9.

- [ ] **Step 1: Cartera**

- `profesor/page.tsx`: el texto "Todavía no tenés alumnos — creá uno arriba o pedile al Admin que te asigne alguno." → R8 con ícono `Users` (ver ejemplo de R8, es exactamente este caso).
- `alumno-row.tsx`: el contenedor `div` de la fila conserva sus clases (ya migradas por el codemod); chip "Inactivo" → R7 `Badge variant="secondary"`; botón "Editar" → R2 `outline` `size="sm"`.
- `create-alumno-form.tsx`: R1 (label pendiente según el texto actual del botón), R4 para los dos inputs (ids `crear-alumno-nombre`, `crear-alumno-apellido`), R6.
- `components/edit-user-form.tsx`: R1, R4 (ids `editar-usuario-nombre`, `editar-usuario-password`), el botón "Cancelar" → R2 `ghost` `size="sm"`, R6. Borrar `INPUT_CLASSES`.

- [ ] **Step 2: Detalle de alumno**

- `alumnos/[id]/page.tsx`: `Pill` "Vinculada a «…»" → R7.
- `alumnos/[id]/assign-template-form.tsx`:
  - select de plantilla → R5; input de nombre → R4 (id `asignar-plantilla-nombre`, label `Nombre de la rutina`).
  - checkbox "vincular": el `<label>` con `<input type="checkbox">` pasa a

```tsx
<div className="flex items-center gap-2">
  <Checkbox
    id="asignar-plantilla-vincular"
    checked={vincular}
    onCheckedChange={(valor) => setVincular(valor === true)}
  />
  <Label htmlFor="asignar-plantilla-vincular" className="text-sm text-muted-foreground">
    {/* mismo texto que tenía el <label> original */}
  </Label>
</div>
```

    con imports `Checkbox` de `@/components/ui/checkbox` y `Label` de `@/components/ui/label`.

- botón asignar → R1 con `size="sm"` y `Spinner` según `asignando`; error → R6.
- confirmación (R9), dentro de `asignar()`:

```ts
if (
  reemplazaRutinaVigente &&
  !(await confirmar({
    titulo: '¿Reemplazar la rutina actual?',
    descripcion: 'Esto reemplaza la rutina actual del alumno por la plantilla elegida.',
    confirmarLabel: 'Reemplazar',
  }))
) {
  return;
}
```

- `alumnos/[id]/instance-editor.tsx`: el input de nombre de la instancia → R4 (id `editar-instancia-nombre`, label `Nombre de la rutina`).

- [ ] **Step 3: Plantillas**

- `plantillas/page.tsx`: "Todavía no armaste ninguna plantilla." → R8 con ícono `ClipboardList`, `EmptyTitle` "Todavía no armaste ninguna plantilla", `EmptyDescription` "Creá la primera con el formulario de arriba.".
- `plantillas/create-template-form.tsx`: R1 y R4 para los dos inputs (ids `crear-plantilla-nombre`, `crear-plantilla-descripcion`).
- `plantillas/[id]/template-editor.tsx`: "Desactivar/Reactivar" → R2 `outline` `size="sm"`; "Eliminar definitivamente" → R2 variante destructiva-outline `size="sm"`; error → R6; confirmación (R9) en `eliminar()`:

```ts
if (
  !(await confirmar({
    titulo: `¿Eliminar definitivamente "${plantilla.nombre}"?`,
    descripcion: 'No se puede deshacer.',
    confirmarLabel: 'Eliminar',
    destructiva: true,
  }))
) {
  return;
}
```

- [ ] **Step 4: Editor de ejercicios y buscador**

- `components/exercise-picker.tsx`: buscador → mismo bloque `InputGroup` de la Tarea 3 Step 3 con `placeholder="Buscar ejercicio para agregar..."` y `aria-label="Buscar ejercicio para agregar"`; error → R6; la `<ul>` de resultados cambia `bg-background` por `bg-popover`; cada `<button>` de resultado pasa a `<Button type="button" variant="ghost" className="h-auto min-h-11 w-full justify-start gap-3 px-2" onClick={...}>` conservando sus dos `<span>`; "Sin resultados." queda como `<p className="text-sm text-muted-foreground">`.
- `components/routine-exercises-editor.tsx`, en `FilaEjercicio` (no tocar anchos `w-10 sm:w-16`, `px-1`, `text-center sm:text-left`: son el ajuste mobile de filas compactas):
  - botón de arrastre → `<Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground" {...attributes} {...listeners} aria-label={...}>`.
  - cada `<label className="flex flex-col text-xs text-muted-foreground">` + `<input>` → `<div className="flex flex-col gap-1">` con `<Label htmlFor={...} className="text-xs text-muted-foreground">` (mismo texto/spans de mobile y desktop que hoy) y `<Input id={...} type="number" ... className="w-10 px-1 text-center sm:w-16 sm:px-2 sm:text-left" />`. Ids: `` `${ejercicio.exerciseId}-series` ``, `` `${ejercicio.exerciseId}-reps` ``, `` `${ejercicio.exerciseId}-peso` ``.
  - botón quitar → `<Button type="button" variant="ghost" size="icon" className="shrink-0 text-destructive hover:text-destructive" onClick={onQuitar} aria-label={...}>`.
  - En el componente principal: estado vacío → R8 con ícono `ListPlus`, `EmptyTitle` "Todavía no agregaste ningún ejercicio", `EmptyDescription` "Buscá uno arriba para empezar."; error → R6; "Guardar ejercicios" → R1 `size="sm"` con `className="self-start px-6"` y `Spinner` según `guardando`.

- [ ] **Step 5: Verificación**

```bash
cd /home/fernando/Escritorio/Dev/Fernando/app-gimnasio
pnpm --filter web build && pnpm lint && pnpm --filter web test
grep -rnE "PrimaryButton|<Pill|INPUT_CLASSES|<select|window\.confirm|role=\"alert\"" "apps/web/app/(profesor)" apps/web/components/edit-user-form.tsx apps/web/components/exercise-picker.tsx apps/web/components/routine-exercises-editor.tsx
```

Expected: verdes y grep sin salida. Visual a 375px: cartera (vacía y con alumnos, editar inline), detalle de alumno (asignar plantilla con confirmación en diálogo propio, no el de Chrome), editor de instancia y de plantilla (fila de ejercicio en una sola línea con nombre en 2 líneas como hoy, drag&drop funciona, eliminar plantilla desactivada pide confirmación en diálogo).

- [ ] **Step 6: Commit**

```bash
git add -A apps/web
git commit -m "$(cat <<'EOF'
feat(web): reskin shadcn de las pantallas del profesor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Pantallas del admin

**Files:**

- Modify: `apps/web/app/(admin)/admin/page.tsx`
- Modify: `apps/web/app/(admin)/admin/create-alumno-form.tsx`
- Modify: `apps/web/app/(admin)/admin/create-profesor-form.tsx`
- Modify: `apps/web/app/(admin)/admin/users-list.tsx`
- Modify: `apps/web/app/(admin)/admin/cartera-panel.tsx`
- Modify: `apps/web/app/(admin)/admin/delete-permanently-dialog.tsx`

**Interfaces:**

- Consumes: primitivos, `useConfirm`, recetas R1–R9.

- [ ] **Step 1: Formularios de alta**

- `create-alumno-form.tsx`: R1, R4 (ids `admin-alumno-nombre`, `admin-alumno-apellido`), R6; borrar `INPUT_CLASSES`.
- `create-profesor-form.tsx`: R1, R4 (ids `admin-profesor-username`, `admin-profesor-nombre`, `admin-profesor-password`; conservar `autoCapitalize="none"` y `autoCorrect="off"` en username), R6; borrar `INPUT_CLASSES`.
- `admin/page.tsx`: secciones que envuelven formularios o listas con `rounded-2xl bg-card p-4` conservan su layout; si alguna usa `shadow-xs` (codemod) se deja.

- [ ] **Step 2: Lista de usuarios**

En `users-list.tsx`:

- Filtro por rol: el `<label>` con `<select>` → `<div className="flex items-center gap-2">` con `<Label htmlFor="filtro-rol" className="text-sm">` (mismo texto) + R5 con `id="filtro-rol"`.
- `BotonDesactivar` → R2 destructiva-outline `size="sm"` conservando `className` recibido por prop, `disabled` y `title`.
- Los otros dos `<button>` del archivo → R2 según su estilo actual (outline o destructiva-outline) `size="sm"`.
- Error → R6 (conservar `mb-4`).
- Confirmación (R9) en `handleDeactivate`:

```ts
  async function handleDeactivate(userId: string, nombre: string) {
    const confirmado = await confirmar({
      titulo: `¿Desactivar a ${nombre}?`,
      descripcion: 'Va a perder acceso inmediatamente. Esto no se puede deshacer desde acá.',
      confirmarLabel: 'Desactivar',
      destructiva: true,
    });
    if (!confirmado) return;
    // resto sin cambios
```

- [ ] **Step 3: Cartera**

En `cartera-panel.tsx`: los `<button>` → R2 según su estilo (el de quitar profesor es destructiva-outline o `ghost` con `text-destructive` si hoy es solo texto rojo); select de profesor → R5; `PrimaryButton` → R1 `size="sm"`; error → R6 (conservar `mb-2`).

- [ ] **Step 4: Eliminación definitiva con `AlertDialog`**

En `delete-permanently-dialog.tsx` la lógica (`useEffect` de impacto, `confirmar`, estados) no cambia. El `return` completo pasa a:

```tsx
return (
  <AlertDialog
    open
    onOpenChange={(abierto) => {
      if (!abierto) onCerrado();
    }}
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Eliminar a {nombre} definitivamente</AlertDialogTitle>
        <AlertDialogDescription>
          {cargando ? 'Calculando impacto...' : 'Esta acción borra en cascada:'}
        </AlertDialogDescription>
      </AlertDialogHeader>

      {impacto && (
        <ul className="flex flex-col gap-1 text-sm">
          <li>Plantillas que se borran: {impacto.plantillasABorrar}</li>
          <li>Rutinas de alumnos que se borran: {impacto.instanciasABorrar}</li>
          <li>
            Rutinas que sobreviven (alumno con otro profesor): {impacto.instanciasQueSobreviven}
          </li>
          <li>Vínculos de cartera que se borran: {impacto.vinculosDeCarteraABorrar}</li>
        </ul>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {advertencia && (
        <Alert variant="destructive">
          <AlertDescription>{advertencia}</AlertDescription>
        </Alert>
      )}

      <AlertDialogFooter>
        <AlertDialogCancel>Cancelar</AlertDialogCancel>
        {/* Button común, no AlertDialogAction: la acción es async y el
              diálogo tiene que quedar abierto hasta que termine. */}
        <Button
          type="button"
          variant="destructive"
          onClick={confirmar}
          disabled={cargando || eliminando || !impacto}
        >
          {eliminando && <Spinner data-icon="inline-start" />}
          {eliminando ? 'Eliminando...' : 'Eliminar definitivamente'}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
```

Imports: `AlertDialog`, `AlertDialogCancel`, `AlertDialogContent`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogHeader`, `AlertDialogTitle` de `@/components/ui/alert-dialog`; `Alert`, `AlertDescription`; `Button`; `Spinner`. Si la función del archivo que ejecuta el borrado no se llama `confirmar`, usar su nombre real (es la misma que hoy va en el `onClick` del botón rojo).

- [ ] **Step 5: Verificación**

```bash
cd /home/fernando/Escritorio/Dev/Fernando/app-gimnasio
pnpm --filter web build && pnpm lint && pnpm --filter web test
grep -rnE "PrimaryButton|<Pill|INPUT_CLASSES|<select|window\.confirm|role=\"alert\"|fixed inset-0" "apps/web/app/(admin)"
```

Expected: verdes y grep sin salida. Visual a 375px: panel admin (altas, filtro por rol, desactivar con diálogo propio, eliminar definitivamente muestra impacto en `AlertDialog`, cartera asignar/quitar).

- [ ] **Step 6: Commit**

```bash
git add -A apps/web
git commit -m "$(cat <<'EOF'
feat(web): reskin shadcn del panel de admin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Pantallas del super-admin

**Files:**

- Modify: `apps/web/app/super-admin/login/page.tsx`
- Modify: `apps/web/app/(super-admin)/super-admin/create-admin-form.tsx`
- Modify: `apps/web/app/(super-admin)/super-admin/admins-list.tsx`

**Interfaces:**

- Consumes: primitivos, `useConfirm`, recetas R1–R9.

- [ ] **Step 1: Login super-admin**

Mismo tratamiento que el login de la Tarea 3 Step 1: R1 (`w-full`, `Spinner`), R4 (ids `super-admin-login-username`, `super-admin-login-password`; conservar `autoCapitalize="none"`/`autoCorrect="off"`), R6, título con `text-gradient-brand`.

- [ ] **Step 2: Alta de admin**

`create-admin-form.tsx`: R1, R4 para los cuatro inputs (ids `crear-admin-gym-id`, `crear-admin-username`, `crear-admin-nombre`, `crear-admin-password`); el input de gym conserva su atributo `list` apuntando al `<datalist>` existente, que no se toca; conservar `autoCapitalize`/`autoCorrect` en username; R6; borrar `INPUT_CLASSES`.

- [ ] **Step 3: Lista de admins**

`admins-list.tsx`:

- "Editar" → R2 `outline` `size="sm"`; "Desactivar" y "Eliminar" → R2 destructiva-outline `size="sm"` (conservar `disabled` y `title`).
- Error/advertencia → R6 (conservar `mb-3`).
- "Todavía no hay admins." → R8 con ícono `ShieldUser`, `EmptyTitle` "Todavía no hay admins", `EmptyDescription` "Creá el primero con el formulario de arriba.".
- Confirmaciones (R9):

```ts
async function handleDesactivar(admin: AdminRow) {
  if (
    !(await confirmar({
      titulo: `¿Desactivar a ${admin.nombre}?`,
      descripcion: 'Pierde acceso inmediatamente.',
      confirmarLabel: 'Desactivar',
      destructiva: true,
    }))
  )
    return;
  // resto sin cambios
}

async function handleEliminar(admin: AdminRow) {
  if (
    !(await confirmar({
      titulo: `¿Eliminar a ${admin.nombre} definitivamente?`,
      descripcion: 'No se puede deshacer.',
      confirmarLabel: 'Eliminar',
      destructiva: true,
    }))
  ) {
    return;
  }
  // resto sin cambios
}
```

- [ ] **Step 4: Verificación**

```bash
cd /home/fernando/Escritorio/Dev/Fernando/app-gimnasio
pnpm --filter web build && pnpm lint && pnpm --filter web test
grep -rnE "PrimaryButton|INPUT_CLASSES|window\.confirm|role=\"alert\"" "apps/web/app/(super-admin)" apps/web/app/super-admin
```

Expected: verdes y grep sin salida. Visual a 375px en `/super-admin/login` y `/super-admin`.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web
git commit -m "$(cat <<'EOF'
feat(web): reskin shadcn de las pantallas de super-admin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Resto, limpieza de legacy y HLD

**Files:**

- Modify: `apps/web/app/error.tsx`, `apps/web/app/global-error.tsx`, `apps/web/app/privacidad/page.tsx`
- Delete: `apps/web/components/ui/primary-button.tsx`, `apps/web/components/ui/pill.tsx`
- Modify: `docs/hld-mvp.md` (fila "UI/estilo visual" de §1)

- [ ] **Step 1: Páginas de error y privacidad**

- `app/error.tsx`: R1 en "Reintentar" (`<Button variant="brand" onClick={reset}>`).
- `app/global-error.tsx`: acá no carga `globals.css` (reemplaza el layout raíz), por eso usa colores fijos. Solo se alinean los valores: `bg-[#141414]` → `bg-[#0D0D14]`; el botón pasa a `className="min-h-11 rounded-xl px-6 text-sm font-medium text-white"` con `style={{ backgroundImage: 'linear-gradient(135deg, #8457E9, #C026D3, #3B82F6)' }}`.
- `app/privacidad/page.tsx`: las tres `<section>` pasan a `Card` con `CardHeader`/`CardTitle` (el texto del `<h2>`) y `CardContent` (el `<p>`), imports desde `@/components/ui/card`.

- [ ] **Step 2: Borrar primitivos legacy**

```bash
cd /home/fernando/Escritorio/Dev/Fernando/app-gimnasio/apps/web
grep -rn "primary-button\|ui/pill" app components
```

Expected: sin salida. Entonces:

```bash
git rm components/ui/primary-button.tsx components/ui/pill.tsx
```

- [ ] **Step 3: Chequeo global de legacy**

```bash
grep -rnE "PrimaryButton|<Pill|INPUT_CLASSES|window\.confirm|role=\"alert\"|bg-gradient-accent|tailwindcss-animate|tailwind-merge|from 'clsx'" app components lib
```

Expected: sin salida. (`role="alert"` ya no debe aparecer a mano: lo pone `Alert`.)

- [ ] **Step 4: HLD §1**

En `docs/hld-mvp.md`, en la tabla de §1, reemplazar la fila `| UI/estilo visual | ... |` por:

```markdown
| UI/estilo visual | shadcn/ui (base Radix, estilo `radix-maia`) sobre Tailwind v4, tema oscuro único | shadcn/ui es MIT y se copia al repo (cumple la política de terceros de abajo). Tema oscuro único sin toggle; acento con gradiente violeta → magenta → azul sobre fondo casi negro; tokens OKLCH en `apps/web/app/globals.css`. Diseño y decisiones en `docs/superpowers/specs/2026-09-24-reskin-shadcn-design.md`. El heatmap de actividad y el mapa muscular siguen siendo referencia de diseño para Fase 2 |
```

- [ ] **Step 5: Verificación final**

```bash
cd /home/fernando/Escritorio/Dev/Fernando/app-gimnasio
pnpm --filter web build && pnpm lint && pnpm --filter web test && pnpm --filter api test
```

Expected: todo verde (el `api` no se tocó; se corre como red de seguridad del monorepo). Recorrido visual completo a 375px por los cuatro roles.

- [ ] **Step 6: Commit**

```bash
git add -A apps/web docs/hld-mvp.md
git commit -m "$(cat <<'EOF'
chore(web): limpiar primitivos legacy y actualizar hld con shadcn

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Preview en el celular**

Con autorización de Fernando: `git push -u origin feature/reskin-shadcn`. Vercel genera un preview deploy del branch; Fernando lo prueba en el celular (navegador) por los cuatro roles antes de mergear a `master`. No hace falta generar un APK nuevo: la app Android carga la web en vivo y va a tomar el reskin cuando se mergee a `master`.
