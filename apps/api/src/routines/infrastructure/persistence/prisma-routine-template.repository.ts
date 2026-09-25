import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import {
  ActualizacionDiaVinculado,
  DiaPlantillaAGuardar,
  DiaPlantillaReferencia,
  RoutineTemplateDetail,
  RoutineTemplateRepositoryPort,
  RoutineTemplateSummary,
} from '../../application/ports/routine-template-repository.port';
import {
  DESPLAZAMIENTO_TEMPORAL,
  OPCIONES_TRANSACCION,
  aEjercicioItem,
  aFilaEjercicio,
} from './fila-ejercicio';

const SELECT_SUMMARY = {
  id: true,
  gymId: true,
  profesorId: true,
  nombre: true,
  descripcion: true,
  activa: true,
} satisfies Prisma.RoutineTemplateSelect;

const INCLUDE_DIAS = {
  dias: {
    orderBy: { numero: 'asc' },
    include: { ejercicios: { orderBy: { orden: 'asc' } } },
  },
} satisfies Prisma.RoutineTemplateInclude;

@Injectable()
export class PrismaRoutineTemplateRepository implements RoutineTemplateRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByProfesor(profesorId: string): Promise<RoutineTemplateSummary[]> {
    return this.prisma.routineTemplate.findMany({
      where: { profesorId },
      orderBy: { nombre: 'asc' },
      select: SELECT_SUMMARY,
    });
  }

  async findById(id: string): Promise<RoutineTemplateDetail | null> {
    const template = await this.prisma.routineTemplate.findUnique({
      where: { id },
      include: INCLUDE_DIAS,
    });
    if (!template) return null;

    return {
      id: template.id,
      gymId: template.gymId,
      profesorId: template.profesorId,
      nombre: template.nombre,
      descripcion: template.descripcion,
      activa: template.activa,
      dias: template.dias.map((dia) => ({
        id: dia.id,
        numero: dia.numero,
        ejercicios: dia.ejercicios.map(aEjercicioItem),
      })),
    };
  }

  async create(data: {
    gymId: string;
    profesorId: string;
    nombre: string;
    descripcion: string | null;
  }): Promise<RoutineTemplateSummary> {
    return this.prisma.routineTemplate.create({ data, select: SELECT_SUMMARY });
  }

  async update(
    id: string,
    data: { nombre?: string; descripcion?: string | null; activa?: boolean },
  ): Promise<RoutineTemplateSummary> {
    return this.prisma.routineTemplate.update({ where: { id }, data, select: SELECT_SUMMARY });
  }

  async delete(id: string): Promise<void> {
    // Días y ejercicios caen por onDelete: Cascade; los días de instancia
    // vinculados quedan con vinculadoADiaId = null por onDelete: SetNull.
    await this.prisma.routineTemplate.delete({ where: { id } });
  }

  async findDiasByIds(ids: string[]): Promise<DiaPlantillaReferencia[]> {
    if (ids.length === 0) return [];
    const dias = await this.prisma.routineTemplateDay.findMany({
      where: { id: { in: ids } },
      include: {
        template: { select: { nombre: true, profesorId: true, gymId: true } },
        ejercicios: { select: { exerciseId: true }, orderBy: { orden: 'asc' } },
      },
    });
    return dias.map((dia) => ({
      id: dia.id,
      numero: dia.numero,
      templateId: dia.templateId,
      templateNombre: dia.template.nombre,
      profesorId: dia.template.profesorId,
      gymId: dia.template.gymId,
      exerciseIds: dia.ejercicios.map((e) => e.exerciseId),
    }));
  }

  async guardarDias(
    templateId: string,
    dias: DiaPlantillaAGuardar[],
    propagacion: ActualizacionDiaVinculado[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const idsConservados = dias.flatMap((dia) => (dia.id ? [dia.id] : []));
      await tx.routineTemplateDay.deleteMany({
        where: { templateId, id: { notIn: idsConservados } },
      });
      await tx.routineTemplateDay.updateMany({
        where: { templateId },
        data: { numero: { increment: DESPLAZAMIENTO_TEMPORAL } },
      });

      for (const [indice, dia] of dias.entries()) {
        const numero = indice + 1;
        const { id: dayId } = dia.id
          ? await tx.routineTemplateDay.update({
              where: { id: dia.id },
              data: { numero },
              select: { id: true },
            })
          : await tx.routineTemplateDay.create({
              data: { templateId, numero },
              select: { id: true },
            });
        await tx.routineTemplateExercise.deleteMany({ where: { dayId } });
        await tx.routineTemplateExercise.createMany({
          data: dia.ejercicios.map((e) => aFilaEjercicio(dayId, e)),
        });
      }

      if (propagacion.length > 0) {
        const idsPropagados = propagacion.map((p) => p.diaInstanciaId);
        await tx.routineInstanceExercise.deleteMany({
          where: { dayId: { in: idsPropagados } },
        });
        await tx.routineInstanceExercise.createMany({
          data: propagacion.flatMap((p) =>
            p.ejercicios.map((e) => aFilaEjercicio(p.diaInstanciaId, e)),
          ),
        });
        const idsADesvincular = propagacion
          .filter((p) => p.desvincular)
          .map((p) => p.diaInstanciaId);
        if (idsADesvincular.length > 0) {
          await tx.routineInstanceDay.updateMany({
            where: { id: { in: idsADesvincular } },
            data: { vinculadoADiaId: null },
          });
        }
      }
    }, OPCIONES_TRANSACCION);
  }
}
