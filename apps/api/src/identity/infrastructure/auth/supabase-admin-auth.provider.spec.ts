import { createClient } from '@supabase/supabase-js';
import { SupabaseAdminAuthProvider } from './supabase-admin-auth.provider';

// Mockeado en TODO el archivo: nunca queremos que un test golpee la red
// real de Supabase. Los tests de instanciación/existencia de métodos no
// necesitan un cliente funcional; los de `refreshSession` sí controlan
// `auth.refreshSession` directamente.
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

const mockCreateClient = createClient as jest.Mock;

describe('SupabaseAdminAuthProvider', () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
    mockCreateClient.mockReset();
    mockCreateClient.mockReturnValue({ auth: {} });
  });

  afterEach(() => {
    process.env.SUPABASE_URL = originalUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  it('lanza si falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY', () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => new SupabaseAdminAuthProvider()).toThrow();
  });

  it('se instancia sin error si ambas variables están presentes', () => {
    expect(() => new SupabaseAdminAuthProvider()).not.toThrow();
  });

  it('expone los 6 métodos del AuthProviderPort', () => {
    const provider = new SupabaseAdminAuthProvider();
    expect(typeof provider.createStaffUser).toBe('function');
    expect(typeof provider.createAlumnoUser).toBe('function');
    expect(typeof provider.signInStaff).toBe('function');
    expect(typeof provider.signInAlumno).toBe('function');
    expect(typeof provider.refreshSession).toBe('function');
    expect(typeof provider.deleteAuthUser).toBe('function');
  });

  describe('refreshSession — deduplicación de refresh_token concurrente', () => {
    function buildFakeClient(delayMs: number, authUserId = 'auth-1') {
      const refreshSession = jest.fn(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  data: {
                    session: { access_token: 'nuevo-access', refresh_token: 'nuevo-refresh' },
                    user: { id: authUserId },
                  },
                  error: null,
                }),
              delayMs,
            ),
          ),
      );
      return { client: { auth: { refreshSession } }, refreshSession };
    }

    it('dos llamadas concurrentes con el mismo refresh_token solo golpean Supabase una vez', async () => {
      const { client, refreshSession } = buildFakeClient(20);
      mockCreateClient.mockReturnValue(client);
      const provider = new SupabaseAdminAuthProvider();

      const [r1, r2] = await Promise.all([
        provider.refreshSession('mismo-token'),
        provider.refreshSession('mismo-token'),
      ]);

      expect(refreshSession).toHaveBeenCalledTimes(1);
      expect(r1).toEqual(r2);
      expect(r1).toEqual({
        accessToken: 'nuevo-access',
        refreshToken: 'nuevo-refresh',
        authUserId: 'auth-1',
      });
    });

    it('refresh_tokens distintos no se deduplican entre sí', async () => {
      const { client, refreshSession } = buildFakeClient(5);
      mockCreateClient.mockReturnValue(client);
      const provider = new SupabaseAdminAuthProvider();

      await Promise.all([provider.refreshSession('token-a'), provider.refreshSession('token-b')]);

      expect(refreshSession).toHaveBeenCalledTimes(2);
    });

    it('una vez resuelto un refresh, uno posterior con el mismo token vuelve a golpear Supabase', async () => {
      const { client, refreshSession } = buildFakeClient(1);
      mockCreateClient.mockReturnValue(client);
      const provider = new SupabaseAdminAuthProvider();

      await provider.refreshSession('mismo-token');
      await provider.refreshSession('mismo-token');

      expect(refreshSession).toHaveBeenCalledTimes(2);
    });

    it('un refresh fallido no deja la deduplicación trabada para el siguiente intento', async () => {
      const refreshSession = jest
        .fn()
        .mockResolvedValueOnce({ data: { session: null }, error: { message: 'invalid_grant' } })
        .mockResolvedValueOnce({
          data: { session: { access_token: 'ok', refresh_token: 'ok-2' }, user: { id: 'auth-1' } },
          error: null,
        });
      mockCreateClient.mockReturnValue({ auth: { refreshSession } });
      const provider = new SupabaseAdminAuthProvider();

      await expect(provider.refreshSession('token-x')).rejects.toThrow();
      await expect(provider.refreshSession('token-x')).resolves.toEqual({
        accessToken: 'ok',
        refreshToken: 'ok-2',
        authUserId: 'auth-1',
      });
      expect(refreshSession).toHaveBeenCalledTimes(2);
    });

    it('dos refresh concurrentes que fallan juntos propagan el mismo error a ambos llamadores', async () => {
      const { client, refreshSession } = (() => {
        const fn = jest.fn(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () => resolve({ data: { session: null }, error: { message: 'invalid_grant' } }),
                10,
              ),
            ),
        );
        return { client: { auth: { refreshSession: fn } }, refreshSession: fn };
      })();
      mockCreateClient.mockReturnValue(client);
      const provider = new SupabaseAdminAuthProvider();

      const resultados = await Promise.allSettled([
        provider.refreshSession('mismo-token'),
        provider.refreshSession('mismo-token'),
      ]);

      expect(refreshSession).toHaveBeenCalledTimes(1);
      expect(resultados[0].status).toBe('rejected');
      expect(resultados[1].status).toBe('rejected');
    });
  });
});
