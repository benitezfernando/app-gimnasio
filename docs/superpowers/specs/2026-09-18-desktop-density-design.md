# Densidad Desktop — Diseño

**Fecha:** 2026-09-18
**Contexto:** El shell mobile (2026-09-17) dejó la app dimensionada para touch
(botones de 44px, texto base, barra de navegación inferior fija). El usuario
reporta que, al abrirla desde una computadora, "se ve todo grande" — la
densidad sigue siendo la de mobile aunque el contenido ya tenga `max-w` y
esté centrado en pantallas anchas.

## Objetivo

Agregar un tratamiento real de densidad para desktop, **sin cambiar nada
del comportamiento ni el look mobile actual** (nada por debajo del
breakpoint elegido se toca).

## Breakpoint

`lg:` (1024px+). No `sm:` (640px) — ese rango incluye tablets y ventanas
angostas donde el dedo sigue siendo el input principal; bajar la densidad
ahí perjudicaría el uso táctil real. Todo cambio de esta spec es una
variante `lg:` agregada encima de las clases existentes, nunca un
reemplazo — las clases mobile quedan intactas.

## Diseño

### 1. `BottomNav` pasa a top-nav en desktop

Mismo componente, mismos `items`/misma lógica de tab activo
(`getActiveNavHref`, ya implementado y testeado). Solo cambian las clases
de posición según breakpoint:

- Mobile (sin cambios): `fixed inset-x-0 bottom-0 z-10 flex min-h-16
items-center justify-around border-t border-border bg-surface-alt`, con
  `padding-bottom: env(safe-area-inset-bottom)` inline.
- Desktop (`lg:` agregado): `lg:inset-x-0 lg:top-0 lg:bottom-auto
lg:h-12 lg:min-h-0 lg:border-b lg:border-t-0` — sin el `padding-bottom`
  de safe-area (no aplica arriba; se deja el inline `style` tal cual, es
  inofensivo en desktop).
- Cada item: hoy es `flex-col` (ícono arriba, label abajo) — en desktop
  pasa a `lg:flex-row lg:gap-2` (ícono y label en fila, como un navbar
  típico de web).

### 2. `PageHeader` se acomoda debajo del nav en desktop

Sigue `sticky`, pero con `lg:top-12` (la altura del nuevo top-nav, `h-12`)
en vez de `top-0` — si no, el header sticky quedaría tapado por el nav al
scrollear. Título: `text-base` → suma `lg:text-sm`. El `right` slot
(`LogoutButton`) se achica vía el propio componente (ver punto 4).

### 3. Cada `<main>` invierte de dónde reserva espacio

Hoy todos los `<main>` de pantalla-con-nav usan `pb-28` (lugar para la
barra fija de abajo). En desktop el nav está arriba, no abajo — se agrega
`lg:pb-6 lg:pt-4` en cada uno. Las clases `lg:` ganan sobre las base en su
propio breakpoint por cómo Tailwind ordena las media queries generadas —
no hay conflicto de especificidad como el caso `py-4`/`pb-28` documentado
en el plan anterior (ese conflicto era entre dos clases del MISMO
breakpoint; acá son breakpoints distintos, Tailwind sí lo resuelve
correctamente por cascada de `@media`).

### 4. Nuevo componente compartido `PrimaryButton`

El botón primario (`min-h-11 rounded-lg bg-gradient-accent px-4/6
text-base font-medium text-accent-fg`) está duplicado hoy en 7 archivos:
`login/page.tsx`, `create-alumno-form.tsx`, `create-profesor-form.tsx`,
`plantillas/create-template-form.tsx`, `alumnos/[id]/assign-template-form.tsx`,
`admin/cartera-panel.tsx`, `routine-exercises-editor.tsx`. Se extrae a
`components/ui/primary-button.tsx`:

```ts
interface PrimaryButtonProps {
  children: ReactNode;
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string; // para el caso puntual de self-start en el editor
}
```

Con las clases base intactas + `lg:min-h-9 lg:px-4 lg:text-sm` agregado —
un solo lugar define la densidad de desktop del botón primario en toda la
app. `LogoutButton` (ícono-solo, ya es su propio componente) suma
`lg:h-9 lg:w-9` directo, sin necesitar `PrimaryButton`.

### 5. Densidad de `Card`, `Pill`, inputs y chips de filtro

- `Card`: `p-4` → suma `lg:p-3`.
- `Pill`: su padding/texto (definido en `components/ui/pill.tsx`) suma un
  escalón más chico en `lg:` (texto `text-xs` ya es el mínimo de Tailwind
  usado en la app — se ajusta el padding, no el texto, para no quedar
  ilegible).
- Los `<input>`/`<select>` sueltos (login, catálogo, los 4 forms de
  admin/profesor, `instance-editor.tsx`, `template-editor.tsx`,
  `routine-exercises-editor.tsx`) y los chips de filtro de `/catalogo`
  (`min-h-11 rounded-full border px-4`) suman `lg:min-h-9 lg:px-3
lg:text-sm` directo en cada archivo — mecánico, sin extraer un
  componente de input nuevo (evitar refactor de más en una spec que ya
  extrae `PrimaryButton`).

## Fuera de alcance

- No se tocan los `max-w-*` ni las columnas de grilla del catálogo (ya
  escalan razonablemente con el viewport vía `sm:`/`lg:grid-cols-*`
  existentes).
- No se agrega un sidebar ni ningún patrón de navegación nuevo — el
  top-nav de desktop es el mismo `BottomNav`, solo reposicionado.
- No se extrae un componente de `Input`/`Select` compartido — YAGNI para
  esta spec, el ajuste de densidad es mecánico por archivo.
- No cambia absolutamente nada del comportamiento/apariencia por debajo
  de `lg:` (1024px) — verificación explícita en el plan.

## Riesgo / verificación

- `PageHeader` con `lg:top-12`: verificar visualmente que no quede un
  hueco ni una superposición exacta con el nuevo `BottomNav` de `h-12` en
  desktop — los valores deben coincidir exactamente (12 = 3rem = 48px).
- Extraer `PrimaryButton` toca 7 archivos existentes — verificar que
  ninguno pierda su `type="submit"`/`disabled` (algunos vienen de
  `useFormStatus()` en un botón hijo de `<form action={...}>`) ni cambie
  de comportamiento, solo de dónde vive el className.
- Verificación manual en viewport ≥1024px de cada pantalla raíz de
  pestaña (alumno/profesor/admin/catálogo) y en viewport móvil real (no
  solo redimensionar la ventana del navegador) para confirmar que nada
  mobile cambió.
