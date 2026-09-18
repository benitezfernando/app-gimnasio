# Rediseño visual oscuro (estilo referencia) — diseño

Fecha: 2026-09-14
Estado: aprobado por el usuario, pendiente de plan de implementación.

## Contexto

El usuario pidió adoptar el estilo visual de una captura de referencia (app de fitness estilo "Lower Focus"): tema oscuro fijo, tarjetas redondeadas, thumbnails circulares, badges tipo cápsula (pill) para series/reps/peso, gradiente violeta→azul como acento. Se aplica a **toda la app** en esta vuelta (rutina de alumno, editor de profesor, catálogo, admin, login), no solo a las pantallas de rutina que mostraba la captura.

Decisiones de alcance acordadas con el usuario:

- **Sin modo claro** — se elimina por completo (no se oculta el botón, se borra el mecanismo). Un solo tema oscuro fijo.
- **Sin franja de resumen agregado** (Duration/Reps/Sets a nivel rutina de la captura) — no existe ese cálculo hoy en el backend (los datos son series/reps/descanso por ejercicio, no un rango a nivel rutina) y queda fuera de esta vuelta.
- **Sin ilustraciones de silueta muscular** ("Target Muscles" de la captura) — se reemplaza por un ícono de Lucide sobre fondo con gradiente, sin encargar arte custom. La sección de resumen muscular no existe hoy en la app; si se agrega después, usa este mismo componente de ícono.
- Filtros/selects de la captura no se replican — ya existen los propios de este proyecto (búsqueda, parte del cuerpo, equipamiento en `/catalogo`), sin cambios de comportamiento, solo de estilo.

## Paleta de colores (tokens)

Reemplaza la paleta actual de `apps/web/app/tokens.css` — un solo `:root`, sin bloque `.dark` (ya no hay alternancia de tema):

| Token                 | Valor (RGB)            | Uso                                                     |
| --------------------- | ---------------------- | ------------------------------------------------------- |
| `--color-surface`     | `13 13 20`             | Fondo general de la app                                 |
| `--color-surface-alt` | `24 24 35`             | Tarjetas, superficies elevadas                          |
| `--color-text`        | `245 245 250`          | Texto principal                                         |
| `--color-text-muted`  | `140 140 155`          | Texto secundario                                        |
| `--color-border`      | `45 45 60`             | Bordes sutiles                                          |
| `--color-accent-from` | `132 87 233` (violeta) | Extremo inicial del gradiente de acento                 |
| `--color-accent-to`   | `50 110 209` (azul)    | Extremo final del gradiente de acento                   |
| `--color-accent-fg`   | `255 255 255`          | Texto/ícono sobre el gradiente de acento                |
| `--color-danger`      | `248 113 113`          | Sin cambio (ya es el valor que usaba el `.dark` actual) |
| `--color-success`     | `74 222 128`           | Sin cambio (ídem)                                       |

Los colores de región (`--color-region-*`, usados por `regionColorVar()` en las tarjetas de ejercicio) se mantienen sin cambios — ya son suficientemente saturados para funcionar sobre el nuevo fondo oscuro; no los toca este rediseño.

**Verificación de contraste (WCAG AA, ratio ≥ 4.5:1 para texto normal), calculada antes de fijar los valores:**

| Par                                       | Ratio   |
| ----------------------------------------- | ------- |
| `text` sobre `surface`                    | 17.81:1 |
| `text` sobre `surface-alt`                | 16.19:1 |
| `text-muted` sobre `surface`              | 5.84:1  |
| `text-muted` sobre `surface-alt`          | 5.31:1  |
| `accent-fg` sobre `accent-from` (violeta) | 4.64:1  |
| `accent-fg` sobre `accent-to` (azul)      | 4.90:1  |

Los valores de acento originales extraídos de la captura (violeta `139 92 246`, azul `59 130 246`) daban 4.23:1 y 3.68:1 respectivamente — el extremo azul fallaba AA para texto normal. Se oscurecieron ambos extremos (~5-15%) manteniendo el mismo tono hasta pasar el umbral.

## Componentes nuevos compartidos

Todos en `apps/web/components/ui/`, genéricos — no específicos de ejercicios, reusables en cualquier pantalla:

### `card.tsx`

```tsx
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-surface-alt p-4 ${className}`}>
      {children}
    </div>
  );
}
```

### `pill.tsx`

```tsx
export function Pill({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-muted ${className}`}
    >
      {children}
    </span>
  );
}
```

### `gradient-icon.tsx`

```tsx
import type { LucideIcon } from 'lucide-react';

export function GradientIcon({ icon: Icon, size = 24 }: { icon: LucideIcon; size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-full"
      style={{
        width: size * 1.8,
        height: size * 1.8,
        background:
          'linear-gradient(135deg, rgb(var(--color-accent-from)), rgb(var(--color-accent-to)))',
      }}
    >
      <Icon size={size} className="text-accent-fg" aria-hidden />
    </div>
  );
}
```

### `page-header.tsx`

```tsx
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-11">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-text"
          >
            <ArrowLeft size={22} aria-hidden />
          </button>
        )}
      </div>
      <h1 className="flex-1 text-center text-base font-semibold text-text">{title}</h1>
      <div className="min-w-11">{right}</div>
    </div>
  );
}
```

`onBack` es opcional: cuando se omite, no se renderiza la flecha pero el espacio (`min-w-11`) se reserva igual — así el título queda centrado tanto con flecha como sin ella.

## Dónde se aplica

- **`ExerciseCard`** (`components/exercise-card.tsx`, usado en `/catalogo`, `ExercisePicker`, y la lista de rutina del alumno): pasa a envolver con `<Card>`, thumbnail circular (`rounded-full`, hoy es `rounded-xl` cuadrada), badge de parte del cuerpo y equipamiento con `<Pill>` en vez del texto plano/badge actual. Sin ilustración muscular — mantiene la imagen real del ejercicio (`imageUrl`) con fallback a `<GradientIcon icon={Dumbbell} />` cuando no hay imagen (reemplaza el `<Dumbbell>` suelto actual).
- **`/alumno`** (`app/(alumno)/alumno/page.tsx`): agrega `<PageHeader title={rutina.nombre} />` **sin** `onBack` — es la home del alumno (primera pantalla tras loguearse, no hay una "anterior" dentro de la app), así que no lleva flecha de volver. Lista de ejercicios con `<Card>` + thumbnail circular + `<Pill>` por cada uno de series/repeticiones/peso/descanso en vez de la línea de texto plano actual (`{series} series × {repeticiones} reps — ...`).
- **`/profesor/alumnos/[id]`** (`instance-editor.tsx` + `components/routine-exercises-editor.tsx`): mismo estilo de lista (`Card` + thumbnail + `Pill`s) en las filas de `FilaEjercicio`, sin cambiar ninguna lógica (agregar/quitar/reordenar/guardar funcionan igual, drag handle de `dnd-kit` se mantiene).
- **`/catalogo`, `/catalogo/[id]`**: fondo/tarjetas/chips de filtro adoptan la paleta nueva; los chips de parte del cuerpo ya son `rounded-full`, quedan iguales en forma, cambian de color. El detalle de ejercicio (`<dl>`) pasa sus pares región/músculo/equipamiento a `<Pill>` en vez de texto plano.
- **`/admin`, `/login`**: misma paleta de fondo/tarjetas/botones; sin componentes nuevos específicos, solo las clases de color existentes (`bg-surface`, `text-text`, `border-border`, etc.) que ya heredan el cambio de tokens automáticamente.
- **Eliminar tema claro**: borrar `apps/web/components/theme-toggle.tsx`, su uso en `app/layout.tsx` (el `<div className="flex justify-end p-3"><ThemeToggle /></div>` y el `<script>` anti-flash de tema), la clase `darkMode: 'class'` de `tailwind.config.ts` (ya no hace falta, no hay alternancia), y el bloque `.dark { ... }` de `tokens.css`.

## Testing y verificación

- Build + lint de `apps/web` limpio en cada tanda de páginas migradas (no todo junto al final).
- Sin tests automatizados de estilo visual — no hay convención de screenshot-testing en este repo. Verificación manual: capturas reales del dev server corriendo, pantalla por pantalla, antes de pasar a la siguiente.
- Grep de usos de `ThemeToggle`/`.dark`/`darkMode` antes de borrar, para confirmar que no queda ninguna referencia rota.
- Los ratios de contraste de la tabla de arriba ya están verificados matemáticamente (WCAG AA) antes de fijar la paleta — no hace falta reverificar salvo que se ajusten los valores durante la implementación.
