# App Gimnasio — HLD MVP

**Estado:** Fase de diseño — decisiones de stack tomadas, pendiente scaffolding.
**Alcance MVP:** un solo gimnasio (el de Fer), pensado para escalar a multi-gym sin reescritura del modelo de datos.

## 1. Decisiones tomadas

| Decisión | Elección | Motivo |
|---|---|---|
| Frontend | Next.js (web responsive / PWA) | 1 codebase para 3 roles, deploy gratis en Vercel, instalable en el celu del alumno sin store |
| Backend | NestJS (monolito modular) | Ya es tu stack diario, capas domain/application/infra estrictas |
| DB + Auth + Storage | Supabase (Postgres) | Todo gratis y managed, Postgres real (exportable), Auth con roles, Storage para media |
| ORM | Prisma | ACID estricto, tipado, migraciones |
| Catálogo de ejercicios | [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) (1.324 ejercicios, JSON + imagen + GIF animado, instrucciones en español) | Reemplaza a Free Exercise DB (~800 ejercicios, solo imagen estática): más volumen, cumple el requisito de animación por ejercicio (PRD HU-09) e instrucciones nativas en es. **Ojo con la licencia** (ver nota abajo). |
| Mensajería/eventos | Ninguno por ahora | Kafka/RabbitMQ es over-engineering para este scope. Se agrega si aparece un caso real de integración async (ej. notificaciones push) |

**Pushback registrado:** no vamos con microservicios ni arquitectura event-driven en el MVP. Monolito modular con bounded contexts bien separados — la extracción a servicios queda barata el día que haga falta, pero hoy es puro overhead operativo para un gym.

**⚠️ Gate de licencia de media (bloqueante para monetización, no para el MVP de un solo gym):** la estructura/código de `exercises-dataset` es MIT, pero las imágenes y GIFs son © Gym Visual. Redistribución permitida, pero **uso comercial requiere licencia propia de Gym Visual**. Mientras la app se use solo para el gym de Fer, no aplica. **Antes de ofrecer la app como servicio pago a otros gimnasios (Fase 3, multi-gym) hay que auditar y reemplazar toda la media de origen Gym Visual** (o conseguir licencia comercial). Cada `Exercise` de catálogo lleva `licenciaMedia` y `atribucionMedia` en el modelo justamente para poder auditar esto en un query.

## 2. Arquitectura general

Monolito modular NestJS con capas estrictas por bounded context:

```
apps/
  api/                        # NestJS
    src/
      identity/                # users, roles, auth
        domain/
        application/
        infrastructure/
      routines/                # rutinas, asignación profesor→alumno
        domain/
        application/
        infrastructure/
      exercise-catalog/        # catálogo de ejercicios + media
        domain/
        application/
        infrastructure/
      shared-kernel/           # value objects comunes (GymId, UserId, etc.)
  web/                         # Next.js
    app/
      (admin)/
      (profesor)/
      (alumno)/
```

- `domain/`: entidades, value objects, invariantes. Sin dependencias de framework.
- `application/`: casos de uso (services), puertos (interfaces de repos).
- `infrastructure/`: adaptadores Prisma, controllers, guards, Supabase client.

Cada bounded context expone su propio módulo NestJS; comunicación entre contextos vía interfaces de application layer, no acceso directo a repos ajenos.

## 3. Bounded contexts

### Identity
- `User` (id, gymId, email, role: ADMIN | PROFESOR | ALUMNO, nombre)
- Auth vía Supabase Auth (JWT), guards de NestJS validan rol + gymId en cada request
- Un profesor/alumno pertenece a un único gym (`gymId` como tenant discriminator en toda entidad)

### ExerciseCatalog
- `Exercise` (id, nombre, categoria, grupoMuscular, gruposMuscularesSecundarios[], equipamiento, imageUrl, gifUrl, instrucciones [texto en español], fuente: 'catalog' | 'custom', licenciaMedia, atribucionMedia, gymId nullable)
- Seed inicial desde [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) (script idempotente, no corre como parte de la migración automática — ver Fase 0 §6)
- `licenciaMedia`/`atribucionMedia`: trackean que la media (imagen + GIF) es © Gym Visual, uso comercial requiere licencia propia — ver gate de licencia en §1. El código/estructura del dataset es MIT; la media no.
- `gymId: null` = ejercicio del catálogo global; `gymId` seteado = ejercicio custom subido por un profesor de ese gym (soporta el híbrido a futuro sin cambiar el modelo)

### Routines
Modelo **plantilla → clon al asignar** (decisión de producto, ver PRD §3): la plantilla es un punto de partida reusable; al asignarla se clona en una instancia propia del alumno, editable sin afectar la plantilla ni otras instancias.

- `RoutineTemplate` (id, gymId, profesorId, nombre, descripción, activa, createdAt)
- `RoutineTemplateExercise` (id, templateId, exerciseId, orden, series, repeticiones, descanso, notas)
- `RoutineInstance` (id, gymId, profesorId, alumnoId, nombre, origenTemplateId nullable, vigenteDesde, vigenteHasta nullable, activa) — `origenTemplateId` nullable porque el profesor puede armar una instancia desde cero sin partir de plantilla
- `RoutineInstanceExercise` (id, instanceId, exerciseId, orden, series, repeticiones, descanso, notas)
- Al asignar: `RoutineTemplateExercise[]` se clona 1:1 en `RoutineInstanceExercise[]` de la nueva `RoutineInstance`. A partir de ahí son independientes — editar la plantilla NO propaga a instancias ya asignadas, y editar una instancia NO afecta a otros alumnos.
- **Asunción MVP:** un alumno tiene una única `RoutineInstance` vigente (`activa: true`) a la vez. Al asignar una nueva, la anterior pasa a histórica (`activa: false`, `vigenteHasta` = ahora). Ver PRD para reglas de negocio completas.

## 4. Roles y autorización

| Rol | Puede |
|---|---|
| ADMIN | CRUD de profesores/alumnos del gym, ver todo, futura config multi-gym |
| PROFESOR | CRUD de rutinas propias, asignar/reasignar a alumnos de su gym, ver progreso (fase 2) |
| ALUMNO | Ver su rutina vigente, ver detalle de cada ejercicio (imagen + GIF animado) |

Scoping por `gymId` en cada query de repo — nunca confiar en el filtro del frontend.

## 5. Stack técnico

- **Frontend:** Next.js 14+ (App Router), Tailwind, componentes por rol en route groups `(admin)`, `(profesor)`, `(alumno)`
- **Backend:** NestJS + Prisma + class-validator + Passport (JWT de Supabase)
- **DB:** Supabase Postgres (free tier: 500MB, pausa por inactividad en free tier — a monitorear)
- **Storage:** Supabase Storage (para media custom que suban los profesores a futuro)
- **Auth:** Supabase Auth (email/password para arrancar; social login queda para después)
- **Deploy:** Vercel (frontend) + Railway o Render free tier (API NestJS) — a definir cuál de los dos al momento de deployar
- **Repo:** monorepo simple con pnpm workspaces (no NX completo — es innecesario para 2 apps; si esto crece a multi-gym con más servicios, se migra a NX como en point-api)

## 6. Roadmap por fases

**Fase 0 — Scaffolding**
- Monorepo pnpm workspaces, apps `api` + `web`
- Setup Supabase (proyecto, schema inicial, Auth)
- Prisma schema con las 3 entidades core + seed de [exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset)

**Fase 1 — MVP funcional**
- Auth + roles funcionando end-to-end
- Admin: alta de profesores/alumnos
- Profesor: crear rutina, asignar a alumno, editar
- Alumno: ver rutina vigente con detalle de ejercicio (imagen + GIF animado; `imageUrl` sirve de fallback/ícono cuando no hay `gifUrl`)

**Fase 2 — Calidad de vida**
- Historial de rutinas, versionado
- Progreso del alumno (marcar ejercicio completado, series/reps reales vs planificadas)
- Media custom subida por el profesor (reemplaza catálogo genérico)

**Fase 3 — Multi-gym**
- Onboarding self-service de gyms nuevos
- Panel de super-admin (por encima de `ADMIN` de gym) para gestionar tenants
- Evaluar si en ese punto migra de Supabase free a un plan pago o a infra propia (AWS, alineado a tu stack)

## 7. Próximos pasos concretos

1. Scaffolding del monorepo (pnpm workspaces + NestJS + Next.js)
2. Proyecto Supabase + schema Prisma inicial
3. Script de import del catálogo [exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) (idempotente, corre a demanda — no en la migración automática)
4. Auth end-to-end con los 3 roles
