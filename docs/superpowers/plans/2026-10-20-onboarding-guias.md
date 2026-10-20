# Guías de bienvenida — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guías de globos por pantalla (solo la primera vez, por usuario y navegador) para alumno y profesor, y quitar el catálogo completo al alumno.

**Architecture:** Lógica pura en `lib/guias.ts` (claves, localStorage tolerante a fallas, filtrado de pasos y elección de guía) testeada con jest; un componente cliente `GuiaDePantalla` que la usa con `driver.js`; contenidos en `lib/guias-contenido.ts`; elementos marcados con `data-guia`.

**Tech Stack:** Next.js App Router, driver.js 1.x, jest.

**Spec:** `docs/superpowers/specs/2026-10-20-onboarding-guias-design.md`

## Global Constraints

- Solo `apps/web`; sin cambios de backend ni deploy en Render.
- Clave localStorage: `guia:<userId>:<guiaId>`. Si localStorage falla → no se muestra la guía.
- Textos exactamente los de la spec, sección "Contenido".
- Commits solo con autorización del usuario.

---

### Task 1: `lib/guias.ts` (TDD)

- Create `lib/guias.ts` exportando `PasoGuia`, `Guia`, `AlmacenGuias` (`getItem`/`setItem`), `claveGuia`, `guiaVista`, `marcarGuiaVista`, `pasosVisibles(pasos, buscar)`, `siguienteGuia(guias, estaVista, visibles)`.
- Test `lib/guias.spec.ts`: clave; vista/no vista; storage que lanza → vista `true` y `marcar` no lanza; `pasosVisibles` conserva centrados y descarta sin elemento; `siguienteGuia` saltea vistas y sin pasos visibles, `null` si no queda ninguna.

### Task 2: componente y estilos

- `pnpm add driver.js` en `apps/web`.
- `components/guia-de-pantalla.tsx` ('use client'): props `userId`, `guias`. Tras 600 ms elige `siguienteGuia` con `window.localStorage` y un `buscar` que devuelve el primer `[data-guia="x"]` con `getClientRects().length > 0`; corre `driver()` con `showProgress`, `progressText: '{{current}} de {{total}}'`, botones en español, `popoverClass: 'guia-popover'`; `onDestroyed` → `marcarGuiaVista` y pasa a la siguiente guía.
- `lib/guias-contenido.ts`: `GUIA_ALUMNO_RUTINA`, `GUIA_CATALOGO`, `GUIA_PROFESOR_CARTERA`, `GUIA_PROFESOR_PLANTILLAS`, `GUIA_EDITOR_RUTINA`, `GUIA_PROFESOR_ALUMNO` con los textos de la spec.
- `globals.css`: estilos `.guia-popover` sobre las variables del tema; importar `driver.js/dist/driver.css`.

### Task 3: marcar elementos y montar guías

- `data-guia`: `dias-rutina` (selector-de-dias), `ejercicio-rutina` (lista-ejercicios-del-dia), `catalogo-buscador`/`catalogo-filtros`/`catalogo-tarjeta` (catalogo-cliente), `nuevo-alumno` (create-alumno-form), `alumno-fila` (alumno-row), `nav-<último segmento del href>` (sidebar y bottom-nav), `nueva-plantilla` (create-template-form), `plantilla-fila` (plantillas/page), `editor-dias`/`editor-guardar` (routine-days-editor), `editor-buscador` (exercise-picker), `editor-imagen`/`editor-renombrar`/`editor-valores`/`editor-arrastrar` (day-exercises-list), `asignar-rutina` (reemplazar-rutina-section).
- Montar `<GuiaDePantalla userId=… guias=[…] />` en: `/alumno` (ambas ramas), `/catalogo`, `/profesor`, `/profesor/plantillas`, `/profesor/plantillas/[id]` (`editor-rutina`), `/profesor/alumnos/[id]` (`editor-rutina`, `profesor-alumno`). `userId` de `getCurrentUser()` (memoizado).

### Task 4: alumno sin catálogo

- `ALUMNO_NAV_ITEMS` = solo Rutina.
- `app/(catalogo)/layout.tsx`: `ALUMNO` → `redirect('/alumno')`.

### Verificación

`npx tsc --noEmit && pnpm test && pnpm build`; prueba manual con el usuario según la spec.
