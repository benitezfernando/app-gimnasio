import { getAccessToken } from './session';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) {
    throw new ApiError(401, 'No hay sesión activa');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const cuerpo = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, cuerpo.message ?? 'Error de la API');
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
