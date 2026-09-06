import {
  SignJWT,
  exportJWK,
  generateKeyPair,
  createLocalJWKSet,
  type JWTVerifyGetKey,
  type KeyLike,
} from 'jose';

/**
 * Soporte compartido para testear `JwtAuthGuard` sin red: genera un par de
 * claves ES256 de prueba y arma un JWKS LOCAL (`createLocalJWKSet`) con la
 * public key — se inyecta mockeando `createRemoteJWKSet` de `jose` (eso sí,
 * cada spec tiene que declarar su propio `jest.mock('jose', ...)`, jest no
 * permite hoistear una referencia a un módulo externo dentro del factory).
 */

export const TEST_KID = 'test-key-1';

export interface TestJwtKeys {
  privateKey: KeyLike;
  jwks: JWTVerifyGetKey;
}

export async function buildTestJwtKeys(): Promise<TestJwtKeys> {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const publicJwk = await exportJWK(publicKey);
  const jwks = createLocalJWKSet({
    keys: [{ ...publicJwk, kid: TEST_KID, alg: 'ES256', use: 'sig' }],
  });
  return { privateKey, jwks };
}

export interface SignTestTokenOptions {
  issuer: string;
  sub?: string;
  audience?: string;
  expiresInSeconds?: number;
  incluirExp?: boolean;
  incluirSub?: boolean;
  kid?: string;
}

export async function signTestToken(
  privateKey: KeyLike,
  options: SignTestTokenOptions,
): Promise<string> {
  const {
    issuer,
    sub = 'auth-user-1',
    audience = 'authenticated',
    expiresInSeconds = 3600,
    incluirExp = true,
    incluirSub = true,
    kid = TEST_KID,
  } = options;

  let builder = new SignJWT(incluirSub ? { sub } : {})
    .setProtectedHeader({ alg: 'ES256', kid })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience);

  if (incluirExp) {
    builder = builder.setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds);
  }

  return builder.sign(privateKey);
}
