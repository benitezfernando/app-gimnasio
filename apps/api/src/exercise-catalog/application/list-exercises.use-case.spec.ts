import { ListExercisesUseCase } from './list-exercises.use-case';
import { ExerciseRepositoryPort, ExerciseSummary } from './ports/exercise-repository.port';

describe('ListExercisesUseCase', () => {
  let repo: jest.Mocked<ExerciseRepositoryPort>;
  let useCase: ListExercisesUseCase;

  const ejercicio: ExerciseSummary = {
    id: 'ex-1',
    nombre: '3/4 Sit-Up',
    imageUrl: 'https://example.com/img.jpg',
    gifUrl: null,
    parteCuerpo: 'waist',
    grupoMuscular: 'abs',
    equipamiento: 'body weight',
  };

  beforeEach(() => {
    repo = { findMany: jest.fn(), findById: jest.fn(), findByIds: jest.fn() };
    useCase = new ListExercisesUseCase(repo);
  });

  it('devuelve items + metadata de paginación calculada', async () => {
    repo.findMany.mockResolvedValue({ items: [ejercicio], total: 50 });

    const resultado = await useCase.execute({ page: 2, limit: 24 });

    expect(repo.findMany).toHaveBeenCalledWith({ page: 2, limit: 24 });
    expect(resultado).toEqual({
      items: [ejercicio],
      page: 2,
      limit: 24,
      total: 50,
      totalPages: 3,
    });
  });

  it('pasa los filtros de búsqueda/parteCuerpo/equipamiento tal cual al repositorio', async () => {
    repo.findMany.mockResolvedValue({ items: [], total: 0 });

    await useCase.execute({
      search: 'sit',
      parteCuerpo: 'waist',
      equipamiento: 'body weight',
      page: 1,
      limit: 24,
    });

    expect(repo.findMany).toHaveBeenCalledWith({
      search: 'sit',
      parteCuerpo: 'waist',
      equipamiento: 'body weight',
      page: 1,
      limit: 24,
    });
  });

  it('totalPages es 1 (no 0) cuando total es 0', async () => {
    repo.findMany.mockResolvedValue({ items: [], total: 0 });

    const resultado = await useCase.execute({ page: 1, limit: 24 });

    expect(resultado.totalPages).toBe(1);
  });
});
