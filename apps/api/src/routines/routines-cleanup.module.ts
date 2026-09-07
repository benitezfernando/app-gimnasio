import { Module } from '@nestjs/common';
import { ROUTINES_CLEANUP } from '../identity/application/ports/routines-cleanup.port';
import { PrismaRoutinesCleanupAdapter } from './infrastructure/persistence/prisma-routines-cleanup.adapter';

/**
 * Módulo separado de `RoutinesModule` a propósito: el adapter solo
 * necesita `PrismaService` (global, no hace falta importar `PrismaModule`
 * — ver shared-kernel/prisma.module.ts `@Global()`), nunca los puertos de
 * template/instance. Si esto viviera dentro de `RoutinesModule`, y
 * `RoutinesModule` importa `IdentityModule` (Tarea 9, por
 * CARTERA_REPOSITORY/USER_REPOSITORY), e `IdentityModule` necesita
 * importar este módulo para obtener `ROUTINES_CLEANUP` (DIP, Tarea 4),
 * se cierra un ciclo `IdentityModule → RoutinesModule → IdentityModule`.
 * Separándolo en un módulo hoja sin imports, `IdentityModule` lo importa
 * sin que nadie importe de vuelta a `identity` desde acá.
 */
@Module({
  imports: [],
  providers: [{ provide: ROUTINES_CLEANUP, useClass: PrismaRoutinesCleanupAdapter }],
  exports: [ROUTINES_CLEANUP],
})
export class RoutinesCleanupModule {}
