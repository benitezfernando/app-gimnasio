import { NextRequest, NextResponse } from 'next/server';
import { getStoredSession } from '../../../../lib/session';
import { refreshSession } from '../../../../lib/refresh-session';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
const METODOS_CON_BODY = new Set(['POST', 'PATCH', 'PUT']);

/**
 * Proxy same-origin entre Client Components y `apps/api`. Existe para que
 * el access/refresh token NUNCA lleguen al JS del browser (viven en
 * cookies httpOnly, ver `lib/session-writable.ts`): un Client Component no
 * puede armar un header `Authorization` porque no puede leer el token, así
 * que en cambio pega acá (mismo origen, la cookie httpOnly viaja sola) y
 * este Route Handler —que sí corre server-side y puede leer la cookie—
 * arma el request real hacia el backend.
 *
 * Acá vive el interceptor de 401 pedido: ante un 401 del backend, intenta
 * UN refresh y reintenta la request original una sola vez. Si ese segundo
 * intento también da 401, se lo devuelve tal cual al cliente — ahí
 * `lib/browser-api-client.ts` interpreta ese 401 (ya post-refresh-fallido)
 * como sesión expirada de verdad y redirige a /login con mensaje.
 */
async function forward(
  path: string[],
  method: string,
  accessToken: string | null,
  body: string | undefined,
): Promise<Response> {
  return fetch(`${API_BASE_URL}/${path.join('/')}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(body !== undefined ? { body } : {}),
    cache: 'no-store',
  });
}

async function handler(
  request: NextRequest,
  { params }: { params: { path: string[] } },
): Promise<NextResponse> {
  const session = await getStoredSession();
  if (!session) {
    return NextResponse.json({ message: 'No hay sesión activa' }, { status: 401 });
  }

  const body = METODOS_CON_BODY.has(request.method) ? await request.text() : undefined;

  let upstream = await forward(params.path, request.method, session.accessToken, body);

  if (upstream.status === 401) {
    const refreshed = await refreshSession(session.refreshToken);
    if (refreshed) {
      upstream = await forward(params.path, request.method, refreshed.accessToken, body);
    }
  }

  const cuerpo = await upstream.text();
  return new NextResponse(cuerpo, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  });
}

export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
