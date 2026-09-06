import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
}

function buildReadOnlyClient() {
  const cookieStore = cookies();
  return createServerClient(
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
}

/**
 * Lee el access_token de la sesión actual desde las cookies — lectura
 * LOCAL, no valida el JWT acá (eso lo hace el backend). Nunca se
 * reimplementa la verificación del JWT del lado de Next.js.
 */
export async function getAccessToken(): Promise<string | null> {
  const session = await getStoredSession();
  return session?.accessToken ?? null;
}

/**
 * Igual que `getAccessToken`, pero también devuelve el refresh_token —
 * lo necesita cualquier código server-side que tenga que refrescar la
 * sesión (el proxy de fetches del cliente, por ejemplo). Nunca sale de
 * `apps/web`'s server-side code hacia el browser.
 */
export async function getStoredSession(): Promise<StoredSession | null> {
  const supabase = buildReadOnlyClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return null;
  }

  return { accessToken: session.access_token, refreshToken: session.refresh_token };
}
