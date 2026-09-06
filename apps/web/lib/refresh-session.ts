import { createWritableSupabaseServerClient } from './session-writable';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';

export interface RefreshedSession {
  accessToken: string;
  refreshToken: string;
}

/**
 * Llama a `POST /auth/refresh` del backend (nunca directo a Supabase: el
 * backend además valida que el `User` interno siga activo) y, si sale
 * bien, persiste la sesión nueva en cookies httpOnly. Devuelve `null` sin
 * lanzar ante cualquier falla — la decisión de qué hacer con un refresh
 * fallido (dejar pasar, redirigir con mensaje, etc.) es del llamador, no
 * de este helper.
 *
 * Server Actions/Route Handlers ÚNICAMENTE — usa `createWritableSupabaseServerClient`,
 * que a su vez requiere poder escribir cookies (ver esa nota ahí).
 */
export async function refreshSession(refreshToken: string): Promise<RefreshedSession | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const { accessToken, refreshToken: nuevoRefreshToken } = await response.json();

    const supabase = createWritableSupabaseServerClient();
    await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: nuevoRefreshToken,
    });

    return { accessToken, refreshToken: nuevoRefreshToken };
  } catch {
    return null;
  }
}
