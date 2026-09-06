import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { OPCIONES_COOKIE_SEGURA } from './lib/session-writable';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const VENTANA_REFRESH_SEGUNDOS = 5 * 60;

/**
 * Decodifica el payload de un JWT SIN verificar la firma — a propósito:
 * esta es solo una lectura optimista para decidir si conviene refrescar
 * proactivamente. La verificación real (firma, exp, aud, iss) la hace
 * SIEMPRE el backend en `JwtAuthGuard`; si esta decodificación fallara o
 * mintiera, en el peor caso se pierde la chance de refrescar antes de
 * tiempo — nunca se otorga acceso en base a este resultado.
 */
function leerExpiracion(accessToken: string): number | null {
  try {
    const payloadBase64Url = accessToken.split('.')[1];
    const payloadBase64 = payloadBase64Url.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(payloadBase64)) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * Middleware Edge: en cada navegación a una ruta protegida, si el
 * access_token está por vencer (< 5 min), dispara un refresh proactivo
 * contra el backend ANTES de que la request siga — así una Server
 * Component nunca ve un token vencido a mitad de un render. No reemplaza
 * ninguna validación de seguridad: si el refresh falla o no hace falta,
 * la request sigue igual y las capas server-side (layouts) son las que
 * deciden si corresponde 401/403 → redirect a /login.
 *
 * No puede reusar `lib/session-writable.ts` (usa `next/headers`, que no
 * corre en el runtime Edge de Middleware) — acá el adapter de cookies se
 * ata a `NextRequest`/`NextResponse` directamente.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options, ...OPCIONES_COOKIE_SEGURA });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({
            name,
            value: '',
            ...options,
            ...OPCIONES_COOKIE_SEGURA,
            maxAge: 0,
          });
        },
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return response;
  }

  const exp = leerExpiracion(session.access_token);
  const segundosParaExpirar = exp !== null ? exp - Math.floor(Date.now() / 1000) : -1;

  if (segundosParaExpirar < VENTANA_REFRESH_SEGUNDOS) {
    try {
      const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refresh_token }),
      });

      if (refreshResponse.ok) {
        const { accessToken, refreshToken } = await refreshResponse.json();
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      }
      // Si falla (token ya inválido, backend caído), no cortamos la
      // navegación acá: la dejamos seguir con la sesión vieja — las capas
      // server-side la van a rechazar y redirigir a /login igual que si
      // este middleware no existiera.
    } catch {
      // Backend inalcanzable: no bloquear la navegación por esto.
    }
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/profesor/:path*', '/alumno/:path*'],
};
