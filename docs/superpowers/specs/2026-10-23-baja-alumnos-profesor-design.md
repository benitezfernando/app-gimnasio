# Baja, reactivación y eliminación de alumnos por el profesor — Diseño

## Objetivo

Que un PROFESOR pueda **desactivar**, **reactivar** y **eliminar definitivamente**
a los alumnos de su cartera, sin depender del Admin. Hoy esas tres acciones son
solo ADMIN (PRD HU-03, HU-03c, reglas 3 y 10), y "reactivar" nunca se implementó
aunque el PRD dice que la baja es reversible.

## Decisiones (aprobadas)

1. El profesor actúa **solo sobre alumnos de su cartera**; sobre cualquier otro
   usuario el API responde "no encontrado" (mismo criterio que `EditUserUseCase`).
2. **Alumno compartido** (con más de un profesor): se permite igual. La
   confirmación avisa cuántos otros profesores se ven afectados y cuántas
   rutinas de ellos se pierden al eliminar.
3. **Reactivar:** el profesor puede reactivar a sus alumnos. El Admin lo gana en
   el backend, **sin botón nuevo** en su panel por ahora.
4. **Eliminar** mantiene las reglas actuales: solo sobre un alumno ya
   desactivado, con diálogo de impacto previo, en una sola transacción, y borra
   también la cuenta en Supabase Auth.
5. Fuera de alcance: botón "Reactivar" en el panel del Admin; que el profesor dé
   de baja o elimine profesores.

## Backend (`apps/api`)

- **`DeactivateUserUseCase`:** acepta ADMIN y PROFESOR. Si invoca un PROFESOR:
  el objetivo debe ser ALUMNO y estar en su cartera (`CarteraRepositoryPort.existe`);
  si no es ALUMNO → `UserNotFoundError`, si no está en su cartera →
  `AlumnoNotInCarteraError`. El Admin conserva su comportamiento.
- **`ReactivateUserUseCase` (nuevo):** mismas reglas de autorización que
  desactivar; pone `activo: true`. `UserRepositoryPort.reactivate(id)`.
  Endpoint `PATCH /users/:id/reactivate`, `@Roles(ADMIN, PROFESOR)`.
- **`DeleteUserPermanentlyUseCase`:** acepta ADMIN y PROFESOR (mismo control de
  cartera para el profesor); mantiene `UserNotInactiveError` y la transacción.
- **`GetUserDeletionImpactUseCase`:** acepta ADMIN y PROFESOR (mismo control).
  La respuesta suma `otrosProfesores: number` (profesores del alumno distintos
  del invocador; 0 para Admin y para profesores) e
  `instanciasDeOtrosProfesores: number` (rutinas del alumno armadas por otros
  profesores; solo se calcula cuando invoca un PROFESOR y el objetivo es
  ALUMNO). Para ello `RoutinesCleanupPort.contarImpacto` recibe un tercer
  parámetro opcional `profesorInvocadoId`.
- **Controlador:** `@Roles` de `deactivate`, `deletion-impact` y `permanent`
  pasan a `(ADMIN, PROFESOR)`.
- **Listado de cartera:** sin cambios (ya incluye alumnos inactivos).

## Frontend (`apps/web`)

- **`alumno-row.tsx`:** botones **Editar**, **Desactivar** (alumno activo) /
  **Reactivar** (inactivo) y **Eliminar**. La pill "Inactivo" ya existe.
  **Eliminar** está deshabilitado mientras el alumno esté activo ("Desactivalo
  primero"), igual que en el panel del Admin. En celular los botones van en una
  segunda línea bajo el nombre.
- **Desactivar:** confirmación (`useConfirm`): "{nombre} no va a poder ingresar.
  Si tiene otros profesores, tampoco van a poder trabajar con él. Podés
  reactivarlo cuando quieras."
- **Eliminar:** `DeletePermanentlyDialog` se mueve a `components/` como
  componente compartido con Admin y profesor. Recibe la acción de eliminar por
  prop. Muestra el impacto y, si `otrosProfesores > 0`, un aviso destacado:
  "Este alumno también tiene {n} profesor(es) más. Se pierden {m} rutina(s)
  armada(s) por ellos."
- **Server actions del profesor** (`profesor/actions.ts`): `deactivateAlumnoAction`,
  `reactivateAlumnoAction`, `deleteAlumnoPermanentlyAction`; llaman a los mismos
  endpoints y hacen `revalidatePath('/profesor')`.
- **Guía de bienvenida:** sin cambios.

## PRD

Actualizar HU-03, HU-03b/c y las reglas 3 y 10: el profesor puede dar de baja,
reactivar y eliminar a los alumnos de su cartera; reactivar es `activo: true`.

## Pruebas

- Casos de uso: profesor sobre alumno de su cartera (permitido); sobre alumno
  ajeno (`AlumnoNotInCarteraError`); sobre profesor/admin (`UserNotFoundError`);
  alumno activo no se elimina; el impacto cuenta otros profesores y sus rutinas;
  el Admin conserva todo.
- E2E/controlador: PROFESOR permitido y ALUMNO rechazado en los cuatro
  endpoints.
- Integración (PGlite): `contarImpacto` con `profesorInvocadoId`.
- Manual: fila de cartera, confirmaciones, aviso de alumno compartido, reactivar.

## Salida a producción

Hay cambios de backend: push, **Manual Deploy en Render**, y recién después el
deploy de la web (si sale antes, los botones nuevos fallarían con 403 hasta que
Render termine).
