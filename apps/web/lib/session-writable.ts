import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Variante con escritura real de cookies — solo válida en Server
 * Actions/Route Handlers (Server Components no pueden setear cookies).
 * Se usa para persistir la sesión que devuelve `POST /auth/login` y
 * `POST /auth/refresh`.
 *
 * Hallazgo al implementar el refresh automático: `@supabase/ssr` guarda
 * TODO el objeto de sesión (access_token + refresh_token juntos, en un
 * único blob JSON partido en cookies si excede 4KB) bajo un mismo nombre
 * de cookie — no son dos cookies separadas. Su `DEFAULT_COOKIE_OPTIONS`
 * trae `httpOnly: false` (confirmado leyendo el código fuente instalado de
 * @supabase/ssr, en dist/.../utils/constants.js), es decir que tal
 * como estaba, la cookie con AMBOS tokens era legible por JS del cliente.
 * Decisión: forzar `httpOnly`/`secure`/`sameSite` acá, pisando lo que
 * venga en `options` — ninguna Client Component de esta app necesita leer
 * la cookie directamente (todo fetch pasa por acá o por Server
 * Components), así que no hay regresión funcional.
 */
export const OPCIONES_COOKIE_SEGURA = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
};

export function createWritableSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          cookieStore.set(name, value, { ...options, ...OPCIONES_COOKIE_SEGURA });
        },
        remove(name: string, options: Record<string, unknown>) {
          cookieStore.set(name, '', { ...options, ...OPCIONES_COOKIE_SEGURA, maxAge: 0 });
        },
      },
    },
  );
}
