import type { Prisma } from '@prisma/client';
import { Role } from '../../domain/role';

export const ROUTINES_CLEANUP = Symbol('ROUTINES_CLEANUP');

export interface RoutinesCleanupImpact {
  plantillasABorrar: number;
  instanciasABorrar: number;
  instanciasQueSobreviven: number;
}

/**
 * `identity` declara este puerto porque necesita que alguien limpie los
 * datos de Routines antes de borrar un `User` — pero `identity` nunca debe
 * depender de `routines` (HLD §2: la dirección es routines → identity).
 * `routines` es quien lo implementa (`PrismaRoutinesCleanupAdapter`), sin
 * invertir esa dirección: sigue siendo `routines` quien conoce a `identity`,
 * no al revés. `IdentityModule` importa el MÓDULO de Nest de `routines`
 * para obtener el provider — nunca accede a los repos internos de routines
 * directamente.
 *
 * `tx: Prisma.TransactionClient` es una fuga deliberada de infraestructura
 * en una interfaz de application layer — no es hexagonal puro. Se acepta
 * por el mismo criterio que la transacción de alta con cartera del Bloque
 * 3A: construir un Unit of Work genérico solo para este caso de uso es
 * sobre-ingeniería para un MVP de un gimnasio. El hard-delete completo
 * (routines → ProfesorAlumno → User) tiene que ser una única transacción,
 * y Prisma no tiene una abstracción que cruce repos sin pasar el mismo
 * `tx` explícitamente.
 */
export interface RoutinesCleanupPort {
  contarImpacto(userId: string, role: Role.PROFESOR | Role.ALUMNO): Promise<RoutinesCleanupImpact>;
  eliminarDatosDe(
    userId: string,
    role: Role.PROFESOR | Role.ALUMNO,
    tx: Prisma.TransactionClient,
  ): Promise<void>;
}
