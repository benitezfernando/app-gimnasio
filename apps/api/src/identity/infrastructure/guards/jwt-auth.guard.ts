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
import * as jwt from 'jsonwebtoken';
import { USER_REPOSITORY, UserRepositoryPort } from '../../application/ports/user-repository.port';
import { AuthenticatedUser } from '../../domain/authenticated-user';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface SupabaseJwtPayload {
  sub: string;
  exp?: number;
  [key: string]: unknown;
}

interface RequestWithAuth {
  headers: { authorization?: string };
  user?: AuthenticatedUser;
}

/**
 * Valida el JWT de Supabase Auth verificándolo LOCALMENTE contra el JWT
 * secret del proyecto (HS256) — nunca contra un endpoint de Supabase.
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

    const secret = process.env.SUPABASE_JWT_SECRET;
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!secret || !supabaseUrl) {
      new Logger(JwtAuthGuard.name).error(
        'SUPABASE_JWT_SECRET o SUPABASE_URL no están configurados',
      );
      throw new InternalServerErrorException();
    }

    let payload: SupabaseJwtPayload;
    try {
      payload = jwt.verify(token, secret, {
        algorithms: ['HS256'],
        audience: 'authenticated',
        issuer: `${supabaseUrl}/auth/v1`,
      }) as SupabaseJwtPayload;
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
