# Guías de bienvenida (onboarding) — Diseño

## Objetivo

Que alumnos y profesores entiendan para qué sirve cada pantalla con un
recorrido paso a paso de globos (tooltips con resaltado), que se muestra
**solo la primera vez** que entran a cada pantalla. Además, el alumno deja
de tener acceso al catálogo completo de ejercicios.

## Decisiones (aprobadas)

1. **Persistencia en el navegador (localStorage)**, por usuario y por
   pantalla: clave `guia:<userId>:<guiaId>`. Se vuelve a ver en un
   dispositivo/navegador nuevo (aceptado). Sin backend ni deploy en Render.
2. **Una mini-guía por pantalla**, la primera vez que se entra a cada una
   (no un tour único que navegue entre pantallas).
3. **Librería `driver.js`** (MIT, ~5 KB gzip, sin dependencias), con
   estilos propios acordes al tema oscuro de la app.
4. **Solo alumno y profesor.** Sin guía para admin ni súper admin. Sin botón
   "Ver guía de nuevo".
5. **El alumno no ve el catálogo completo:** se quita "Catálogo" de su
   menú; la barra inferior **se conserva** aunque quede con un solo botón
   ("Rutina"). `/catalogo` y `/catalogo/[id]` redirigen al alumno a
   `/alumno`. El detalle de cada ejercicio de su rutina sigue en la ventana
   (`ExerciseDetailDialog`); el backend no cambia.

## Mecanismo

- **`components/guia-de-pantalla.tsx`** (cliente): props `userId: string` y
  `guias: Array<{ id: string; pasos: PasoGuia[] }>`. Un `PasoGuia` es
  `{ elemento?: string; titulo: string; texto: string }`, donde `elemento`
  es el valor de un atributo `data-guia` (sin `elemento` → globo centrado).
- **Lógica pura y testeada** en `lib/guias.ts`:
  - `claveGuia(userId, guiaId)` → `guia:<userId>:<guiaId>`.
  - `guiaVista(storage, clave)` / `marcarGuiaVista(storage, clave)`: envuelven
    `localStorage` en try/catch; si no está disponible, `guiaVista` devuelve
    `true` (no se muestra la guía y la app no falla).
  - `pasosVisibles(pasos, buscar)`: descarta los pasos cuyo elemento no
    existe o no está visible (`buscar` se inyecta para testear sin DOM).
  - `siguienteGuia(guias, vista, pasosVisibles)`: devuelve la primera guía
    no vista con al menos un paso visible, o `null`.
- **Elementos:** atributo `data-guia="<nombre>"`. Si hay más de un elemento
  con el mismo nombre (barra inferior en celular y sidebar en PC), se usa el
  primero visible.
- **Arranque:** al montar espera ~600 ms (que la pantalla termine de
  dibujarse) y toma la primera guía no vista que tenga pasos visibles; si
  hay, inicia `driver.js`. Al terminar **o al saltear**, la marca como vista.
- **Varias guías en una pantalla:** al cerrar una guía se pasa a la
  siguiente no vista con pasos visibles. Una guía sin pasos visibles se
  saltea **sin marcarse** (se mostrará cuando esos elementos existan).
- **Botones:** Siguiente, Anterior, Saltar (cerrar) y "Listo" en el último
  paso; progreso "N de M". Textos en español.
- **Estilos:** `popoverClass` propio en `globals.css`: fondo `--card`, borde
  `--border`, texto `--foreground`, botón principal con `bg-gradient-brand`.

## Contenido

`*(elemento)*` indica a qué `data-guia` apunta; sin elemento, globo centrado.

**`alumno-rutina`** — `/alumno`

1. _(centro)_ **¡Bienvenido/a!** — "Esta es tu rutina. Acá vas a ver los
   ejercicios que te armó tu profesor."
2. _(`dias-rutina`)_ **Tus días** — "Tu rutina está dividida en días. Elegí
   el que te toca hoy; la app lo recuerda para la próxima vez."
3. _(`ejercicio-rutina`, primero)_ **Cada ejercicio** — "Ves las series,
   repeticiones y el peso. Tocalo para ver cómo se hace, con la animación y
   los pasos."

**`catalogo`** — `/catalogo` (solo profe; el alumno ya no entra)

1. _(`catalogo-buscador`)_ **Buscá** — "Escribí el nombre de un ejercicio."
2. _(`catalogo-filtros`)_ **Filtrá** — "Filtrá por zona del cuerpo o por el
   equipamiento que tengas."
3. _(`catalogo-tarjeta`, primera)_ **Mirá el detalle** — "Tocá un ejercicio
   para ver cómo se hace."

**`profesor-cartera`** — `/profesor`

1. _(centro)_ **¡Bienvenido/a, profe!** — "Esta es tu cartera: los alumnos a
   tu cargo."
2. _(`nuevo-alumno`)_ **Sumá alumnos** — "Creá un alumno con nombre y
   apellido. Entra a la app solo con su usuario, sin contraseña."
3. _(`alumno-fila`, primero)_ **Su rutina** — "Tocá un alumno para asignarle
   o ajustarle la rutina."
4. _(`nav-plantillas`)_ **Plantillas** — "Armá rutinas modelo y reutilizalas
   con varios alumnos."
5. _(`nav-catalogo`)_ **Catálogo** — "Todos los ejercicios disponibles."

**`profesor-plantillas`** — `/profesor/plantillas`

1. _(`nueva-plantilla`)_ **Nueva plantilla** — "Ponele un nombre, por ejemplo
   'Fuerza 3 días'. Después le cargás los días y los ejercicios."
2. _(`plantilla-fila`, primera)_ **Editala** — "Tocá una plantilla para armar
   sus días. Si la cambiás, se actualiza en los alumnos que la tengan
   vinculada."

**`editor-rutina`** — `/profesor/plantillas/[id]` y `/profesor/alumnos/[id]`
(misma guía: se ve una vez, en el que se abra primero)

1. _(`editor-dias`)_ **Días** — "Cada pestaña es un día. Con + agregás otro."
2. _(`editor-buscador`)_ **Agregá ejercicios** — "Buscá un ejercicio y sumalo
   al día."
3. _(`editor-imagen`, primera)_ **Ver detalle** — "Tocá la imagen para ver
   cómo se hace, sin salir del editor."
4. _(`editor-renombrar`, primero)_ **Renombrar** — "Ponele el nombre con el
   que lo conocen en tu gimnasio. Lo ven tus alumnos y no cambia el
   catálogo."
5. _(`editor-valores`, primero)_ **Series, reps y peso** — "Ajustá los
   valores de cada ejercicio."
6. _(`editor-arrastrar`, primero)_ **Ordenar** — "Arrastrá desde acá para
   cambiar el orden."
7. _(`editor-guardar`)_ **Guardá** — "Los cambios se aplican recién cuando
   tocás Guardar."

**`profesor-alumno`** — `/profesor/alumnos/[id]` (además de `editor-rutina`)

1. _(`asignar-rutina`)_ **Asignar rutina** — "Asigná una rutina nueva desde
   una plantilla o desde cero. Reemplaza la que tenga."

En `/profesor/alumnos/[id]` se pasan las dos guías en orden
(`editor-rutina`, `profesor-alumno`) al mismo componente, que las corre una
tras otra (ver "Varias guías en una pantalla"). Si el alumno no tiene rutina
vigente no hay editor: `editor-rutina` no tiene pasos visibles, se saltea sin
marcarse y se muestra directamente `profesor-alumno`; `editor-rutina` se
verá la primera vez que haya un editor.

## Alumno sin catálogo

- `ALUMNO_NAV_ITEMS` queda solo con "Rutina" (la barra inferior se conserva).
- `app/(catalogo)/layout.tsx`: si `user.role === 'ALUMNO'`, `redirect('/alumno')`
  (cubre `/catalogo` y `/catalogo/[id]`).
- Backend sin cambios (`GET /exercises/:id` lo sigue usando la ventana de
  detalle del alumno).

## Pruebas

- Jest (`lib/guias.spec.ts`): `claveGuia`; `guiaVista`/`marcarGuiaVista` con
  un storage falso, incluido uno que lanza (→ vista = true, sin romper);
  `pasosVisibles` con un `buscar` falso (pasos centrados se conservan, pasos
  sin elemento visible se descartan); `siguienteGuia` (saltea vistas y sin
  pasos visibles, devuelve `null` si no queda ninguna).
- Manual: cada guía aparece la primera vez y no la segunda; Saltar la marca
  como vista; en celular apunta a la barra inferior y en PC al sidebar;
  alumno sin rutina (solo bienvenida); alumno → `/catalogo` redirige a
  `/alumno`.

## Fuera de alcance

- Guías para admin y súper admin; "Ver guía de nuevo"; sincronizar entre
  dispositivos (requeriría backend).
