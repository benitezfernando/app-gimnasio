import { Controller, Get } from '@nestjs/common';
import { Public } from '../identity/infrastructure/decorators/public.decorator';

/**
 * Health check sin autenticación — lo pega Render (o cualquier orquestador)
 * para saber si el servicio está vivo. Sin esto, Render no puede
 * diferenciar "el proceso está arriba" de "el proceso todavía no levantó" /
 * "se cayó", y el Hobby plan lo necesita además para el ciclo de
 * sleep/wake (ver docs/hld-mvp.md §5).
 */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
