process.env.API_BASE_URL = 'http://localhost:3001';

import { NextRequest } from 'next/server';
import { GET } from './route';
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
    const response = await GET(request, { params: { path: ['exercises'] } });

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
    const response = await GET(request, { params: { path: ['exercises'] } });

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
    const response = await GET(request, { params: { path: ['exercises'] } });

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
    const response = await GET(request, { params: { path: ['exercises'] } });

    expect(response.status).toBe(401);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
