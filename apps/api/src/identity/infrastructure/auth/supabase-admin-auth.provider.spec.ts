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

  it('expone los 5 métodos del AuthProviderPort', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
    const provider = new SupabaseAdminAuthProvider();
    expect(typeof provider.createStaffUser).toBe('function');
    expect(typeof provider.createAlumnoUser).toBe('function');
    expect(typeof provider.signInStaff).toBe('function');
    expect(typeof provider.signInAlumno).toBe('function');
    expect(typeof provider.deleteAuthUser).toBe('function');
  });
});
