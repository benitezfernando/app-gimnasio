import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../domain/authenticated-user';

interface RequestWithGymScope {
  user?: AuthenticatedUser;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
}

/**
 * Scoping de tenant por gymId (HLD §4: "Scoping por gymId en cada query de
 * repo — nunca confiar en el filtro del frontend"). Guard global y
 * reusable: si la request trae un gymId explícito (params o body) que no
 * coincide con el del usuario autenticado, la rechaza. Corre después de
 * `JwtAuthGuard` (necesita `req.user` ya seteado) y no reemplaza el
 * filtrado por `gymId` dentro de cada repositorio — es una segunda barrera.
 */
@Injectable()
export class GymScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithGymScope>();
    const user = request.user;

    if (!user) {
      // JwtAuthGuard corre antes y ya rechaza si no hay usuario; si por
      // algún motivo este guard corre sin usuario, no hay nada que scopear.
      return true;
    }

    const gymIdEnParams = request.params?.gymId;
    const gymIdEnBody = request.body?.gymId as string | undefined;
    const gymIdEnQuery = request.query?.gymId as string | undefined;

    for (const gymIdSolicitado of [gymIdEnParams, gymIdEnBody, gymIdEnQuery]) {
      if (gymIdSolicitado && gymIdSolicitado !== user.gymId) {
        throw new ForbiddenException(
          `No tenés acceso a recursos del gym '${gymIdSolicitado}' — pertenecés al gym '${user.gymId}'`,
        );
      }
    }

    return true;
  }
}
