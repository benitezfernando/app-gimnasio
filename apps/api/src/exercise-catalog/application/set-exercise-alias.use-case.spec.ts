import { Role } from '../../identity/domain/role';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import { SetExerciseAliasUseCase, MAX_LONGITUD_ALIAS } from './set-exercise-alias.use-case';
import { InvalidExerciseAliasError } from './errors/invalid-exercise-alias.error';
import { ExerciseNotFoundError } from './errors/exercise-not-found.error';
import { ExerciseDetail, ExerciseRepositoryPort } from './ports/exercise-repository.port';
import { ExerciseAliasRepositoryPort } from './ports/exercise-alias-repository.port';

describe('SetExerciseAliasUseCase', () => {
  let exerciseRepository: jest.Mocked<ExerciseRepositoryPort>;
  let aliasRepository: jest.Mocked<ExerciseAliasRepositoryPort>;
  let useCase: SetExerciseAliasUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const alumno = { id: 'alum-1', gymId: 'gym-1', role: Role.ALUMNO };

  const detalle: ExerciseDetail = {
    id: 'ex-1',
    nombre: 'Banca plana',
    nombreCatalogo: 'Barra press de banca',
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
    useCase = new SetExerciseAliasUseCase(exerciseRepository, aliasRepository);
  });

  it('rechaza si quien invoca no es PROFESOR', async () => {
    await expect(
      useCase.execute({ invocadoPor: alumno, exerciseId: 'ex-1', nombre: 'Banca plana' }),
    ).rejects.toThrow(InsufficientRoleError);
    expect(aliasRepository.upsert).not.toHaveBeenCalled();
  });

  it('rechaza un nombre vacío o de solo espacios', async () => {
    await expect(
      useCase.execute({ invocadoPor: profesor, exerciseId: 'ex-1', nombre: '   ' }),
    ).rejects.toThrow(InvalidExerciseAliasError);
    expect(aliasRepository.upsert).not.toHaveBeenCalled();
  });

  it('rechaza un nombre de más de 80 caracteres, pero acepta uno de exactamente 80', async () => {
    exerciseRepository.findById.mockResolvedValue(detalle);

    await expect(
      useCase.execute({
        invocadoPor: profesor,
        exerciseId: 'ex-1',
        nombre: 'a'.repeat(MAX_LONGITUD_ALIAS + 1),
      }),
    ).rejects.toThrow(InvalidExerciseAliasError);

    await expect(
      useCase.execute({
        invocadoPor: profesor,
        exerciseId: 'ex-1',
        nombre: 'a'.repeat(MAX_LONGITUD_ALIAS),
      }),
    ).resolves.toBeDefined();
  });

  it('rechaza con ExerciseNotFoundError si el ejercicio no existe', async () => {
    exerciseRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ invocadoPor: profesor, exerciseId: 'no-existe', nombre: 'Banca plana' }),
    ).rejects.toThrow(ExerciseNotFoundError);
    expect(aliasRepository.upsert).not.toHaveBeenCalled();
  });

  it('recorta y normaliza el nombre, hace upsert con el id del invocador y devuelve el ejercicio resuelto', async () => {
    exerciseRepository.findById.mockResolvedValue(detalle);

    const resultado = await useCase.execute({
      invocadoPor: profesor,
      exerciseId: 'ex-1',
      nombre: '  Banca Plana ÁÉ  ',
    });

    expect(aliasRepository.upsert).toHaveBeenCalledWith({
      profesorId: 'prof-1',
      exerciseId: 'ex-1',
      nombre: 'Banca Plana ÁÉ',
      nombreNormalizado: 'banca plana ae',
    });
    expect(exerciseRepository.findById).toHaveBeenLastCalledWith('ex-1', 'prof-1');
    expect(aliasRepository.delete).not.toHaveBeenCalled();
    expect(resultado).toEqual(detalle);
  });

  it('borra el alias en vez de guardarlo si es idéntico al nombre del catálogo', async () => {
    const sinAlias = { ...detalle, nombre: 'Barra press de banca' };
    exerciseRepository.findById.mockResolvedValue(sinAlias);

    const resultado = await useCase.execute({
      invocadoPor: profesor,
      exerciseId: 'ex-1',
      nombre: '  Barra press de banca  ',
    });

    expect(aliasRepository.upsert).not.toHaveBeenCalled();
    expect(aliasRepository.delete).toHaveBeenCalledWith('prof-1', 'ex-1');
    expect(resultado).toEqual(sinAlias);
  });
});
