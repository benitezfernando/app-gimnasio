import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Variante con escritura real de cookies — solo válida en Server
 * Actions/Route Handlers (Server Components no pueden setear cookies).
 * Se usa para persistir la sesión que devuelve `POST /auth/login`.
 */
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
          cookieStore.set(name, value, options);
        },
        remove(name: string, options: Record<string, unknown>) {
          cookieStore.set(name, '', { ...options, maxAge: 0 });
        },
      },
    },
  );
}
