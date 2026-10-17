import { Controller, Get } from '@nestjs/common';
import { Public } from '../identity/infrastructure/decorators/public.decorator';
import { PrismaService } from '../shared-kernel/prisma.service';

/**
 * Health check sin autenticación — lo pega Render (o cualquier orquestador)
 * para saber si el servicio está vivo. Sin esto, Render no puede
 * diferenciar "el proceso está arriba" de "el proceso todavía no levantó" /
 * "se cayó", y el Hobby plan lo necesita además para el ciclo de
 * sleep/wake (ver docs/hld-mvp.md §5).
 *
 * Hace un SELECT 1 contra Supabase: el plan free pausa el proyecto tras 7
 * días sin actividad en la DB, y un ping que solo responde desde el
 * proceso Node no cuenta como actividad para Supabase. El workflow
 * keep-render-awake.yml ya pega acá con la frecuencia suficiente para
 * ambos propósitos (despertar Render + mantener viva la DB).
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check(): Promise<{ status: 'ok'; db: 'ok' }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', db: 'ok' };
  }
}
