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
import { normalizarNombre } from '../../normalizar-nombre';

const SELECT_SUMMARY = {
  id: true,
  nombre: true,
  nombreOriginal: true,
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

type FilaConAlias = { nombre: string; aliases?: Array<{ nombre: string }> };

/** Trae, junto con el ejercicio, el alias de ese profesor (a lo sumo uno por la unicidad). */
function incluirAlias(aliasDeProfesorId?: string) {
  return aliasDeProfesorId
    ? { aliases: { where: { profesorId: aliasDeProfesorId }, select: { nombre: true }, take: 1 } }
    : {};
}

/** Si hay alias: `nombre` pasa a ser el alias y `nombreCatalogo` el nombre del catálogo. */
function resolverAlias<T extends FilaConAlias>(
  fila: T,
): Omit<T, 'aliases'> & { nombreCatalogo: string | null } {
  const { aliases, ...resto } = fila;
  const alias = aliases?.[0]?.nombre;
  return { ...resto, nombre: alias ?? fila.nombre, nombreCatalogo: alias ? fila.nombre : null };
}

@Injectable()
export class PrismaExerciseRepository implements ExerciseRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(filter: ListExercisesFilter): Promise<ListExercisesResult> {
    const busqueda = filter.search ? normalizarNombre(filter.search) : undefined;
    const where: Prisma.ExerciseWhereInput = {
      activo: true,
      ...(busqueda
        ? {
            OR: [
              { nombreNormalizado: { contains: busqueda } },
              { nombreOriginalNormalizado: { contains: busqueda } },
              ...(filter.aliasDeProfesorId
                ? [
                    {
                      aliases: {
                        some: {
                          profesorId: filter.aliasDeProfesorId,
                          nombreNormalizado: { contains: busqueda },
                        },
                      },
                    },
                  ]
                : []),
            ],
          }
        : {}),
      ...(filter.parteCuerpo ? { parteCuerpo: filter.parteCuerpo } : {}),
      ...(filter.equipamiento ? { equipamiento: filter.equipamiento } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.exercise.findMany({
        where,
        orderBy: { nombre: 'asc' },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        select: { ...SELECT_SUMMARY, ...incluirAlias(filter.aliasDeProfesorId) },
      }),
      this.prisma.exercise.count({ where }),
    ]);

    return {
      items: (items as unknown as FilaConAlias[]).map(
        resolverAlias,
      ) as unknown as ExerciseSummary[],
      total,
    };
  }

  async findById(id: string, aliasDeProfesorId?: string): Promise<ExerciseDetail | null> {
    const exercise = await this.prisma.exercise.findUnique({
      where: { id },
      select: { ...SELECT_DETAIL, ...incluirAlias(aliasDeProfesorId) },
    });
    return exercise
      ? (resolverAlias(exercise as unknown as FilaConAlias) as unknown as ExerciseDetail)
      : null;
  }

  async findByIds(ids: string[], aliasDeProfesorId?: string): Promise<ExerciseSummary[]> {
    if (ids.length === 0) {
      return [];
    }
    const exercises = await this.prisma.exercise.findMany({
      where: { id: { in: ids } },
      select: { ...SELECT_SUMMARY, ...incluirAlias(aliasDeProfesorId) },
    });
    return (exercises as unknown as FilaConAlias[]).map(
      resolverAlias,
    ) as unknown as ExerciseSummary[];
  }
}
