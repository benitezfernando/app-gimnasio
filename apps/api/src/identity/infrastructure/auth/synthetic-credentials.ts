import { createHmac } from 'node:crypto';

const DOMINIO_EMAIL_SINTETICO = 'gym.internal';
const SEPARADOR_EMAIL_SINTETICO = '+';

/**
 * Supabase Auth exige nativamente email o teléfono como identificador.
 * Este email sintético NUNCA se expone al frontend ni se comunica a
 * nadie — vive exclusivamente acá, con el mismo nivel de encapsulamiento
 * que el service_role key. Determinístico: mismo (gymId, username)
 * siempre produce el mismo email.
 *
 * INVARIANTE (no validado acá — responsabilidad del DTO/caso de uso que
 * genera o recibe `username`): no debe contener `@`, `+` ni `:`. Los
 * usernames autogenerados de alumno ya cumplen esto por construcción
 * (`CreateUserUseCase.normalizar` solo deja `[a-z0-9.]`); los de
 * profesor, al venir de un input de cliente, deben validarse con esa
 * misma restricción en su DTO (`CreateProfesorDto`) antes de llegar acá.
 */
export function buildSyntheticEmail(gymId: string, username: string): string {
  return `${username}${SEPARADOR_EMAIL_SINTETICO}${gymId}@${DOMINIO_EMAIL_SINTETICO}`;
}

/**
 * Password derivada determinística para alumnos: HMAC-SHA256 con un
 * secret propio (`AUTH_DERIVE_SECRET`, distinto del JWT secret de
 * Supabase). Nunca se persiste — se recalcula en cada alta y cada login.
 *
 * INVARIANTE: el input combina `gymId` y `username` con `:` como
 * separador — ambos deben estar libres de `:` para que el par
 * (gymId, username) sea inequívoco (ver nota de `buildSyntheticEmail`).
 * `gymId` es siempre un UUID generado por el sistema, nunca input de
 * cliente, así que el riesgo real está acotado a `username`.
 */
export function deriveAlumnoPassword(gymId: string, username: string): string {
  const secret = process.env.AUTH_DERIVE_SECRET;
  if (!secret) {
    throw new Error('AUTH_DERIVE_SECRET no está configurado en el servidor');
  }
  return createHmac('sha256', secret).update(`${gymId}:${username}`).digest('hex');
}
