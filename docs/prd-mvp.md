# App Gimnasio — PRD MVP

Complementa `architecture/hld-mvp.md`. Este documento define el **qué** (comportamiento, reglas de negocio, criterios de aceptación); el HLD define el **cómo** (stack, modelo de datos, capas).

## 1. Objetivo

Reemplazar la gestión manual (papel/WhatsApp) de rutinas de gimnasio entre profesor y alumno por una app donde el profesor arma y asigna rutinas, y el alumno las consulta con soporte visual (imagen + GIF animado) por ejercicio.

## 2. Alcance MVP (in/out explícito)

**Dentro de alcance:**
- Alta de usuarios (admin, profesor, alumno) dentro de un único gym
- Profesor arma rutinas (plantillas), las asigna a alumnos, cada asignación es editable independiente
- Alumno consulta su rutina vigente con detalle de ejercicio (imagen + GIF animado)
- Admin gestiona usuarios del gym

**Fuera de alcance (explícito, para no improvisar durante implementación):**
- Tracking de progreso (marcar set como completado, pesos/reps reales) → Fase 2
- Notificaciones (push/email) cuando se asigna o cambia una rutina → Fase 2
- Historial/versionado completo de plantillas → Fase 2
- Media custom subida por el profesor (arranca 100% con catálogo [exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset), ver §6 regla 6 sobre licencia de esa media) → Fase 2
- Multi-gym / onboarding self-service / panel super-admin → Fase 3
- Self-signup de alumnos (alta siempre manual por ADMIN o PROFESOR) → sin fecha, a evaluar si aplica alguna vez
- Pagos/cuotas del gym → no es objetivo de esta app

## 3. Decisión de modelo: plantilla → clon al asignar

Un profesor arma una `RoutineTemplate` como punto de partida (o arranca una `RoutineInstance` desde cero sin plantilla). Al asignar una plantilla a un alumno, el sistema clona sus ejercicios en una `RoutineInstance` propia de ese alumno. Desde ese momento la instancia es independiente: el profesor la sigue ajustando por alumno (series/reps/ejercicios) sin que eso afecte la plantilla original ni a otros alumnos que también la hayan recibido.

Esto es fiel a cómo trabaja un profesor en un gym convencional: arranca de una base común pero termina ajustando por capacidad/objetivo individual de cada alumno.

## 4. Actores

| Actor | Descripción |
|---|---|
| Admin | Dueño/gestor del gym. Da de alta profesores y alumnos. |
| Profesor | Arma plantillas, asigna y ajusta rutinas por alumno. |
| Alumno | Consulta su rutina vigente. |

**Asunción MVP:** cualquier profesor del gym ve y puede asignar rutinas a cualquier alumno del gym (no hay relación exclusiva profesor↔alumno todavía). Revisar si en la práctica hace falta restringir esto por "cartera de alumnos" de cada profesor.

## 5. Historias de usuario

### Admin

**HU-01 — Alta de profesor**
> Como Admin, quiero dar de alta un profesor con email y nombre, para que pueda loguearse y gestionar rutinas.
- Dado que estoy autenticado como Admin, cuando cargo email + nombre de un profesor nuevo, entonces se crea el usuario con rol PROFESOR scopeado a mi gym y recibe invitación de acceso.
- Dado un email ya registrado en mi gym, cuando intento darlo de alta de nuevo, entonces el sistema rechaza la operación con error claro.

**HU-02 — Alta de alumno**
> Como Admin, quiero dar de alta un alumno con email y nombre, para que pueda ver su rutina asignada.
- Mismos criterios que HU-01, con rol ALUMNO.

**HU-03 — Listado y baja de usuarios**
> Como Admin, quiero ver todos los profesores/alumnos de mi gym y poder desactivarlos, para mantener la base de usuarios al día.
- Dado un usuario desactivado, cuando intenta loguearse, entonces el acceso es rechazado.
- Un profesor desactivado conserva sus plantillas/instancias históricas (no se borran en cascada).

### Profesor

**HU-04 — Crear plantilla de rutina**
> Como Profesor, quiero armar una plantilla de rutina con una lista ordenada de ejercicios (series, repeticiones, descanso), para reutilizarla como base al asignar a distintos alumnos.
- Dado que agrego un ejercicio del catálogo a la plantilla, cuando completo series/repeticiones/descanso, entonces queda guardado en el orden que definí.
- Una plantilla sin ejercicios no puede asignarse (validación).

**HU-05 — Asignar rutina a alumno**
> Como Profesor, quiero asignar una plantilla (o armar una rutina desde cero) a un alumno específico, para que la vea en su dashboard.
- Dado un alumno con una rutina vigente, cuando le asigno una nueva, entonces la anterior pasa a histórica (`activa: false`) y la nueva queda vigente.
- Dado que asigno una plantilla, cuando se crea la instancia, entonces se clonan sus ejercicios y a partir de ahí son independientes de la plantilla.
- Solo puedo asignar alumnos de mi mismo gym (scoping por `gymId`).

**HU-06 — Ajustar rutina de un alumno puntual**
> Como Profesor, quiero modificar series/reps/ejercicios de la rutina vigente de un alumno en particular, para adaptarla a su progreso sin afectar a otros alumnos.
- Dado que edito la `RoutineInstance` de un alumno, cuando guardo cambios, entonces ningún otro alumno ni la plantilla original se ven afectados.

**HU-07 — Editar/desactivar plantilla**
> Como Profesor, quiero editar o desactivar una plantilla, para mantener mi catálogo de rutinas base ordenado.
- Editar una plantilla NO modifica instancias ya asignadas (están clonadas y desacopladas).
- Desactivar una plantilla la oculta del selector al asignar, pero no afecta instancias ya creadas a partir de ella.

### Alumno

**HU-08 — Ver rutina vigente**
> Como Alumno, quiero ver mi rutina vigente con la lista de ejercicios, series y repeticiones, para saber qué hacer en el gym.
- Dado que no tengo ninguna rutina asignada, cuando entro a mi dashboard, entonces veo un estado vacío claro ("todavía no tenés una rutina asignada"), no un error.

**HU-09 — Ver detalle de ejercicio**
> Como Alumno, quiero ver la imagen y/o el GIF animado de cada ejercicio de mi rutina, para ejecutarlo con la técnica correcta.
- El ejercicio expone `imageUrl` (imagen estática) y `gifUrl` (animación). Cuando hay `gifUrl`, se prioriza como demostración del movimiento; `imageUrl` actúa como fallback/ícono cuando no hay GIF disponible.
- Dado un ejercicio sin media disponible en el catálogo (ni `imageUrl` ni `gifUrl`, huecos posibles del dataset), cuando lo veo en mi rutina, entonces se muestra un ícono genérico de fallback, nunca un espacio roto.

## 6. Reglas de negocio (asunciones MVP documentadas — objetar si no aplican)

1. Un alumno tiene como máximo una `RoutineInstance` vigente a la vez.
2. Un usuario pertenece a un único gym; no hay usuarios compartidos entre gyms en el MVP.
3. Cualquier profesor puede asignar/editar rutinas de cualquier alumno de su gym (sin cartera exclusiva).
4. El alta de usuarios es siempre manual (Admin o Profesor), nunca self-signup.
5. Borrar un profesor/alumno es baja lógica (`activo: false`), nunca DELETE físico — preserva histórico.
6. El catálogo de ejercicios ([exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset), 1.324 ejercicios con imagen + GIF + instrucciones en español) es de solo lectura en el MVP; no hay UI para que el profesor suba ejercicios custom todavía (eso es Fase 2, aunque el modelo de datos ya lo soporta). **Gate de licencia:** la media (imágenes/GIFs) es © Gym Visual — redistribución permitida, pero uso comercial requiere licencia propia. No bloquea el MVP de un solo gym, pero es bloqueante antes de ofrecer la app como servicio pago a otros gimnasios (Fase 3): hay que auditar y reemplazar esa media o conseguir licencia comercial.

## 7. Métricas de éxito del MVP

- Un profesor puede armar y asignar una rutina completa a un alumno en menos de 5 minutos.
- Un alumno puede encontrar y entender un ejercicio de su rutina sin ayuda del profesor (autoservicio real vs. el papel/WhatsApp actual).
