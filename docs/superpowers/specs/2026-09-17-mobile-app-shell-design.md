# Mobile App Shell — Diseño

**Fecha:** 2026-09-17
**Contexto:** El rediseño oscuro (2026-09-14) aplicó paleta y componentes de tarjeta,
pero la estructura de navegación y layout sigue siendo la de una web responsive
(páginas sueltas, logout como link flotante, contenido en columna centrada con
`max-w`). El usuario pidió que se sienta como una app de celular real.

## Problema

Comparado contra la referencia visual (screenshots de una app fitness nativa),
la app actual tiene estas señales de "sitio web" y no de "app":

1. No hay barra de navegación persistente — cada pantalla es una página aislada,
   navegable solo vía links sueltos dentro del contenido.
2. `LogoutButton` vive en una franja propia arriba de cada layout
   (`flex justify-end p-3`) — un patrón de topbar de sitio web, no de app.
3. `PageHeader` scrollea junto con el contenido — no queda fijo arriba.
4. El contenido vive en columnas centradas (`mx-auto max-w-2xl p-4` / `max-w-3xl`)
   con márgenes visibles a los costados incluso en mobile — en vez de ocupar
   el ancho real de la pantalla.
5. `Card` tiene borde visible (`border border-border`) — se ve como una caja
   de formulario web; la referencia distingue tarjetas solo por relleno.
6. El login es una tarjeta `max-w-sm` flotando en el centro de la pantalla,
   como un modal de sitio web, no una pantalla de login nativa a pantalla completa.

## Alcance

Cambio estructural + visual sobre el shell de navegación de las 3 secciones con
rol (`(alumno)`, `(profesor)`, `(admin)`) y el route group compartido
`(catalogo)`. No toca lógica de negocio, ni endpoints, ni el modelo de datos.

## Diseño

### 1. Barra de navegación inferior fija

Nuevo componente `components/ui/bottom-nav.tsx`, recibe la lista de items del
rol actual y la ruta activa:

```ts
interface BottomNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}
```

Destinos por rol (mapean 1:1 a rutas ya existentes, ninguna ruta nueva):

- **Alumno:** Rutina (`/alumno`, ícono `Dumbbell`) · Catálogo (`/catalogo`, ícono `LayoutGrid`)
- **Profesor:** Cartera (`/profesor`, ícono `Users`) · Plantillas (`/profesor/plantillas`, ícono `ClipboardList`) · Catálogo (`/catalogo`, ícono `LayoutGrid`)
- **Admin:** Panel (`/admin`, ícono `LayoutDashboard`) · Catálogo (`/catalogo`, ícono `LayoutGrid`)

Estilo: `fixed bottom-0 inset-x-0 z-10 flex items-center justify-around
border-t border-border bg-surface-alt`, con
`padding-bottom: env(safe-area-inset-bottom)` inline (no hay utilidad Tailwind
para `env()` en este proyecto). Cada item es un `Link` de Next; el activo
(comparando `usePathname()` con `href`, exacto para `/alumno` y `/admin`,
`startsWith` para las rutas con hijos como `/profesor` y `/profesor/plantillas`)
se pinta `text-accent-text` con el ícono envuelto en un círculo
`bg-gradient-accent`; los inactivos quedan en `text-text-muted`.

`BottomNav` es un client component (usa `usePathname`).

Cada `<main>` que hoy tiene contenido de página suma `pb-24` para que el último
ítem de las listas no quede tapado por la barra fija de ~72px + safe area.

**`(catalogo)/layout.tsx`** hoy solo valida sesión y descarta la respuesta de
`/users/me`. Pasa a capturar `me.role` y renderizar la variante de `BottomNav`
correspondiente — es la única pantalla compartida por los 3 roles, así que
necesita saber cuál mostrar. El fetch ya se hacía, no es una llamada nueva.

### 2. Logout: de topbar de sitio web a ícono en el header de cada pantalla

Se elimina de los 4 layouts (`(alumno)`, `(profesor)`, `(admin)`, `(catalogo)` —
este último también lo tiene hoy, se había omitido de la lista inicial) el bloque:

```tsx
<div className="flex justify-end p-3">
  <LogoutButton />
</div>
```

`LogoutButton` cambia su presentación: de botón con borde + texto "Cerrar
sesión" a botón ícono-solo (`LogOut`, sin texto, sin borde), pensado para el
slot `right` de `PageHeader` (que hoy existe pero ningún consumidor lo usa
realmente — issue menor pendiente de la revisión final del rediseño oscuro,
se cierra acá). El `aria-label="Cerrar sesión"` se mantiene para accesibilidad
ya que el texto visible desaparece.

Páginas que hoy no usan `PageHeader` lo suman: `/profesor` (título "Mi
cartera"), `/admin` (título "Panel Admin") y `/catalogo` — lista, no detalle —
(título "Catálogo de ejercicios"); las tres son destino de pestaña de la
barra inferior y necesitan el logout ahí porque ya no queda ningún topbar de
layout que lo tuviera. El resto (`/alumno`, `/catalogo/[id]`) ya usa
`PageHeader` — solo se les agrega `right={<LogoutButton />}` a `/alumno`
(`/catalogo/[id]` es una sub-pantalla con back button, no lleva logout).

`PageHeader` pasa a `sticky top-0 z-10 bg-surface` (antes scrolleaba con el
contenido) — con esto reemplaza también la franja fija eliminada del punto
anterior: cada pantalla tiene su propio header fijo con título + logout,
en vez de un topbar de layout separado del header de contenido.

### 3. Layout de contenido: ancho completo en mobile, tarjetas sin borde

- **Contenedores:** el patrón repetido `mx-auto max-w-2xl p-4` (y el
  `max-w-3xl` de `/admin`) pasa a `w-full px-4 sm:mx-auto sm:max-w-2xl` (o
  `sm:max-w-3xl` en admin) — en viewport de teléfono ocupa el ancho real de
  pantalla; en desktop (`sm:` = 640px+) se centra con el máximo ya definido,
  para no romper el uso ocasional en navegador de escritorio.
- **`Card`:** se quita `border border-border`, queda
  `rounded-2xl bg-surface-alt p-4` — la distinción con el fondo (`bg-surface`)
  es solo de relleno, como en la referencia.
- **Login (`app/login/page.tsx`):** deja de envolver el form en
  `<div className="max-w-sm rounded-2xl bg-surface-alt p-6">` centrado en
  pantalla. El `<main>` pasa a `flex min-h-dvh flex-col justify-end bg-surface
px-6 pb-10 pt-8` — título arriba, form pegado abajo (patrón de pantalla de
  login nativa a pantalla completa), sin tarjeta ni borde de por medio. El
  aviso de sesión expirada y el mensaje de error se mantienen sin cambios de
  contenido, solo heredan el nuevo contenedor.

## Fuera de alcance

- No se agregan pantallas nuevas (ej. no hay "Perfil" — logout vive en el
  header, no en la barra inferior, porque un ítem "Cerrar sesión" como
  destino de navegación es un patrón raro sin una pantalla de perfil real
  detrás, y crear esa pantalla no está pedido).
- No se toca `region-colors`, `tokens.css`, ni la paleta — eso ya quedó
  resuelto en el cambio anterior (violeta/fucsia).
- No se agrega gesto de swipe entre tabs, animaciones de transición entre
  rutas, ni bottom sheets — YAGNI hasta que se pida.
- `routine-exercises-editor.tsx` y los formularios de creación (admin/profesor)
  no cambian de estructura — ya usan `Card` y heredan el quite de borde
  automáticamente; no está en foco de este spec tocar su layout interno.

## Riesgo / verificación

- El único punto no puramente mecánico es `(catalogo)/layout.tsx` empezando a
  usar `me.role` — verificar con los 3 roles reales (admin/profesor/alumno)
  que la barra inferior correcta aparece al entrar a `/catalogo` desde cada uno.
- Verificar visualmente que `pb-24` alcanza en las listas más largas (cartera
  de profesor con muchos alumnos, catálogo con scroll) — la barra fija no debe
  tapar el último ítem ni dejar un hueco exagerado en pantallas con poco contenido.
