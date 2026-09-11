import { GetExercisesByIdsUseCase } from './get-exercises-by-ids.use-case';
import { ExerciseRepositoryPort, ExerciseSummary } from './ports/exercise-repository.port';

describe('GetExercisesByIdsUseCase', () => {
  let repo: jest.Mocked<ExerciseRepositoryPort>;
  let useCase: GetExercisesByIdsUseCase;

  const resumenA: ExerciseSummary = {
    id: 'ex-a',
    nombre: 'Sentadilla',
    imageUrl: null,
    gifUrl: null,
    parteCuerpo: 'legs',
    grupoMuscular: 'quads',
    equipamiento: 'body weight',
  };
  const resumenB: ExerciseSummary = { ...resumenA, id: 'ex-b', nombre: 'Press banca' };

  beforeEach(() => {
    repo = { findMany: jest.fn(), findById: jest.fn(), findByIds: jest.fn() };
    useCase = new GetExercisesByIdsUseCase(repo);
  });

  it('delega en findByIds con los ids recibidos', async () => {
    repo.findByIds.mockResolvedValue([resumenA, resumenB]);

    const resultado = await useCase.execute(['ex-a', 'ex-b']);

    expect(repo.findByIds).toHaveBeenCalledWith(['ex-a', 'ex-b']);
    expect(resultado).toEqual([resumenA, resumenB]);
  });

  it('con lista vacía, no llama al repositorio y devuelve []', async () => {
    const resultado = await useCase.execute([]);

    expect(repo.findByIds).not.toHaveBeenCalled();
    expect(resultado).toEqual([]);
  });
});
