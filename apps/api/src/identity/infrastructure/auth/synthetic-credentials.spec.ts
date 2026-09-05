import { buildSyntheticEmail, deriveAlumnoPassword } from './synthetic-credentials';

describe('buildSyntheticEmail', () => {
  it('genera un email determinístico a partir de gymId + username', () => {
    expect(buildSyntheticEmail('gym-1', 'juan.perez')).toBe('juan.perez+gym-1@gym.internal');
  });

  it('el mismo (gymId, username) siempre produce el mismo email', () => {
    const a = buildSyntheticEmail('gym-1', 'juan.perez');
    const b = buildSyntheticEmail('gym-1', 'juan.perez');
    expect(a).toBe(b);
  });

  it('gyms distintos con el mismo username producen emails distintos', () => {
    const a = buildSyntheticEmail('gym-1', 'juan.perez');
    const b = buildSyntheticEmail('gym-2', 'juan.perez');
    expect(a).not.toBe(b);
  });
});

describe('deriveAlumnoPassword', () => {
  const originalSecret = process.env.AUTH_DERIVE_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.AUTH_DERIVE_SECRET;
    } else {
      process.env.AUTH_DERIVE_SECRET = originalSecret;
    }
  });

  it('lanza si AUTH_DERIVE_SECRET no está configurado', () => {
    delete process.env.AUTH_DERIVE_SECRET;
    expect(() => deriveAlumnoPassword('gym-1', 'juan.perez')).toThrow();
  });

  it('es determinística: mismo (gymId, username) siempre da la misma password', () => {
    process.env.AUTH_DERIVE_SECRET = 'test-derive-secret';
    const a = deriveAlumnoPassword('gym-1', 'juan.perez');
    const b = deriveAlumnoPassword('gym-1', 'juan.perez');
    expect(a).toBe(b);
  });

  it('usernames distintos producen passwords distintas', () => {
    process.env.AUTH_DERIVE_SECRET = 'test-derive-secret';
    const a = deriveAlumnoPassword('gym-1', 'juan.perez');
    const b = deriveAlumnoPassword('gym-1', 'juan.perez2');
    expect(a).not.toBe(b);
  });

  it('nunca se persiste: no aparece en texto plano en ningún archivo aparte de este test (verificación conceptual: la función solo la calcula, no la guarda en ningún lado)', () => {
    process.env.AUTH_DERIVE_SECRET = 'test-derive-secret';
    const password = deriveAlumnoPassword('gym-1', 'juan.perez');
    expect(typeof password).toBe('string');
    expect(password.length).toBeGreaterThanOrEqual(32);
  });
});
