# Login del alumno en página propia — Diseño

## Contexto

Hoy `/login` es un único formulario para ADMIN, PROFESOR y ALUMNO: si la
contraseña viaja vacía, `LoginUseCase` (backend) toma la rama de alumno
(contraseña derivada con HMAC). Por eso el placeholder dice "Contraseña
(dejalo vacío si sos alumno)". Todo lo que manda "al login" apunta a
`/login`: `/` sin sesión (lo que abre el ícono de la app web y Android),
los layouts de cada rol, `LogoutButton` (default) y la sesión vencida en
el navegador (`browserApiFetch`).

## Decisiones (aprobadas)

1. Página nueva **`/alumno/login`**, solo con el campo Usuario, mismo
   esquema que `/super-admin/login`.
2. `/login` queda para profesor y admin: contraseña obligatoria, sin el
   texto "(dejalo vacío si sos alumno)".
3. Cada login tiene un link al otro ("¿Sos profesor o admin? Ingresá
   acá" / "¿Sos alumno? Ingresá acá").
4. Lo que es del alumno vuelve a `/alumno/login`; `/` sin sesión va a
   `/alumno/login` (los alumnos son la mayoría de los usuarios de la
   app).
5. **Sin cambios en el backend** (no hace falta Manual Deploy en Render):
   `POST /auth/login` ya distingue por presencia de `password`.

## Frontend (`apps/web`)

- **`lib/login-routes.ts`** (nuevo, puro y testeado):
  - `loginDeRol(role)`: `ALUMNO` → `/alumno/login`, `SUPER_ADMIN` →
    `/super-admin/login`, `ADMIN`/`PROFESOR` → `/login`.
  - `loginPorSesionVencida(pathname)`: rutas que empiezan con
    `/profesor` o `/admin` → `/login?sessionExpired=1`; `/super-admin`
    → `/super-admin/login`; cualquier otra → `/alumno/login?sessionExpired=1`.
- **`app/alumno/login/page.tsx` + `actions.ts`** (nuevos; fuera del route
  group `(alumno)`, igual que `app/super-admin/login`, para que el layout
  que exige sesión no la intercepte). Logo, título "Ingresar", campo
  Usuario (`autoCapitalize="none"`, `autoCorrect="off"`), botón, aviso de
  sesión expirada (`?sessionExpired=1`) y link a `/login`. `alumnoLoginAction` llama a
  `POST /auth/login` con `{ gymId, username }` (sin `password`), guarda
  la sesión, consulta `/users/me` y, si el rol no es `ALUMNO`, cierra la
  sesión y devuelve el error genérico; si es alumno, redirige a
  `/alumno`. Error genérico: "Usuario incorrecto."
- **`app/login/page.tsx` + `actions.ts`**: contraseña `required` y
  placeholder "Contraseña"; `loginAction` exige contraseña no vacía
  (si falta, error genérico sin llamar al backend) y, si el rol logueado
  es `ALUMNO`, cierra la sesión y devuelve "Usuario o contraseña
  incorrectos.". Link "¿Sos alumno? Ingresá acá" → `/alumno/login`.
- **Redirecciones sin sesión:**
  - `app/page.tsx` (`/`): 401/403 → `/alumno/login`.
  - `app/(alumno)/layout.tsx`: 401/403 o rol distinto → `/alumno/login`.
  - `app/(catalogo)/layout.tsx`: 401/403 → `/` (compartido por los tres
    roles; termina en el login de alumno, con link al de staff).
  - `lib/browser-api-client.ts`: 401 →
    `loginPorSesionVencida(window.location.pathname)`.
- **Cerrar sesión:** `logoutAction(redirectTo?)` — si no recibe destino
  explícito, consulta `/users/me` **antes** de cerrar la sesión y
  redirige a `loginDeRol(role)`; si esa consulta falla, redirige a `/`.
  `LogoutButton` deja de tener default `/login` (sin `redirectTo` →
  destino según rol). `AppShell`/`Sidebar` dejan de forzar `/login` por
  default. El súper admin sigue pasando `/super-admin/login` explícito.

## Pruebas

- Unitarias (jest, `lib/login-routes.spec.ts`): `loginDeRol` para los
  cuatro roles y `loginPorSesionVencida` para `/profesor/...`,
  `/admin`, `/super-admin`, `/alumno`, `/catalogo/x`.
- Manual: login de alumno con solo usuario; alumno en `/login` →
  rechazado; profe en `/alumno/login` → rechazado; links entre páginas;
  cerrar sesión de alumno → `/alumno/login`, de profe → `/login`; `/` sin
  sesión → `/alumno/login`.

## Fuera de alcance

- Cambios en el backend o en cómo se derivan las contraseñas.
- Multi-gimnasio por URL (sigue `NEXT_PUBLIC_GYM_ID`).
