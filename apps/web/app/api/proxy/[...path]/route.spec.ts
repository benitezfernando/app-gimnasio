process.env.API_BASE_URL = 'http://localhost:3001';

import { NextRequest } from 'next/server';
import { GET, PUT } from './route';
import { getStoredSession } from '../../../../lib/session';
import { refreshSession } from '../../../../lib/refresh-session';

jest.mock('../../../../lib/session', () => ({
  getStoredSession: jest.fn(),
}));
jest.mock('../../../../lib/refresh-session', () => ({
  refreshSession: jest.fn(),
}));

const mockGetStoredSession = getStoredSession as jest.Mock;
const mockRefreshSession = refreshSession as jest.Mock;

describe('/api/proxy/[...path] (integración)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn();
  });

  it('sin sesión almacenada, devuelve 401 sin llegar a pegarle al backend', async () => {
    mockGetStoredSession.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/proxy/exercises');
    const response = await GET(request, { params: Promise.resolve({ path: ['exercises'] }) });

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('con access token válido, reenvía la request y devuelve la respuesta del backend tal cual', async () => {
    mockGetStoredSession.mockResolvedValue({
      accessToken: 'valid-token',
      refreshToken: 'refresh-token',
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const request = new NextRequest('http://localhost:3000/api/proxy/exercises?limit=2');
    const response = await GET(request, { params: Promise.resolve({ path: ['exercises'] }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/exercises?limit=2',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer valid-token' }),
      }),
    );
  });

  it('ante un 401 del backend, refresca y reintenta UNA vez, preservando la query string en ambos intentos', async () => {
    mockGetStoredSession.mockResolvedValue({
      accessToken: 'expired-token',
      refreshToken: 'refresh-token',
    });
    mockRefreshSession.mockResolvedValue({ accessToken: 'new-token' });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const request = new NextRequest('http://localhost:3000/api/proxy/exercises?limit=2&page=3');
    const response = await GET(request, { params: Promise.resolve({ path: ['exercises'] }) });

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    // Regresión del bug encontrado en el Bloque 2 (Task 9): la query string
    // se perdía en el reintento post-refresh — acá se verifica en AMBOS.
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/exercises?limit=2&page=3',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer expired-token' }),
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/exercises?limit=2&page=3',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer new-token' }),
      }),
    );
    expect(mockRefreshSession).toHaveBeenCalledWith('refresh-token');
  });

  it('si el refresh también falla, devuelve el 401 original al cliente sin reintentar', async () => {
    mockGetStoredSession.mockResolvedValue({
      accessToken: 'expired-token',
      refreshToken: 'refresh-token-invalido',
    });
    mockRefreshSession.mockResolvedValue(null);
    (global.fetch as jest.Mock).mockResolvedValueOnce(new Response(null, { status: 401 }));

    const request = new NextRequest('http://localhost:3000/api/proxy/exercises');
    const response = await GET(request, { params: Promise.resolve({ path: ['exercises'] }) });

    expect(response.status).toBe(401);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  // Regresión: el route handler no exportaba PUT — Next.js exige un export
  // nombrado por cada método HTTP, así que sin este export cualquier PUT a
  // /api/proxy/* devolvía 405 automáticamente SIN ejecutar nada del código
  // de acá (ni siquiera el mock de fetch se llamaba). Rompía en silencio
  // el ajuste de rutinas/plantillas existentes (browser-api-client PUT),
  // nunca detectado porque este archivo solo probaba GET. La importación
  // de PUT arriba ya es, por sí sola, un test de compilación: si el
  // export desaparece de nuevo, TypeScript no compila este archivo.
  it('PUT reenvía la request con el body al backend', async () => {
    mockGetStoredSession.mockResolvedValue({
      accessToken: 'valid-token',
      refreshToken: 'refresh-token',
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const request = new NextRequest(
      'http://localhost:3000/api/proxy/routine-instances/inst-1/exercises',
      { method: 'PUT', body: JSON.stringify({ ejercicios: [] }) },
    );
    const response = await PUT(request, {
      params: Promise.resolve({ path: ['routine-instances', 'inst-1', 'exercises'] }),
    });

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/routine-instances/inst-1/exercises',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ ejercicios: [] }),
        headers: expect.objectContaining({ Authorization: 'Bearer valid-token' }),
      }),
    );
  });
});
