import { SupabaseAdminAuthProvider } from './supabase-admin-auth.provider';

describe('SupabaseAdminAuthProvider', () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
    expect(() => new SupabaseAdminAuthProvider()).not.toThrow();
  });
});
