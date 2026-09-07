import { Role } from '../../identity/domain/role';
import { ReplaceTemplateExercisesUseCase } from './replace-template-exercises.use-case';
import {
  RoutineTemplateRepositoryPort,
  RoutineTemplateDetail,
} from './ports/routine-template-repository.port';
import { ExerciseRepositoryPort } from '../../exercise-catalog/application/ports/exercise-repository.port';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';
import { TooManyExercisesError } from './errors/too-many-exercises.error';
import { InvalidExerciseIdError } from './errors/invalid-exercise-id.error';

describe('ReplaceTemplateExercisesUseCase', () => {
  let templateRepository: jest.Mocked<RoutineTemplateRepositoryPort>;
  let exerciseRepository: jest.Mocked<ExerciseRepositoryPort>;
  let useCase: ReplaceTemplateExercisesUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };

  const detalle: RoutineTemplateDetail = {
    id: 'tpl-1',
    gymId: 'gym-1',
    profesorId: 'prof-1',
    nombre: 'Full body',
    descripcion: null,
    activa: true,
    ejercicios: [],
  };

  const unEjercicio = {
    exerciseId: 'ex-1',
    orden: 1,
    series: 3,
    repeticiones: 10,
    peso: null,
    descanso: 60,
    notas: null,
  };

  beforeEach(() => {
    templateRepository = {
      findByProfesor: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      replaceExercises: jest.fn(),
    };
    exerciseRepository = {
      findMany: jest.fn(),
      findById: jest.fn(),
      findByIds: jest.fn().mockResolvedValue([{ id: 'ex-1' }]),
    } as unknown as jest.Mocked<ExerciseRepositoryPort>;
    useCase = new ReplaceTemplateExercisesUseCase(templateRepository, exerciseRepository);
  });

  it('lanza RoutineTemplateNotFoundError si no es del profesor invocador', async () => {
    templateRepository.findById.mockResolvedValue({ ...detalle, profesorId: 'prof-OTRO' });
    await expect(
      useCase.execute({ invocadoPor: profesor, templateId: 'tpl-1', ejercicios: [unEjercicio] }),
    ).rejects.toThrow(RoutineTemplateNotFoundError);
  });

  it('lanza TooManyExercisesError si vienen más de 50', async () => {
    templateRepository.findById.mockResolvedValue(detalle);
    const cincuentaYUno = Array.from({ length: 51 }, (_, i) => ({ ...unEjercicio, orden: i + 1 }));

    await expect(
      useCase.execute({ invocadoPor: profesor, templateId: 'tpl-1', ejercicios: cincuentaYUno }),
    ).rejects.toThrow(TooManyExercisesError);
    expect(templateRepository.replaceExercises).not.toHaveBeenCalled();
  });

  it('reemplaza los ejercicios si todo es válido', async () => {
    templateRepository.findById.mockResolvedValue(detalle);

    await useCase.execute({
      invocadoPor: profesor,
      templateId: 'tpl-1',
      ejercicios: [unEjercicio],
    });

    expect(templateRepository.replaceExercises).toHaveBeenCalledWith('tpl-1', [unEjercicio]);
  });

  it('lanza InvalidExerciseIdError si algún exerciseId no existe en el catálogo', async () => {
    templateRepository.findById.mockResolvedValue(detalle);
    exerciseRepository.findByIds.mockResolvedValue([]);

    await expect(
      useCase.execute({ invocadoPor: profesor, templateId: 'tpl-1', ejercicios: [unEjercicio] }),
    ).rejects.toThrow(InvalidExerciseIdError);
    expect(templateRepository.replaceExercises).not.toHaveBeenCalled();
  });
});
