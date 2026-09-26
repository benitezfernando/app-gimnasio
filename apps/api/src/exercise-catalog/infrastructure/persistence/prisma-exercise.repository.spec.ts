import { PrismaExerciseRepository } from './prisma-exercise.repository';
import { PrismaService } from '../../../shared-kernel/prisma.service';

describe('PrismaExerciseRepository', () => {
  let prisma: {
    exercise: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
    };
  };
  let repo: PrismaExerciseRepository;

  beforeEach(() => {
    prisma = {
      exercise: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    repo = new PrismaExerciseRepository(prisma as unknown as PrismaService);
  });

  it('findMany agrega activo:true al where (tanto en findMany como en count)', async () => {
    await repo.findMany({ page: 1, limit: 24 });

    expect(prisma.exercise.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ activo: true }) }),
    );
    expect(prisma.exercise.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ activo: true }) }),
    );
  });

  it('findById NO filtra por activo', async () => {
    await repo.findById('ex-1');

    expect(prisma.exercise.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ex-1' } }),
    );
    const args = prisma.exercise.findUnique.mock.calls[0][0];
    expect(args.where).not.toHaveProperty('activo');
  });

  it('findByIds NO filtra por activo', async () => {
    await repo.findByIds(['ex-1', 'ex-2']);

    const args = prisma.exercise.findMany.mock.calls[0][0];
    expect(args.where).not.toHaveProperty('activo');
    expect(args.where.id).toEqual({ in: ['ex-1', 'ex-2'] });
  });

  it('findByIds con array vacío no llega a Prisma', async () => {
    const result = await repo.findByIds([]);

    expect(result).toEqual([]);
    expect(prisma.exercise.findMany).not.toHaveBeenCalled();
  });

  it('findMany con search filtra por nombreNormalizado o nombreOriginalNormalizado (OR), no por nombre', async () => {
    await repo.findMany({ search: 'Frances', page: 1, limit: 24 });

    const args = prisma.exercise.findMany.mock.calls[0][0];
    expect(args.where).toEqual(
      expect.objectContaining({
        OR: [
          { nombreNormalizado: { contains: 'frances' } },
          { nombreOriginalNormalizado: { contains: 'frances' } },
        ],
      }),
    );
    expect(args.where).not.toHaveProperty('nombre');
  });

  it('findMany con search también matchea buscando por el nombre original (ej. "sit-up")', async () => {
    await repo.findMany({ search: 'Sit-Up', page: 1, limit: 24 });

    const args = prisma.exercise.findMany.mock.calls[0][0];
    expect(args.where.OR).toContainEqual({
      nombreOriginalNormalizado: { contains: 'sit-up' },
    });
  });
});
