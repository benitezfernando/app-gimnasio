import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import { EjercicioItem } from '../../application/ports/routine-template-repository.port';
import {
  RoutineInstanceDetail,
  RoutineInstanceRepositoryPort,
} from '../../application/ports/routine-instance-repository.port';

@Injectable()
export class PrismaRoutineInstanceRepository implements RoutineInstanceRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findVigentePorAlumno(alumnoId: string): Promise<RoutineInstanceDetail | null> {
    const instance = await this.prisma.routineInstance.findFirst({
      where: { alumnoId, activa: true },
      orderBy: { vigenteDesde: 'desc' },
      include: { ejercicios: { orderBy: { orden: 'asc' } } },
    });
    return instance ? this.toDetail(instance) : null;
  }

  async findById(id: string): Promise<RoutineInstanceDetail | null> {
    const instance = await this.prisma.routineInstance.findUnique({
      where: { id },
      include: { ejercicios: { orderBy: { orden: 'asc' } } },
    });
    return instance ? this.toDetail(instance) : null;
  }

  async crear(data: {
    gymId: string;
    profesorId: string;
    alumnoId: string;
    nombre: string;
    origenTemplateId: string | null;
    ejercicios: EjercicioItem[];
  }): Promise<RoutineInstanceDetail> {
    const creada = await this.prisma.$transaction(async (tx) => {
      await tx.routineInstance.updateMany({
        where: { alumnoId: data.alumnoId, activa: true },
        data: { activa: false, vigenteHasta: new Date() },
      });

      const instance = await tx.routineInstance.create({
        data: {
          gymId: data.gymId,
          profesorId: data.profesorId,
          alumnoId: data.alumnoId,
          nombre: data.nombre,
          origenTemplateId: data.origenTemplateId,
          ejercicios: {
            create: data.ejercicios.map((e) => ({
              exerciseId: e.exerciseId,
              orden: e.orden,
              series: e.series,
              repeticiones: e.repeticiones,
              peso: e.peso === null ? null : new Prisma.Decimal(e.peso),
              descanso: e.descanso,
              notas: e.notas,
            })),
          },
        },
        include: { ejercicios: { orderBy: { orden: 'asc' } } },
      });

      return instance;
    });

    return this.toDetail(creada);
  }

  async update(id: string, data: { nombre?: string }): Promise<RoutineInstanceDetail> {
    const instance = await this.prisma.routineInstance.update({
      where: { id },
      data,
      include: { ejercicios: { orderBy: { orden: 'asc' } } },
    });
    return this.toDetail(instance);
  }

  async replaceExercises(instanceId: string, ejercicios: EjercicioItem[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.routineInstanceExercise.deleteMany({ where: { instanceId } }),
      this.prisma.routineInstanceExercise.createMany({
        data: ejercicios.map((e) => ({
          instanceId,
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

  private toDetail(instance: {
    id: string;
    gymId: string;
    profesorId: string | null;
    alumnoId: string;
    nombre: string;
    origenTemplateId: string | null;
    vigenteDesde: Date;
    vigenteHasta: Date | null;
    activa: boolean;
    ejercicios: Array<{
      exerciseId: string;
      orden: number;
      series: number;
      repeticiones: number;
      peso: Prisma.Decimal | null;
      descanso: number;
      notas: string | null;
    }>;
  }): RoutineInstanceDetail {
    return {
      id: instance.id,
      gymId: instance.gymId,
      profesorId: instance.profesorId,
      alumnoId: instance.alumnoId,
      nombre: instance.nombre,
      origenTemplateId: instance.origenTemplateId,
      vigenteDesde: instance.vigenteDesde,
      vigenteHasta: instance.vigenteHasta,
      activa: instance.activa,
      ejercicios: instance.ejercicios.map((e) => ({
        exerciseId: e.exerciseId,
        orden: e.orden,
        series: e.series,
        repeticiones: e.repeticiones,
        peso: e.peso === null ? null : e.peso.toNumber(),
        descanso: e.descanso,
        notas: e.notas,
      })),
    };
  }
}
