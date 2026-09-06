# App Gimnasio — PRD MVP

Complementa `docs/hld-mvp.md`. Este documento define el **qué** (comportamiento, reglas de negocio, criterios de aceptación); el HLD define el **cómo** (stack, modelo de datos, capas).

## 1. Objetivo

Reemplazar la gestión manual (papel/WhatsApp) de rutinas de gimnasio entre profesor y alumno por una app donde el profesor arma y asigna rutinas, y el alumno las consulta con soporte visual (imagen + GIF animado) por ejercicio.

## 2. Alcance MVP (in/out explícito)

**Dentro de alcance:**

- Alta de usuarios (admin, profesor, alumno) dentro de un único gym
- Gestión de la cartera profesor↔alumno por parte del Admin
- Profesor arma rutinas (plantillas), las asigna a alumnos de su cartera, cada asignación es editable independiente
- Alumno consulta su rutina vigente con detalle de ejercicio (imagen + GIF animado)
- Admin gestiona usuarios del gym

**Fuera de alcance (explícito, para no improvisar durante implementación):**

- Tracking de progreso (marcar set como completado, pesos/reps reales) → Fase 2
- Notificaciones (push/email) cuando se asigna o cambia una rutina → Fase 2
- Historial/versionado completo de plantillas → Fase 2
- Media custom subida por el profesor (arranca 100% con el catálogo [exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset), GIF + imagen, ver §6 regla 6 sobre licencia de esa media) → Fase 2
- Multi-gym / onboarding self-service / panel super-admin → Fase 3
- Self-signup de alumnos (alta siempre manual por ADMIN o PROFESOR) → sin fecha, a evaluar si aplica alguna vez
- Pagos/cuotas del gym → no es objetivo de esta app

## 3. Decisión de modelo: plantilla → clon al asignar

Un profesor arma una `RoutineTemplate` como punto de partida (o arranca una `RoutineInstance` desde cero sin plantilla). Al asignar una plantilla a un alumno, el sistema clona sus ejercicios en una `RoutineInstance` propia de ese alumno. Desde ese momento la instancia es independiente: el profesor la sigue ajustando por alumno (series/reps/ejercicios) sin que eso afecte la plantilla original ni a otros alumnos que también la hayan recibido.

Esto es fiel a cómo trabaja un profesor en un gym convencional: arranca de una base común pero termina ajustando por capacidad/objetivo individual de cada alumno.

## 4. Actores

| Actor    | Descripción                                                                                   |
| -------- | --------------------------------------------------------------------------------------------- |
| Admin    | Dueño/gestor del gym. Da de alta profesores y alumnos, y gestiona la cartera profesor↔alumno. |
| Profesor | Arma plantillas, asigna y ajusta rutinas de los alumnos de su cartera.                        |
| Alumno   | Consulta su rutina vigente. Puede tener más de un profesor asignado.                          |

**Confirmado con el profesor real (ya no es asunción):** cada alumno tiene su/sus profesor(es) asignado(s) — no cualquier profesor del gym puede ver o tocar la rutina de cualquier alumno. Un alumno puede tener más de un profesor a la vez (relación muchos-a-muchos, no 1 a 1). Ver §6 regla 9 y el modelo `ProfesorAlumno` en el HLD.

## 5. Historias de usuario

### Admin

**HU-01 — Alta de profesor**

> Como Admin, quiero dar de alta un profesor con username, nombre y una password inicial, para entregársela en persona y que pueda loguearse.

- Dado que estoy autenticado como Admin, cuando cargo username + nombre + password inicial de un profesor nuevo, entonces se crea el usuario con rol PROFESOR scopeado a mi gym. **No se envía ningún email ni notificación** — la password se la comunico yo directamente (en persona, WhatsApp, como prefiera).
- Dado un username ya registrado en mi gym, cuando intento darlo de alta de nuevo, entonces el sistema rechaza la operación con error claro (409).
- El username es único dentro de mi gym, no globalmente — otro gym puede tener un usuario con el mismo username.

**HU-02 — Alta de alumno**

> Como Admin o Profesor, quiero dar de alta un alumno con solo su nombre, para que el sistema le genere un username y pueda acceder sin necesidad de definir ni comunicar una password.

- Dado que cargo nombre y apellido de un alumno nuevo, cuando lo confirmo, entonces el sistema genera un `username` (`nombre.apellido`, con sufijo numérico si ya existe otro igual en mi gym) y crea el usuario con rol ALUMNO — **sin pedirme ninguna password**.
- El alumno se loguea solo con su `username`, sin password (ver regla de negocio 8). Riesgo aceptado explícitamente: no hay barrera real más allá de que otra persona sepa su nombre — ver HLD §3 Identity.
- Un Profesor puede dar de alta alumnos pero nunca profesores ni admins (ver regla de negocio 7).
- **Cartera automática:** si quien da de alta al alumno es un PROFESOR, ese alumno queda automáticamente en su cartera (regla de negocio 9). Si quien lo da de alta es el ADMIN, el alumno no queda asignado a ningún profesor todavía — hace falta HU-03b para eso.

**HU-03 — Listado y baja de usuarios**

> Como Admin, quiero ver todos los profesores/alumnos de mi gym y poder desactivarlos, para mantener la base de usuarios al día.

- Dado un usuario desactivado, cuando intenta loguearse, entonces el acceso es rechazado.
- Un profesor desactivado conserva sus plantillas/instancias históricas (no se borran en cascada), y sus asignaciones de cartera quedan registradas (no se borran), aunque ya no pueda operar sobre ellas.

**HU-03b — Gestión de cartera (asignar/quitar profesor de un alumno)**

> Como Admin, quiero asignar uno o más profesores a un alumno, y quitarle un profesor si hace falta, para reflejar cómo se organiza la atención en el gym.

- Dado un alumno sin profesor asignado (por ejemplo, dado de alta por el Admin), cuando le asigno uno o más profesores, entonces esos profesores pasan a ver y poder tocar la rutina de ese alumno.
- Un alumno puede tener más de un profesor asignado simultáneamente (relación muchos-a-muchos, no exclusiva).
- Quitarle un profesor a un alumno no borra las `RoutineInstance` que ese profesor ya le había asignado — quedan como estaban, solo que ese profesor deja de poder verlas/editarlas.
- Un Profesor **no** puede auto-asignarse un alumno que no es suyo, ni asignarle otro profesor a un alumno de su propia cartera — esto es exclusivo de ADMIN.

### Profesor

**HU-04 — Crear plantilla de rutina**

> Como Profesor, quiero armar una plantilla de rutina con una lista ordenada de ejercicios (series, repeticiones, descanso), para reutilizarla como base al asignar a distintos alumnos.

- Dado que agrego un ejercicio del catálogo a la plantilla, cuando completo series/repeticiones/descanso, entonces queda guardado en el orden que definí.
- Una plantilla sin ejercicios no puede asignarse (validación).

**HU-05 — Asignar rutina a alumno**

> Como Profesor, quiero asignar una plantilla (o armar una rutina desde cero) a un alumno específico, para que la vea en su dashboard.

- Dado un alumno con una rutina vigente, cuando le asigno una nueva, entonces la anterior pasa a histórica (`activa: false`) y la nueva queda vigente.
- Dado que asigno una plantilla, cuando se crea la instancia, entonces se clonan sus ejercicios y a partir de ahí son independientes de la plantilla.
- **Solo puedo asignar rutina a alumnos de mi cartera** (regla de negocio 9) — no a cualquier alumno de mi gym. Si intento asignar a un alumno que no es mío, la operación se rechaza (403), sin importar que pertenezca a mi mismo gym.

**HU-06 — Ajustar rutina de un alumno puntual**

> Como Profesor, quiero modificar series/reps/ejercicios de la rutina vigente de un alumno en particular, para adaptarla a su progreso sin afectar a otros alumnos.

- Dado que edito la `RoutineInstance` de un alumno, cuando guardo cambios, entonces ningún otro alumno ni la plantilla original se ven afectados.
- **Solo puedo ver/editar rutinas de alumnos de mi cartera.** Si el alumno tiene más de un profesor asignado, cualquiera de ellos puede ver y editar su rutina vigente — no hay "dueño único" de la instancia más allá de quién la creó originalmente.

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
3. Borrar un profesor/alumno es baja lógica (`activo: false`), nunca DELETE físico — preserva histórico.
4. El alta de usuarios es siempre manual (Admin o Profesor) y 100% sin email: la app no manda ni pide mails a nadie, ni para alta ni para notificaciones. La password inicial la define quien da de alta y se comunica en persona.
5. El catálogo de ejercicios ([exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset), 1.324 ejercicios con imagen + GIF + instrucciones en español, © Gym Visual) es de solo lectura en el MVP; no hay UI para que el profesor suba ejercicios custom todavía (eso es Fase 2, aunque el modelo de datos ya lo soporta).
6. **Gate de licencia antes de Fase 3 (multi-gym comercial):** la media del catálogo (GIFs/imágenes) es de Gym Visual con permiso de redistribución pero uso comercial sujeto a licencia propia. Antes de ofrecer la app como servicio pago a otros gimnasios, auditar y reemplazar la media por: licencia comercial comprada, dataset con licencia libre (ej. Free Exercise DB, solo imagen), o contenido propio grabado por cada profesor.
7. Quién puede invitar a quién: ADMIN puede crear PROFESOR o ALUMNO; PROFESOR solo puede crear ALUMNO. Nadie puede auto-asignarse un rol ni crear uno igual o mayor al propio salvo ADMIN.
8. **Password diferenciada por rol (riesgo aceptado explícitamente por Fernando):** ADMIN y PROFESOR tienen username + password real, definida por quien los crea. ALUMNO tiene solo username (legible, `nombre.apellido`), sin password real — el username funciona de hecho como el único secreto de la cuenta. Se acepta este riesgo porque el alumno solo tiene acceso de lectura a su propia rutina, sin datos sensibles de por medio. Mitigación mínima: rate-limit del endpoint de login por IP/username.
9. **Cartera profesor↔alumno (confirmado con el profesor real, ya no es asunción):** cada alumno tiene uno o más profesores asignados explícitamente — no es una relación exclusiva 1 a 1, un alumno puede tener varios profesores a la vez. Un PROFESOR solo puede ver, asignar o editar rutinas (`RoutineTemplate` es propia del profesor; `RoutineInstance` requiere estar en la cartera del alumno) de los alumnos de su cartera — nunca de un alumno ajeno, aunque sea del mismo gym. Solo ADMIN gestiona la cartera (asignar/quitar profesores de un alumno, HU-03b). Si un PROFESOR da de alta a un alumno, ese alumno entra automáticamente en su cartera; si lo da de alta el ADMIN, no queda asignado a nadie hasta que el ADMIN lo asigne explícitamente.

## 7. Métricas de éxito del MVP

- Un profesor puede armar y asignar una rutina completa a un alumno en menos de 5 minutos.
- Un alumno puede encontrar y entender un ejercicio de su rutina sin ayuda del profesor (autoservicio real vs. el papel/WhatsApp actual).
