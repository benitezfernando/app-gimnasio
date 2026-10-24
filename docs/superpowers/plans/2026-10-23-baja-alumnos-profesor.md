# Baja, reactivación y eliminación de alumnos por el profesor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El profesor desactiva, reactiva y elimina definitivamente a los alumnos de su cartera.

**Architecture:** Un helper compartido `resolverAlumnoGestionable` concentra la autorización (ADMIN sobre cualquier usuario de su gym salvo admins; PROFESOR solo sobre alumnos de su cartera) y lo usan los cuatro casos de uso. El impacto de eliminar suma datos de otros profesores. La web comparte el diálogo de eliminación entre Admin y profesor.

**Tech Stack:** NestJS + Prisma (jest, PGlite), Next.js (server actions).

**Spec:** `docs/superpowers/specs/2026-10-23-baja-alumnos-profesor-design.md`

## Global Constraints

- El profesor solo actúa sobre alumnos de su cartera; sobre otro usuario → "no encontrado"; alumno ajeno → `AlumnoNotInCarteraError`.
- Eliminar exige alumno inactivo (`UserNotInactiveError`) y mantiene la transacción actual.
- Alumno compartido: se permite, con aviso en la confirmación.
- Backend primero (Manual Deploy en Render), después la web.
- Commits solo con autorización del usuario.

---

### Task 1: Backend

- `UserRepositoryPort.reactivate(id)` + `PrismaUserRepository.reactivate`; agregar `reactivate: jest.fn(),` a los mocks de usuario de los specs existentes (una línea tras `deactivate: jest.fn(),`).
- `application/resolver-alumno-gestionable.ts` (+ spec): `resolverAlumnoGestionable(userRepository, carteraRepository, invocadoPor): Promise<UserRecord>` — rol ADMIN/PROFESOR o `InsufficientRoleError`; `resolveUserInGym`; objetivo ADMIN → `CannotTargetAdminError`; si invoca PROFESOR: objetivo no ALUMNO → `UserNotFoundError`, no en cartera → `AlumnoNotInCarteraError`.
- `DeactivateUserUseCase`, nuevo `ReactivateUserUseCase`, `DeleteUserPermanentlyUseCase`, `GetUserDeletionImpactUseCase`: usan el helper (constructores suman `CARTERA_REPOSITORY`). Impacto suma `otrosProfesores` e `instanciasDeOtrosProfesores`; `RoutinesCleanupPort.contarImpacto(userId, role, profesorInvocadoId?)` y su adapter.
- Controlador: `@Roles(ADMIN, PROFESOR)` en deactivate/deletion-impact/permanent y `PATCH :id/reactivate`; registrar `ReactivateUserUseCase` en `IdentityModule` y en los módulos de e2e que lo necesiten.
- PRD: HU-03, HU-03b/c, reglas 3 y 10.

### Task 2: Web

- Mover `DeletePermanentlyDialog` a `components/` (prop `onEliminar`), con aviso de otros profesores; Admin lo sigue usando.
- `profesor/actions.ts`: `deactivateAlumnoAction`, `reactivateAlumnoAction`, `deleteAlumnoPermanentlyAction`.
- `alumno-row.tsx`: Editar / Desactivar·Reactivar / Eliminar, confirmación al desactivar, botones en segunda línea en celular.

### Verificación

`pnpm test` + `npx tsc --noEmit` en api y web; prueba manual con el usuario.
