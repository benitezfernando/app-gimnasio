import { Role } from '../../identity/domain/role';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import { ClearExerciseAliasUseCase } from './clear-exercise-alias.use-case';
import { ExerciseNotFoundError } from './errors/exercise-not-found.error';
import { ExerciseDetail, ExerciseRepositoryPort } from './ports/exercise-repository.port';
import { ExerciseAliasRepositoryPort } from './ports/exercise-alias-repository.port';

describe('ClearExerciseAliasUseCase', () => {
  let exerciseRepository: jest.Mocked<ExerciseRepositoryPort>;
  let aliasRepository: jest.Mocked<ExerciseAliasRepositoryPort>;
  let useCase: ClearExerciseAliasUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };

  const detalle: ExerciseDetail = {
    id: 'ex-1',
    nombre: 'Barra press de banca',
    nombreCatalogo: null,
    nombreOriginal: 'barbell bench press',
    imageUrl: null,
    gifUrl: null,
    parteCuerpo: 'chest',
    grupoMuscular: 'pectorals',
    equipamiento: 'barbell',
    gruposMuscularesSecundarios: [],
    instrucciones: null,
    pasos: [],
    atribucionMedia: null,
  };

  beforeEach(() => {
    exerciseRepository = { findMany: jest.fn(), findById: jest.fn(), findByIds: jest.fn() };
    aliasRepository = { upsert: jest.fn(), delete: jest.fn() };
    useCase = new ClearExerciseAliasUseCase(exerciseRepository, aliasRepository);
  });

  it('rechaza si quien invoca no es PROFESOR', async () => {
    await expect(useCase.execute({ invocadoPor: admin, exerciseId: 'ex-1' })).rejects.toThrow(
      InsufficientRoleError,
    );
    expect(aliasRepository.delete).not.toHaveBeenCalled();
  });

  it('rechaza con ExerciseNotFoundError si el ejercicio no existe', async () => {
    exerciseRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ invocadoPor: profesor, exerciseId: 'no-existe' }),
    ).rejects.toThrow(ExerciseNotFoundError);
    expect(aliasRepository.delete).not.toHaveBeenCalled();
  });

  it('borra el alias propio y devuelve el ejercicio resuelto (idempotente: borra aunque no hubiera alias)', async () => {
    exerciseRepository.findById.mockResolvedValue(detalle);

    const resultado = await useCase.execute({ invocadoPor: profesor, exerciseId: 'ex-1' });

    expect(aliasRepository.delete).toHaveBeenCalledWith('prof-1', 'ex-1');
    expect(exerciseRepository.findById).toHaveBeenLastCalledWith('ex-1', 'prof-1');
    expect(resultado).toEqual(detalle);
  });
});
