import { GetExerciseUseCase } from './get-exercise.use-case';
import { ExerciseRepositoryPort, ExerciseDetail } from './ports/exercise-repository.port';
import { ExerciseNotFoundError } from './errors/exercise-not-found.error';

describe('GetExerciseUseCase', () => {
  let repo: jest.Mocked<ExerciseRepositoryPort>;
  let useCase: GetExerciseUseCase;

  const detalle: ExerciseDetail = {
    id: 'ex-1',
    nombre: '3/4 Sit-Up',
    imageUrl: null,
    gifUrl: null,
    parteCuerpo: 'waist',
    grupoMuscular: 'abs',
    equipamiento: 'body weight',
    gruposMuscularesSecundarios: ['hip flexors'],
    instrucciones: 'Texto',
    pasos: ['Paso 1', 'Paso 2'],
    atribucionMedia: '© Gym visual — https://gymvisual.com/',
  };

  beforeEach(() => {
    repo = { findMany: jest.fn(), findById: jest.fn() };
    useCase = new GetExerciseUseCase(repo);
  });

  it('devuelve el detalle si existe', async () => {
    repo.findById.mockResolvedValue(detalle);

    const resultado = await useCase.execute('ex-1');

    expect(repo.findById).toHaveBeenCalledWith('ex-1');
    expect(resultado).toEqual(detalle);
  });

  it('lanza ExerciseNotFoundError si no existe', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(useCase.execute('no-existe')).rejects.toThrow(ExerciseNotFoundError);
  });
});
