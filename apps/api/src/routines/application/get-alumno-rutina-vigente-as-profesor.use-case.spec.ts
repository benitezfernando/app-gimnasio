import { Role } from '../../identity/domain/role';
import { GetAlumnoRutinaVigenteAsProfesorUseCase } from './get-alumno-rutina-vigente-as-profesor.use-case';
import {
  RoutineInstanceRepositoryPort,
  RoutineInstanceDetail,
} from './ports/routine-instance-repository.port';
import { CarteraRepositoryPort } from '../../identity/application/ports/cartera-repository.port';
import {
  UserRepositoryPort,
  UserRecord,
} from '../../identity/application/ports/user-repository.port';
import {
  ExerciseRepositoryPort,
  ExerciseSummary,
} from '../../exercise-catalog/application/ports/exercise-repository.port';
import { UserNotFoundError } from '../../identity/application/errors/user-not-found.error';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';

describe('GetAlumnoRutinaVigenteAsProfesorUseCase', () => {
  let instanceRepository: jest.Mocked<RoutineInstanceRepositoryPort>;
  let carteraRepository: jest.Mocked<CarteraRepositoryPort>;
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let exerciseRepository: jest.Mocked<ExerciseRepositoryPort>;
  let useCase: GetAlumnoRutinaVigenteAsProfesorUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };

  const alumno: UserRecord = {
    id: 'alum-1',
    authUserId: 'auth-alum',
    gymId: 'gym-1',
    username: 'juan.perez',
    nombre: 'Juan Perez',
    role: Role.ALUMNO,
    activo: true,
  };

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
    ejercicios: [
      {
        exerciseId: 'ex-1',
        orden: 1,
        series: 3,
        repeticiones: 10,
        peso: 20,
        descanso: 60,
        notas: null,
      },
    ],
  };

  const ejercicioResuelto: ExerciseSummary = {
    id: 'ex-1',
    nombre: 'Sentadilla',
    imageUrl: 'https://x/img.png',
    gifUrl: null,
    parteCuerpo: 'upper legs',
    grupoMuscular: 'quads',
    equipamiento: 'barbell',
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
    userRepository = {
      findByAuthUserId: jest.fn(),
      findByGymIdAndUsername: jest.fn(),
      findByGymId: jest.fn(),
      findById: jest.fn(),
      deactivate: jest.fn(),
      create: jest.fn(),
    };
    exerciseRepository = { findMany: jest.fn(), findById: jest.fn(), findByIds: jest.fn() };
    useCase = new GetAlumnoRutinaVigenteAsProfesorUseCase(
      instanceRepository,
      carteraRepository,
      userRepository,
      exerciseRepository,
    );
  });

  it('rechaza con UserNotFoundError si el alumno no existe o es de otro gym', async () => {
    userRepository.findById.mockResolvedValue(null);
    await expect(useCase.execute({ invocadoPor: profesor, alumnoId: 'no-existe' })).rejects.toThrow(
      UserNotFoundError,
    );
  });

  it('rechaza con AlumnoNotInCarteraError si no está en la cartera del invocador', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(false);
    await expect(useCase.execute({ invocadoPor: profesor, alumnoId: 'alum-1' })).rejects.toThrow(
      AlumnoNotInCarteraError,
    );
  });

  it('devuelve null si el alumno no tiene rutina vigente', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(true);
    instanceRepository.findVigentePorAlumno.mockResolvedValue(null);

    const resultado = await useCase.execute({ invocadoPor: profesor, alumnoId: 'alum-1' });

    expect(resultado).toBeNull();
  });

  it('resuelve los ejercicios contra el catálogo en un solo findByIds', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(true);
    instanceRepository.findVigentePorAlumno.mockResolvedValue(instancia);
    exerciseRepository.findByIds.mockResolvedValue([ejercicioResuelto]);

    const resultado = await useCase.execute({ invocadoPor: profesor, alumnoId: 'alum-1' });

    expect(exerciseRepository.findByIds).toHaveBeenCalledWith(['ex-1']);
    expect(resultado!.ejercicios[0]).toMatchObject({
      exerciseId: 'ex-1',
      nombre: 'Sentadilla',
      imageUrl: 'https://x/img.png',
      series: 3,
      peso: 20,
    });
  });
});
