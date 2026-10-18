import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import { ExerciseAliasRepositoryPort } from '../../application/ports/exercise-alias-repository.port';

@Injectable()
export class PrismaExerciseAliasRepository implements ExerciseAliasRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(data: {
    profesorId: string;
    exerciseId: string;
    nombre: string;
    nombreNormalizado: string;
  }): Promise<void> {
    await this.prisma.exerciseAlias.upsert({
      where: {
        profesorId_exerciseId: { profesorId: data.profesorId, exerciseId: data.exerciseId },
      },
      create: data,
      update: { nombre: data.nombre, nombreNormalizado: data.nombreNormalizado },
    });
  }

  async delete(profesorId: string, exerciseId: string): Promise<void> {
    await this.prisma.exerciseAlias.deleteMany({ where: { profesorId, exerciseId } });
  }
}
