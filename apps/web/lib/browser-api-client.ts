export class BrowserApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'BrowserApiError';
  }
}

/**
 * Fetch desde Client Components hacia `apps/api`, vía el proxy same-origin
 * `/api/proxy/*` (ver ese Route Handler) — nunca expone el access/refresh
 * token a JS del cliente. El proxy ya intenta un refresh + reintento ante
 * un 401 upstream; si acá llega un 401 es porque ESE refresh también
 * falló, así que corresponde mandar al login con un mensaje explícito, no
 * un bounce mudo.
 *
 * Nota: hoy ningún Client Component de esta app hace fetch directo a la
 * API (todo pasa por Server Components/Actions vía `lib/api-client.ts`) —
 * este wrapper queda listo para cuando la primera pantalla lo necesite.
 */
export async function browserApiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/proxy/${path.replace(/^\/+/, '')}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });

  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login?sessionExpired=1';
    }
    throw new BrowserApiError(401, 'Sesión expirada');
  }

  if (!response.ok) {
    const cuerpo = await response.json().catch(() => ({ message: response.statusText }));
    throw new BrowserApiError(response.status, cuerpo.message ?? 'Error de la API');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const texto = await response.text();
  if (!texto) {
    return null as T;
  }
  return JSON.parse(texto) as T;
}
