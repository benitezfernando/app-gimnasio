import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import {
  ExerciseDetail,
  ExerciseRepositoryPort,
  ExerciseSummary,
  ListExercisesFilter,
  ListExercisesResult,
} from '../../application/ports/exercise-repository.port';

const SELECT_SUMMARY = {
  id: true,
  nombre: true,
  imageUrl: true,
  gifUrl: true,
  parteCuerpo: true,
  grupoMuscular: true,
  equipamiento: true,
} satisfies Prisma.ExerciseSelect;

const SELECT_DETAIL = {
  ...SELECT_SUMMARY,
  gruposMuscularesSecundarios: true,
  instrucciones: true,
  pasos: true,
  atribucionMedia: true,
} satisfies Prisma.ExerciseSelect;

@Injectable()
export class PrismaExerciseRepository implements ExerciseRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(filter: ListExercisesFilter): Promise<ListExercisesResult> {
    const where: Prisma.ExerciseWhereInput = {
      ...(filter.search ? { nombre: { contains: filter.search, mode: 'insensitive' } } : {}),
      ...(filter.parteCuerpo ? { parteCuerpo: filter.parteCuerpo } : {}),
      ...(filter.equipamiento ? { equipamiento: filter.equipamiento } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.exercise.findMany({
        where,
        orderBy: { nombre: 'asc' },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        select: SELECT_SUMMARY,
      }),
      this.prisma.exercise.count({ where }),
    ]);

    return { items: items as ExerciseSummary[], total };
  }

  async findById(id: string): Promise<ExerciseDetail | null> {
    const exercise = await this.prisma.exercise.findUnique({
      where: { id },
      select: SELECT_DETAIL,
    });
    return exercise as ExerciseDetail | null;
  }

  async findByIds(ids: string[]): Promise<ExerciseSummary[]> {
    if (ids.length === 0) {
      return [];
    }
    const exercises = await this.prisma.exercise.findMany({
      where: { id: { in: ids } },
      select: SELECT_SUMMARY,
    });
    return exercises as ExerciseSummary[];
  }
}
