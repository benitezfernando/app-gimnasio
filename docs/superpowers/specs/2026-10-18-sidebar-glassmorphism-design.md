# Sidebar glassmorphism en desktop + retoque visual de la nav — Diseño

## Contexto

La app es mobile-first (PWA). La navegación hoy es un único componente,
`BottomNav` (`apps/web/components/ui/bottom-nav.tsx`), que se renderiza
como barra inferior en mobile y como barra superior fina (`h-12`) en
desktop (breakpoint `lg`), usando las mismas filas de ítems
(`ALUMNO_NAV_ITEMS`, `PROFESOR_NAV_ITEMS`, `ADMIN_NAV_ITEMS`) montadas por
cada uno de los 4 layouts de route group: `(admin)`, `(profesor)`,
`(alumno)`, `(super-admin)`.

El pedido: llevar la nav a una estética "glassmorphism" moderna (blur,
transparencias, transiciones y hover suaves), inspirada en una referencia
visual (sidebar lateral oscuro con panel de vidrio), manteniendo la
paleta de colores ya definida en `apps/web/app/globals.css` (tema oscuro
único, gradiente de marca violeta→magenta→azul).

## Alcance

1. Sidebar lateral real en desktop (`lg+`), reemplazando la barra superior
   fina actual.
2. Bottom nav de mobile se mantiene estructuralmente, pero se retoca
   visualmente para compartir el mismo lenguaje (más blur, transiciones,
   feedback al tocar).
3. El sidebar incluye un bloque de usuario (nombre + rol) y el botón de
   logout, además de la navegación.
4. Fuera de alcance: sidebar colapsable (queda fijo, siempre expandido) y
   ocultar el `LogoutButton` que ya existe en el header de cada página
   (queda duplicado en desktop — decisión explícita, ver "Decisiones").

## Arquitectura de componentes

- **`BottomNav`** (existente, se simplifica): pierde toda la lógica
  condicional `lg:` — pasa a ser _solo_ la barra inferior de mobile,
  oculta en desktop (`lg:hidden`). Mismo `BottomNavItem[]` y
  `getActiveNavHref` que ya existen, sin cambios de tipos.
- **`Sidebar`** (nuevo, `apps/web/components/ui/sidebar.tsx`): panel fijo
  a la izquierda, alto completo, visible solo en desktop
  (`hidden lg:flex`). Recibe `items: BottomNavItem[]` (mismo tipo que
  `BottomNav`) y `user: { nombre: string; role: Role }`. Geometría
  (columna vertical, bloque de usuario arriba, logout abajo) es
  suficientemente distinta de la barra inferior como para no forzar un
  solo JSX condicional — mismo dato, dos presentaciones.
- **`AppShell`** (nuevo, `apps/web/components/ui/app-shell.tsx`): wrapper
  que compone `<Sidebar>` + `<BottomNav>` + el padding del contenido en
  desktop (`lg:pl-64`, ancho del sidebar) en un solo lugar. Cada layout
  pasa de:
  ```tsx
  <>
    {children}
    <BottomNav items={ADMIN_NAV_ITEMS} />
  </>
  ```
  a:
  ```tsx
  <AppShell items={ADMIN_NAV_ITEMS} user={user}>
    {children}
  </AppShell>
  ```
  Esto consolida en un solo lugar un patrón hoy repetido en los 4
  layouts.
- **`PageHeader`** (`apps/web/components/ui/page-header.tsx`): ajuste de
  `lg:top-12` → `lg:top-0`. El offset actual asume la barra superior fina
  que este trabajo elimina; sin el ajuste quedaría un hueco de 48px
  arriba de cada página en desktop.

## Lenguaje visual

Todo mapeado a los tokens ya existentes en `globals.css` (`--card`,
`--border`, `--primary`, `--primary-soft`, `--brand-from/via/to`,
`bg-gradient-brand`) — no se agregan colores nuevos.

- **Panel del sidebar:** `bg-card/60 backdrop-blur-xl border-r
border-border/60`, `h-dvh`, fijo a la izquierda.
- **Fondo global con glow decorativo:** el `--background` actual es un
  oklch sólido parejo, sin variación. Se agregan 2 manchas radiales
  grandes, muy difuminadas y de baja opacidad, fijas (`body::before` o
  similar, puramente CSS, sin imágenes ni JS), usando
  `--brand-from/via/to` ya existentes, para que el panel de vidrio tenga
  algo de color de fondo que se note a través del blur.
- **Bloque de usuario** (arriba del sidebar): avatar circular con
  inicial del nombre, `bg-gradient-brand` (mismo gradiente que ya se usa
  en el ícono activo de `BottomNav`); debajo, nombre y rol en
  `text-muted-foreground text-xs`.
- **Ítem de nav activo:** fila completa `bg-primary/12` + borde
  izquierdo `border-l-2 border-primary`, ícono y label en
  `text-primary-soft` — mismo lenguaje que el "pill" circular que ya
  existe en mobile, adaptado a fila horizontal.
- **Hover (ítem inactivo):** `hover:bg-accent/50 transition-colors
duration-200` + `scale-105` sutil en el ícono
  (`transition-transform`).
- **Logout:** al fondo del sidebar, separado por `border-t
border-border/60`. Reutiliza `LogoutButton` tal cual (ya es
  `variant="ghost" size="icon"`), sin reimplementarlo.
- **Bottom nav mobile:** mismo retoque de lenguaje — `backdrop-blur-xl`
  (antes `backdrop-blur`), `transition-all duration-200`, y
  `active:scale-95` al tap para feedback táctil.

## Datos: extender `GET /users/me`

Hoy (`apps/api/src/identity/infrastructure/http/users.controller.ts:69-72`)
devuelve `{ id, gymId, role }`, derivado directo de `req.user`
(`AuthenticatedUser`, poblado desde el JWT sin ir a la DB). El nombre no
viaja en el JWT, así que el bloque de usuario del sidebar necesita una
lookup puntual:

```ts
@Get('me')
async me(@Req() req: RequestWithUser) {
  const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.user.id } });
  return { id: user.id, gymId: user.gymId, role: user.role, nombre: user.nombre, username: user.username };
}
```

Esta lookup es exclusiva de este endpoint (no toca el guard de cada
request, que sigue sin ir a la DB). Frontend: nuevo `getCurrentUser()` en
`apps/web/lib/`, mismo patrón memoizado por request que
`getUsersList()` (`apps/web/lib/get-users-list.ts`), consumido por los 4
layouts para pasarle `user` al `AppShell`.

## Decisiones explícitas (ya consultadas y aprobadas)

- **Sidebar fijo, sin colapsar.** Pocos ítems por rol (2-3) no justifican
  el estado extra de expandir/colapsar.
- **Logout duplicado en desktop.** El `LogoutButton` que ya existe en el
  `PageHeader` de 9 páginas queda como está; el sidebar suma su propio
  logout. Redundancia visual aceptada explícitamente para no tocar esas
  9 páginas.

## Testing

- Test de `getActiveNavHref` ya existe (`bottom-nav-active`) y no cambia
  — se reutiliza tal cual para `Sidebar`.
- Nuevo test de `Sidebar`: renderiza ítems, marca el activo según
  `pathname`, renderiza bloque de usuario con nombre/rol.
- Nuevo test de `AppShell`: renderiza `Sidebar` + `BottomNav` + aplica el
  padding del contenido.
- Test de `GET /users/me`: devuelve `nombre`/`username` además de los
  campos actuales.
- Verificación visual manual (no automatizable razonablemente): correr
  la app y revisar en mobile y desktop que el sidebar/bottom nav se vean
  como se describe, sin romper el layout de ninguna de las 4 secciones
  (admin, profesor, alumno, super-admin).
