import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { USER_REPOSITORY, UserRepositoryPort } from '../../application/ports/user-repository.port';
import { AuthenticatedUser } from '../../domain/authenticated-user';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface RequestWithAuth {
  headers: { authorization?: string };
  user?: AuthenticatedUser;
}

// Cacheada por proceso, keyeada por SUPABASE_URL — `createRemoteJWKSet` ya
// trae su propio cache HTTP + cooldown de refetch ante un `kid` desconocido
// (por ejemplo, tras una rotación de key en Supabase), así que no hace
// falta reconstruirla en cada request. Un Map por si alguna vez corren
// tests o múltiples proyectos con distinto SUPABASE_URL en el mismo proceso.
const jwksCache = new Map<string, JWTVerifyGetKey>();

function getJwks(supabaseUrl: string): JWTVerifyGetKey {
  const existente = jwksCache.get(supabaseUrl);
  if (existente) {
    return existente;
  }
  const jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
  jwksCache.set(supabaseUrl, jwks);
  return jwks;
}

/**
 * Valida el JWT de Supabase Auth verificándolo contra la JWKS pública del
 * proyecto (`/auth/v1/.well-known/jwks.json`) — asimétrico (ES256, el
 * default actual de Supabase para proyectos nuevos), NO contra un secret
 * compartido. `jose` resuelve la public key correcta por `kid` del header
 * del token y maneja la rotación de keys sola (Supabase puede tener una
 * `standby key` conviviendo con la `current key`; ambas están en la JWKS).
 *
 * Se migró de HS256 + `SUPABASE_JWT_SECRET` a esto porque Supabase movió
 * el signing de proyectos nuevos a JWT Signing Keys asimétricas — el
 * secret compartido (Legacy HS256) queda vivo solo transitoriamente, para
 * verificar tokens emitidos ANTES de la rotación hasta que expiren; no
 * sirve para tokens nuevos. `SUPABASE_JWT_SECRET` ya no se usa acá.
 *
 * Resuelve el `User` interno por `authUserId` (claim `sub`) y lo inyecta
 * en `req.user` para los guards/handlers siguientes.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const token = this.extraerToken(request);

    if (!token) {
      throw new UnauthorizedException('Falta el header Authorization con el token Bearer');
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      new Logger(JwtAuthGuard.name).error('SUPABASE_URL no está configurado');
      throw new InternalServerErrorException();
    }

    let payload: JWTPayload;
    try {
      const jwks = getJwks(supabaseUrl);
      const resultado = await jwtVerify(token, jwks, {
        audience: 'authenticated',
        issuer: `${supabaseUrl}/auth/v1`,
      });
      payload = resultado.payload;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    if (typeof payload.exp !== 'number') {
      throw new UnauthorizedException('Token sin fecha de expiración');
    }

    if (!payload.sub || typeof payload.sub !== 'string') {
      throw new UnauthorizedException('Token sin sub válido');
    }

    let userRecord: Awaited<ReturnType<UserRepositoryPort['findByAuthUserId']>>;
    try {
      userRecord = await this.userRepository.findByAuthUserId(payload.sub);
    } catch {
      throw new UnauthorizedException('Error validando el usuario');
    }

    if (!userRecord || !userRecord.activo) {
      throw new UnauthorizedException('Usuario no encontrado o desactivado');
    }

    request.user = {
      id: userRecord.id,
      gymId: userRecord.gymId,
      role: userRecord.role,
    };

    return true;
  }

  private extraerToken(request: RequestWithAuth): string | null {
    const header = request.headers.authorization;
    if (!header) return null;
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return null;
    return token;
  }
}
