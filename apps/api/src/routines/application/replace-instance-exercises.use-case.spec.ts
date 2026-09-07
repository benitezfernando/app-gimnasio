import {
  RoutineInstanceRepositoryPort,
  RoutineInstanceDetail,
} from './ports/routine-instance-repository.port';
import { CarteraRepositoryPort } from '../../identity/application/ports/cartera-repository.port';
import { ExerciseRepositoryPort } from '../../exercise-catalog/application/ports/exercise-repository.port';
import { Role } from '../../identity/domain/role';
import { ReplaceInstanceExercisesUseCase } from './replace-instance-exercises.use-case';
import { RoutineInstanceNotFoundError } from './errors/routine-instance-not-found.error';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';
import { TooManyExercisesError } from './errors/too-many-exercises.error';
import { InvalidExerciseIdError } from './errors/invalid-exercise-id.error';

describe('ReplaceInstanceExercisesUseCase', () => {
  let instanceRepository: jest.Mocked<RoutineInstanceRepositoryPort>;
  let carteraRepository: jest.Mocked<CarteraRepositoryPort>;
  let exerciseRepository: jest.Mocked<ExerciseRepositoryPort>;
  let useCase: ReplaceInstanceExercisesUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };

  const instancia: RoutineInstanceDetail = {
    id: 'inst-1',
    gymId: 'gym-1',
    profesorId: 'prof-1',
    alumnoId: 'alum-1',
    nombre: 'Full body',
    origenTemplateId: null,
    vigenteDesde: new Date(),
    vigenteHasta: null,
    activa: true,
    ejercicios: [],
  };

  const unEjercicio = {
    exerciseId: 'ex-1',
    orden: 1,
    series: 3,
    repeticiones: 10,
    peso: 20,
    descanso: 60,
    notas: null,
  };

  beforeEach(() => {
    instanceRepository = {
      findVigentePorAlumno: jest.fn(),
      findById: jest.fn(),
      crear: jest.fn(),
      update: jest.fn(),
      replaceExercises: jest.fn(),
    };
    carteraRepository = {
      existe: jest.fn(),
      crear: jest.fn(),
      eliminar: jest.fn(),
      findAlumnosDeProfesor: jest.fn(),
      findProfesoresDeAlumno: jest.fn(),
    };
    exerciseRepository = {
      findMany: jest.fn(),
      findById: jest.fn(),
      findByIds: jest.fn().mockResolvedValue([{ id: 'ex-1' }]),
    } as unknown as jest.Mocked<ExerciseRepositoryPort>;
    useCase = new ReplaceInstanceExercisesUseCase(
      instanceRepository,
      carteraRepository,
      exerciseRepository,
    );
  });

  it('lanza RoutineInstanceNotFoundError si no existe', async () => {
    instanceRepository.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        instanceId: 'no-existe',
        ejercicios: [unEjercicio],
      }),
    ).rejects.toThrow(RoutineInstanceNotFoundError);
  });

  it('lanza AlumnoNotInCarteraError si el alumno no está en la cartera del invocador', async () => {
    instanceRepository.findById.mockResolvedValue(instancia);
    carteraRepository.existe.mockResolvedValue(false);
    await expect(
      useCase.execute({ invocadoPor: profesor, instanceId: 'inst-1', ejercicios: [unEjercicio] }),
    ).rejects.toThrow(AlumnoNotInCarteraError);
  });

  it('lanza TooManyExercisesError si vienen más de 50', async () => {
    instanceRepository.findById.mockResolvedValue(instancia);
    carteraRepository.existe.mockResolvedValue(true);
    const cincuentaYUno = Array.from({ length: 51 }, (_, i) => ({ ...unEjercicio, orden: i + 1 }));

    await expect(
      useCase.execute({ invocadoPor: profesor, instanceId: 'inst-1', ejercicios: cincuentaYUno }),
    ).rejects.toThrow(TooManyExercisesError);
  });

  it('lanza RoutineInstanceNotFoundError (no AlumnoNotInCarteraError) si la instancia pertenece a otro gym', async () => {
    instanceRepository.findById.mockResolvedValue({ ...instancia, gymId: 'gym-OTRO' });
    await expect(
      useCase.execute({ invocadoPor: profesor, instanceId: 'inst-1', ejercicios: [unEjercicio] }),
    ).rejects.toThrow(RoutineInstanceNotFoundError);
    expect(carteraRepository.existe).not.toHaveBeenCalled();
  });

  it('reemplaza los ejercicios si todo es válido', async () => {
    instanceRepository.findById.mockResolvedValue(instancia);
    carteraRepository.existe.mockResolvedValue(true);

    await useCase.execute({
      invocadoPor: profesor,
      instanceId: 'inst-1',
      ejercicios: [unEjercicio],
    });

    expect(instanceRepository.replaceExercises).toHaveBeenCalledWith('inst-1', [unEjercicio]);
  });

  it('lanza InvalidExerciseIdError si algún exerciseId no existe en el catálogo', async () => {
    instanceRepository.findById.mockResolvedValue(instancia);
    carteraRepository.existe.mockResolvedValue(true);
    exerciseRepository.findByIds.mockResolvedValue([]);

    await expect(
      useCase.execute({ invocadoPor: profesor, instanceId: 'inst-1', ejercicios: [unEjercicio] }),
    ).rejects.toThrow(InvalidExerciseIdError);
    expect(instanceRepository.replaceExercises).not.toHaveBeenCalled();
  });
});
