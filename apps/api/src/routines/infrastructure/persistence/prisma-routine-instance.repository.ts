import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import {
  DiaInstanciaAGuardar,
  RoutineInstanceDetail,
  RoutineInstanceRepositoryPort,
} from '../../application/ports/routine-instance-repository.port';
import {
  DESPLAZAMIENTO_TEMPORAL,
  OPCIONES_TRANSACCION,
  aEjercicioItem,
  aFilaEjercicio,
} from './fila-ejercicio';

const INCLUDE_DIAS = {
  dias: {
    orderBy: { numero: 'asc' },
    include: { ejercicios: { orderBy: { orden: 'asc' } } },
  },
} satisfies Prisma.RoutineInstanceInclude;

type InstanciaConDias = Prisma.RoutineInstanceGetPayload<{ include: typeof INCLUDE_DIAS }>;

@Injectable()
export class PrismaRoutineInstanceRepository implements RoutineInstanceRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findVigentePorAlumno(alumnoId: string): Promise<RoutineInstanceDetail | null> {
    const instance = await this.prisma.routineInstance.findFirst({
      where: { alumnoId, activa: true },
      orderBy: { vigenteDesde: 'desc' },
      include: INCLUDE_DIAS,
    });
    return instance ? this.toDetail(instance) : null;
  }

  async findById(id: string): Promise<RoutineInstanceDetail | null> {
    const instance = await this.prisma.routineInstance.findUnique({
      where: { id },
      include: INCLUDE_DIAS,
    });
    return instance ? this.toDetail(instance) : null;
  }

  async findActivasConDiasVinculadosA(
    diasPlantillaIds: string[],
  ): Promise<RoutineInstanceDetail[]> {
    if (diasPlantillaIds.length === 0) return [];
    const instances = await this.prisma.routineInstance.findMany({
      where: { activa: true, dias: { some: { vinculadoADiaId: { in: diasPlantillaIds } } } },
      include: INCLUDE_DIAS,
    });
    return instances.map((instance) => this.toDetail(instance));
  }

  async crear(data: {
    gymId: string;
    profesorId: string;
    alumnoId: string;
    nombre: string;
    dias: DiaInstanciaAGuardar[];
  }): Promise<RoutineInstanceDetail> {
    const instanceId = await this.prisma.$transaction(async (tx) => {
      await tx.routineInstance.updateMany({
        where: { alumnoId: data.alumnoId, activa: true },
        data: { activa: false, vigenteHasta: new Date() },
      });
      const { id } = await tx.routineInstance.create({
        data: {
          gymId: data.gymId,
          profesorId: data.profesorId,
          alumnoId: data.alumnoId,
          nombre: data.nombre,
        },
        select: { id: true },
      });
      await this.escribirDias(tx, id, data.dias);
      return id;
    }, OPCIONES_TRANSACCION);

    return (await this.findById(instanceId))!;
  }

  async update(id: string, data: { nombre?: string }): Promise<RoutineInstanceDetail> {
    const instance = await this.prisma.routineInstance.update({
      where: { id },
      data,
      include: INCLUDE_DIAS,
    });
    return this.toDetail(instance);
  }

  async guardarDias(instanceId: string, dias: DiaInstanciaAGuardar[]): Promise<void> {
    await this.prisma.$transaction(
      (tx) => this.escribirDias(tx, instanceId, dias),
      OPCIONES_TRANSACCION,
    );
  }

  private async escribirDias(
    tx: Prisma.TransactionClient,
    instanceId: string,
    dias: DiaInstanciaAGuardar[],
  ): Promise<void> {
    const idsConservados = dias.flatMap((dia) => (dia.id ? [dia.id] : []));
    await tx.routineInstanceDay.deleteMany({
      where: { instanceId, id: { notIn: idsConservados } },
    });
    await tx.routineInstanceDay.updateMany({
      where: { instanceId },
      data: { numero: { increment: DESPLAZAMIENTO_TEMPORAL } },
    });

    for (const [indice, dia] of dias.entries()) {
      const datos = { numero: indice + 1, vinculadoADiaId: dia.vinculadoADiaId };
      const { id: dayId } = dia.id
        ? await tx.routineInstanceDay.update({
            where: { id: dia.id },
            data: datos,
            select: { id: true },
          })
        : await tx.routineInstanceDay.create({
            data: { instanceId, ...datos },
            select: { id: true },
          });
      await tx.routineInstanceExercise.deleteMany({ where: { dayId } });
      await tx.routineInstanceExercise.createMany({
        data: dia.ejercicios.map((e) => aFilaEjercicio(dayId, e)),
      });
    }
  }

  private toDetail(instance: InstanciaConDias): RoutineInstanceDetail {
    return {
      id: instance.id,
      gymId: instance.gymId,
      profesorId: instance.profesorId,
      alumnoId: instance.alumnoId,
      nombre: instance.nombre,
      vigenteDesde: instance.vigenteDesde,
      vigenteHasta: instance.vigenteHasta,
      activa: instance.activa,
      dias: instance.dias.map((dia) => ({
        id: dia.id,
        numero: dia.numero,
        vinculadoADiaId: dia.vinculadoADiaId,
        ejercicios: dia.ejercicios.map(aEjercicioItem),
      })),
    };
  }
}
