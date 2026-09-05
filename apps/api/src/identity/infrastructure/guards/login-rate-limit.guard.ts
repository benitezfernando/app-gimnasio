import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

interface Intento {
  cantidad: number;
  desde: number;
}

const VENTANA_MS = 15 * 60 * 1000;
const MAX_INTENTOS_POR_PAR = 5;
const MAX_INTENTOS_POR_IP = 20;

/**
 * Rate limit mínimo para /auth/login, con dos dimensiones independientes:
 * - por IP+username combinados (mitiga fuerza bruta contra un username puntual).
 * - por IP sola (mitiga un barrido de muchos usernames distintos desde la
 *   misma IP, que el contador por par no ve porque cada par empieza en 0).
 * Ventana deslizante simple en memoria — no sobrevive un restart ni
 * funciona entre múltiples instancias; suficiente para el MVP de un solo
 * proceso. El username del alumno es su único secreto (riesgo aceptado y
 * documentado en el PRD) — esto es la mitigación mínima contra fuerza bruta.
 */
@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly intentosPorPar = new Map<string, Intento>();
  private readonly intentosPorIp = new Map<string, Intento>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const username =
      (request.body as { username?: string } | undefined)?.username ?? 'sin-username';
    const ip = request.ip ?? 'sin-ip';
    const claveParIpUsername = `${ip}:${username}`;
    const ahora = Date.now();

    this.limpiarExpirados(this.intentosPorPar, ahora);
    this.limpiarExpirados(this.intentosPorIp, ahora);

    this.registrarIntento(this.intentosPorPar, claveParIpUsername, ahora, MAX_INTENTOS_POR_PAR);
    this.registrarIntento(this.intentosPorIp, ip, ahora, MAX_INTENTOS_POR_IP);

    return true;
  }

  private registrarIntento(
    mapa: Map<string, Intento>,
    clave: string,
    ahora: number,
    maximo: number,
  ): void {
    const registro = mapa.get(clave);
    if (!registro || ahora - registro.desde > VENTANA_MS) {
      mapa.set(clave, { cantidad: 1, desde: ahora });
      return;
    }

    if (registro.cantidad >= maximo) {
      throw new HttpException(
        'Demasiados intentos. Probá de nuevo más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    registro.cantidad += 1;
  }

  private limpiarExpirados(mapa: Map<string, Intento>, ahora: number): void {
    for (const [clave, registro] of mapa) {
      if (ahora - registro.desde > VENTANA_MS) {
        mapa.delete(clave);
      }
    }
  }
}
