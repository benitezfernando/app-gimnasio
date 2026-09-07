import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import {
  EjercicioItem,
  RoutineTemplateDetail,
  RoutineTemplateRepositoryPort,
  RoutineTemplateSummary,
} from '../../application/ports/routine-template-repository.port';

const SELECT_SUMMARY = {
  id: true,
  gymId: true,
  profesorId: true,
  nombre: true,
  descripcion: true,
  activa: true,
} satisfies Prisma.RoutineTemplateSelect;

@Injectable()
export class PrismaRoutineTemplateRepository implements RoutineTemplateRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByProfesor(profesorId: string): Promise<RoutineTemplateSummary[]> {
    const templates = await this.prisma.routineTemplate.findMany({
      where: { profesorId },
      orderBy: { nombre: 'asc' },
      select: SELECT_SUMMARY,
    });
    return templates;
  }

  async findById(id: string): Promise<RoutineTemplateDetail | null> {
    const template = await this.prisma.routineTemplate.findUnique({
      where: { id },
      include: { ejercicios: { orderBy: { orden: 'asc' } } },
    });
    if (!template) return null;

    return {
      id: template.id,
      gymId: template.gymId,
      profesorId: template.profesorId,
      nombre: template.nombre,
      descripcion: template.descripcion,
      activa: template.activa,
      ejercicios: template.ejercicios.map(this.toEjercicioItem),
    };
  }

  async create(data: {
    gymId: string;
    profesorId: string;
    nombre: string;
    descripcion: string | null;
  }): Promise<RoutineTemplateSummary> {
    const template = await this.prisma.routineTemplate.create({
      data: {
        gymId: data.gymId,
        profesorId: data.profesorId,
        nombre: data.nombre,
        descripcion: data.descripcion,
      },
      select: SELECT_SUMMARY,
    });
    return template;
  }

  async update(
    id: string,
    data: { nombre?: string; descripcion?: string | null; activa?: boolean },
  ): Promise<RoutineTemplateSummary> {
    const template = await this.prisma.routineTemplate.update({
      where: { id },
      data,
      select: SELECT_SUMMARY,
    });
    return template;
  }

  async delete(id: string): Promise<void> {
    // Cascada de RoutineTemplateExercise es automática (onDelete: Cascade
    // en el schema). Las RoutineInstance que la referencien por
    // origenTemplateId quedan con ese campo en null automáticamente
    // (onDelete: SetNull) — no hace falta tocarlas acá.
    await this.prisma.routineTemplate.delete({ where: { id } });
  }

  async replaceExercises(templateId: string, ejercicios: EjercicioItem[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.routineTemplateExercise.deleteMany({ where: { templateId } }),
      this.prisma.routineTemplateExercise.createMany({
        data: ejercicios.map((e) => ({
          templateId,
          exerciseId: e.exerciseId,
          orden: e.orden,
          series: e.series,
          repeticiones: e.repeticiones,
          peso: e.peso === null ? null : new Prisma.Decimal(e.peso),
          descanso: e.descanso,
          notas: e.notas,
        })),
      }),
    ]);
  }

  private toEjercicioItem(row: {
    exerciseId: string;
    orden: number;
    series: number;
    repeticiones: number;
    peso: Prisma.Decimal | null;
    descanso: number;
    notas: string | null;
  }): EjercicioItem {
    return {
      exerciseId: row.exerciseId,
      orden: row.orden,
      series: row.series,
      repeticiones: row.repeticiones,
      peso: row.peso === null ? null : row.peso.toNumber(),
      descanso: row.descanso,
      notas: row.notas,
    };
  }
}
