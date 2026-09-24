# Reskin de apps/web con shadcn/ui — Diseño

## Objetivo

Renovar el estilo visual de `apps/web` usando shadcn/ui como librería de
componentes. Es un cambio de piel: no se tocan rutas, Server Actions,
fetches, lógica de negocio ni la estructura de route groups.

## Decisiones fijadas por el usuario (no negociables)

- Tema oscuro único. Sin toggle claro/oscuro, nunca.
- Acento con gradiente violeta → magenta → azul sobre fondo casi negro.
- Mobile-first: ~90% del uso es desde el celular (y desde la app Android
  TWA). El desktop es secundario.
- Nada de sintaxis vieja o deprecada de shadcn/ui: todo según la
  documentación vigente (verificada el 2026-09-24, ver "Fuentes").

## Discrepancias con los docs existentes (resueltas acá)

- `docs/hld-mvp.md` §1 (fila "UI/estilo visual") dice "componentes propios
  (Tailwind)" y "tema claro/oscuro con paleta de acento configurable".
  Queda desactualizado: se reescribe esa fila en la última tarea del
  plan. shadcn/ui es MIT y su modelo es copiar el código al repo, así que
  cumple la "Política de código/assets de terceros" del mismo HLD (esa
  regla existe por licencias virales tipo AGPL).
- `docs/prd-mvp.md` HU-08 no define composición visual. Se define acá.
- El gradiente actual en código es de dos paradas (violeta → magenta). Se
  agrega el azul como tercera parada.

## Hallazgo de la investigación: shadcn actual exige Tailwind v4

La documentación vigente de shadcn/ui (CLI v4, marzo 2026) está hecha
para Tailwind v4: tokens en OKLCH, bloque `@theme inline`,
`tw-animate-css` en lugar de `tailwindcss-animate` (deprecado), paquete
`cn` en lugar de `clsx` + `tailwind-merge` (septiembre 2026), estilos
`{base}-{estilo}` en lugar de `new-york`. Para proyectos Tailwind v3 la
única vía documentada es el CLI congelado `shadcn@2.3.0` con el registry
v3 — exactamente la sintaxis vieja que queda descartada.

**Decisión:** migrar `apps/web` de Tailwind v3.4 a Tailwind v4 como
primera tarea (tooling, no arquitectura de la app), con la herramienta
oficial `npx @tailwindcss/upgrade`.

**Impacto a aceptar:** Tailwind v4 requiere Safari 16.4+, Chrome 111+,
Firefox 128+. La app Android (TWA) corre sobre Chrome actualizado, sin
problema. Un alumno que entre desde el navegador de un iPhone con iOS
anterior a 16.4 (marzo 2023) vería la app sin estilos.

## Stack

- Tailwind CSS v4 (`@tailwindcss/postcss`), sin `tailwind.config.ts`
  (config en CSS con `@theme`).
- shadcn/ui, **base Radix** (paquete unificado `radix-ui`), **estilo
  `radix-maia`** ("suave y redondeado, con espaciado generoso": encaja con
  mobile-first y áreas táctiles grandes).
- `components.json` escrito a mano (instalación manual documentada, no
  interactiva) y después `shadcn add` para cada componente.
- Dependencias base: `shadcn`, `class-variance-authority`, `cn`,
  `tw-animate-css`. `lucide-react` ya está instalado (`iconLibrary:
"lucide"`).
- Componentes en `apps/web/components/ui/` (alias `@/components/ui`),
  `lib/utils.ts` = `export { cn } from "cn"`.

## Tokens

Fuente única de verdad: `apps/web/app/globals.css`, siguiendo la
estructura documentada (`@import "tailwindcss"`, `@import
"tw-animate-css"`, `@import "shadcn/tailwind.css"`, `@custom-variant
dark`, `@theme inline`, bloque de variables, `@layer base`).

Como no existe tema claro, los valores oscuros se declaran una sola vez
bajo el selector `:root` (no hay bloque `.dark` separado con otros
valores), y `<html>` lleva `className="dark"` para que toda variante
`dark:` de los componentes shadcn aplique. `color-scheme: dark` en `html` para que los
controles nativos (picker del `<select>`, scrollbars, autocompletado) se
rendericen oscuros en el celular.

Los tokens legacy (`--color-surface`, `--color-text`, `--color-accent`…,
triples RGB en `app/tokens.css`) se eliminan; sus clases se reemplazan
con un codemod mecánico en un solo paso.

| Token                    | Valor OKLCH              | Hex     | Reemplaza a (legacy)              |
| ------------------------ | ------------------------ | ------- | --------------------------------- |
| `--background`           | oklch(0.163 0.015 284.7) | #0D0D14 | `surface`                         |
| `--foreground`           | oklch(0.972 0.007 286.3) | #F5F5FA | `text`                            |
| `--card`                 | oklch(0.214 0.022 284.4) | #181823 | `surface-alt`                     |
| `--card-foreground`      | oklch(0.972 0.007 286.3) | #F5F5FA | —                                 |
| `--popover`              | oklch(0.214 0.022 284.4) | #181823 | —                                 |
| `--popover-foreground`   | oklch(0.972 0.007 286.3) | #F5F5FA | —                                 |
| `--primary`              | oklch(0.582 0.210 292.9) | #8457E9 | `accent`                          |
| `--primary-foreground`   | oklch(1 0 0)             | #FFFFFF | `accent-fg`                       |
| `--primary-soft`         | oklch(0.827 0.108 306.4) | #D8B4FE | `accent-text`                     |
| `--secondary`            | oklch(0.258 0.024 284.6) | #22222F | —                                 |
| `--secondary-foreground` | oklch(0.972 0.007 286.3) | #F5F5FA | —                                 |
| `--muted`                | oklch(0.258 0.024 284.6) | #22222F | —                                 |
| `--muted-foreground`     | oklch(0.645 0.022 285.8) | #8C8C9B | `text-muted`                      |
| `--accent`               | oklch(0.258 0.024 284.6) | #22222F | — (hover sutil, semántica shadcn) |
| `--accent-foreground`    | oklch(0.972 0.007 286.3) | #F5F5FA | —                                 |
| `--destructive`          | oklch(0.711 0.166 22.2)  | #F87171 | `danger`                          |
| `--success`              | oklch(0.800 0.182 151.7) | #4ADE80 | `success`                         |
| `--border`               | oklch(0.304 0.027 284.7) | #2D2D3C | `border`                          |
| `--input`                | oklch(0.304 0.027 284.7) | #2D2D3C | —                                 |
| `--ring`                 | oklch(0.582 0.210 292.9) | #8457E9 | —                                 |
| `--radius`               | 0.75rem                  | —       | —                                 |

`--primary-soft` y `--success` son tokens propios: se agregan en las
variables y en `@theme inline` siguiendo el procedimiento documentado
para colores custom.

Colisión de nombre a tener en cuenta: en el código actual `accent` es el
violeta principal; en shadcn `accent` es el fondo sutil de hover. El
codemod mapea `accent` legacy → `primary`, nunca → `accent`.

Gradiente de marca (tres paradas):

| Token          | Valor OKLCH              | Hex               |
| -------------- | ------------------------ | ----------------- |
| `--brand-from` | oklch(0.582 0.210 292.9) | #8457E9 (violeta) |
| `--brand-via`  | oklch(0.591 0.257 322.9) | #C026D3 (magenta) |
| `--brand-to`   | oklch(0.623 0.188 259.8) | #3B82F6 (azul)    |

Utilidades (sintaxis v4, `@utility`): `bg-gradient-brand` (fondo, 135°) y
`text-gradient-brand` (texto con `background-clip: text`). Reemplazan a
`bg-gradient-accent`.

Los colores de región muscular (`--color-region-*`, triples RGB leídos
por `lib/region-colors.ts` en estilos inline) se conservan tal cual,
movidos a `globals.css`.

## Mapeo de componentes

| Hoy                                                       | Después (componente oficial shadcn salvo aclaración)                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `components/ui/primary-button.tsx`                        | `Button` con variante `brand` agregada (gradiente)                                                     |
| Botones sueltos con clases a mano                         | `Button` variantes `outline` / `ghost` / `destructive` / `secondary`                                   |
| Botones con estado "Guardando…"                           | `Button` + `Spinner`                                                                                   |
| `components/ui/card.tsx` (propio)                         | `Card` (+ `CardHeader`/`CardTitle`/`CardContent` donde hay sección con título)                         |
| `components/ui/pill.tsx`                                  | `Badge` (variantes `outline` / `secondary`)                                                            |
| Chip de región (span con color inline)                    | `Badge` con `style={{ backgroundColor }}`                                                              |
| `INPUT_CLASSES` + `<input>` crudos                        | `Input` dentro de `Field` + `FieldLabel` (label `sr-only` donde hoy solo hay placeholder)              |
| Mensajes de error bajo formularios                        | `FieldError` cuando son de un campo; `Alert` variante `destructive` cuando son del formulario entero   |
| `<select>` nativo (4 usos)                                | `NativeSelect` + `NativeSelectOption` (sigue siendo `<select>` real: picker del sistema en el celular) |
| `window.confirm` (4 archivos)                             | `components/confirm-dialog.tsx` (propio, sobre `AlertDialog`)                                          |
| `delete-permanently-dialog.tsx` (modal propio)            | `AlertDialog` (misma lógica de impacto)                                                                |
| Estados vacíos ("todavía no tenés rutina", listas vacías) | `Empty`                                                                                                |
| `GradientIcon`                                            | Se mantiene (propio), con los tokens de marca                                                          |
| `BottomNav`, `PageHeader`, `BackLink`, `HomeLink`         | Se mantienen (propios), restyle con tokens nuevos y `Button` `ghost` tamaño `icon`                     |

`window.confirm` se reemplaza porque en la app Android TWA el diálogo
nativo de Chrome muestra el dominio ("mixentrenamiento.vercel.app
dice…") y rompe la sensación de app nativa. La lógica de cada
confirmación no cambia: mismo texto, misma acción, mismo resultado.

Fuera de alcance (YAGNI): toasts, skeletons, tabs, command palette,
fuentes nuevas, animaciones de página, `Select` de Radix.

## Mobile-first

- Tamaño táctil mínimo 44px en mobile (`h-11`), más compacto en desktop
  (`lg:h-9`). La convención ya existe en el código (`min-h-11
lg:min-h-9`) y se codifica en las variantes de tamaño de `Button` e
  `Input`, así ningún caller necesita pisarlas.
- `text-base` en inputs en mobile (evita el zoom automático del navegador
  al enfocar un input con font-size menor a 16px), `lg:text-sm` en
  desktop.
- `AlertDialog` en mobile: ancho completo con margen, botones apilados a
  ancho completo (comportamiento por defecto del componente).
- `BottomNav` sigue fija abajo en mobile y arriba en desktop (sin cambio
  de estructura).

## Composición visual

- Fondo de pantalla `background` (casi negro); superficies elevadas
  (cards, secciones de formulario) en `card` con borde `border` sutil.
- El gradiente de marca se reserva para: el botón principal de cada
  pantalla, el ítem activo de `BottomNav`, `GradientIcon`, y el título de
  la pantalla de login (`text-gradient-brand`). No se usa como fondo de
  secciones enteras.
- Acciones destructivas: `Button` `destructive` u `outline` con texto
  `destructive`, nunca con el gradiente.

## Orden de migración

1. Tailwind v3 → v4 (herramienta oficial), sin cambio visual buscado.
2. Fundación shadcn: `components.json`, `cn`, tokens nuevos en
   `globals.css`, `dark` forzado, codemod de clases legacy.
3. Primitivos: `Button` (+ variante `brand`), `Card`, `Badge`, `Input`,
   `Label`, `Field`, `NativeSelect`, `Alert`, `AlertDialog`, `Empty`,
   `Spinner`, `ConfirmDialog`; restyle de `BottomNav`/`PageHeader`/
   `BackLink`/`HomeLink`/`GradientIcon`; borrar `PrimaryButton`/`Pill`.
4. Recorrido del alumno (lo más usado): login, `/alumno`, `/catalogo`,
   `/catalogo/[id]`, `ExerciseCard`.
5. Profesor: cartera, detalle de alumno, plantillas, `ExercisePicker`,
   `RoutineExercisesEditor`.
6. Admin: panel, formularios de alta, lista de usuarios, cartera,
   eliminación definitiva.
7. Super-admin: login, lista y alta de admins.
8. Resto: `/privacidad`, `error.tsx`, `global-error.tsx`; actualización de
   HLD §1.

## Verificación

No hay tests de render de componentes en `apps/web` (jest solo corre
`*.spec.ts` de lógica). Cada tarea se verifica con:

- `pnpm --filter web build` (type-check + build de producción).
- `pnpm lint` en la raíz.
- `pnpm --filter web test` (los specs de lógica existentes siguen
  pasando).
- Chequeos por grep (cero clases legacy, cero `window.confirm`, etc.).
- `pnpm --filter web dev` y revisión a 375px de ancho; al final, en el
  celular real vía el preview deploy de Vercel del branch.

## Fuentes (consultadas 2026-09-24)

- https://ui.shadcn.com/docs/installation/next
- https://ui.shadcn.com/docs/installation/manual
- https://ui.shadcn.com/docs/components-json
- https://ui.shadcn.com/schema.json
- https://ui.shadcn.com/docs/cli
- https://ui.shadcn.com/docs/theming
- https://ui.shadcn.com/docs/tailwind-v4
- https://ui.shadcn.com/docs/changelog (CLI v4, `cn`, estilos)
- https://ui.shadcn.com/docs/components (lista vigente; `native-select`,
  `field`, `empty`)
- https://tailwindcss.com/docs/upgrade-guide
