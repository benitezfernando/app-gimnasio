import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Lee el access_token de la sesión actual desde las cookies — lectura
 * LOCAL, no valida el JWT acá (eso lo hace el backend). Nunca se
 * reimplementa la verificación del JWT del lado de Next.js.
 */
export async function getAccessToken(): Promise<string | null> {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {
          // Server Components no pueden escribir cookies — no-op a propósito.
        },
        remove() {
          // Ídem set().
        },
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token ?? null;
}
