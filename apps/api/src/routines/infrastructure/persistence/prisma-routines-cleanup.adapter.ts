import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import { Role } from '../../../identity/domain/role';
import {
  RoutinesCleanupImpact,
  RoutinesCleanupPort,
} from '../../../identity/application/ports/routines-cleanup.port';

/**
 * Implementa el puerto que declara `identity` (DIP, ver
 * routines-cleanup.port.ts) — `routines` conoce a `identity` (dirección
 * permitida), nunca al revés.
 */
@Injectable()
export class PrismaRoutinesCleanupAdapter implements RoutinesCleanupPort {
  constructor(private readonly prisma: PrismaService) {}

  async contarImpacto(
    userId: string,
    role: Role.PROFESOR | Role.ALUMNO,
  ): Promise<RoutinesCleanupImpact> {
    if (role === Role.ALUMNO) {
      const instanciasABorrar = await this.prisma.routineInstance.count({
        where: { alumnoId: userId },
      });
      return { plantillasABorrar: 0, instanciasABorrar, instanciasQueSobreviven: 0 };
    }

    const plantillasABorrar = await this.prisma.routineTemplate.count({
      where: { profesorId: userId },
    });

    const instancias = await this.prisma.routineInstance.findMany({
      where: { profesorId: userId },
      select: { alumnoId: true },
    });

    let instanciasABorrar = 0;
    let instanciasQueSobreviven = 0;
    for (const instancia of instancias) {
      const tieneOtroProfesor = await this.prisma.profesorAlumno.findFirst({
        where: { alumnoId: instancia.alumnoId, profesorId: { not: userId } },
      });
      if (tieneOtroProfesor) {
        instanciasQueSobreviven += 1;
      } else {
        instanciasABorrar += 1;
      }
    }

    return { plantillasABorrar, instanciasABorrar, instanciasQueSobreviven };
  }

  async eliminarDatosDe(
    userId: string,
    role: Role.PROFESOR | Role.ALUMNO,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (role === Role.ALUMNO) {
      // Días y ejercicios de RoutineInstance caen por onDelete: Cascade.
      await tx.routineInstance.deleteMany({ where: { alumnoId: userId } });
      return;
    }

    // Sus plantillas se borran siempre (días y ejercicios por Cascade). Los
    // días de instancia vinculados a ellas quedan con vinculadoADiaId =
    // null (onDelete: SetNull).
    await tx.routineTemplate.deleteMany({ where: { profesorId: userId } });

    const instancias = await tx.routineInstance.findMany({
      where: { profesorId: userId },
      select: { id: true, alumnoId: true },
    });

    for (const instancia of instancias) {
      const tieneOtroProfesor = await tx.profesorAlumno.findFirst({
        where: { alumnoId: instancia.alumnoId, profesorId: { not: userId } },
      });
      if (tieneOtroProfesor) {
        await tx.routineInstance.update({
          where: { id: instancia.id },
          data: { profesorId: null },
        });
      } else {
        await tx.routineInstance.delete({ where: { id: instancia.id } });
      }
    }
  }
}
