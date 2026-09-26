import { Role } from '../../identity/domain/role';
import { GetAlumnoRutinaVigenteAsProfesorUseCase } from './get-alumno-rutina-vigente-as-profesor.use-case';
import {
  RoutineInstanceRepositoryPort,
  RoutineInstanceDetail,
} from './ports/routine-instance-repository.port';
import { RoutineTemplateRepositoryPort } from './ports/routine-template-repository.port';
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
import {
  crearInstanceRepositoryMock,
  crearTemplateRepositoryMock,
} from '../../test-support/repositorios-routines.mock';

describe('GetAlumnoRutinaVigenteAsProfesorUseCase', () => {
  let instanceRepository: jest.Mocked<RoutineInstanceRepositoryPort>;
  let templateRepository: jest.Mocked<RoutineTemplateRepositoryPort>;
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
    vigenteDesde: new Date(),
    vigenteHasta: null,
    activa: true,
    dias: [
      {
        id: 'd0',
        numero: 1,
        vinculadoADiaId: null,
        ejercicios: [
          {
            exerciseId: 'ex-1',
            orden: 1,
            series: 3,
            repeticiones: 10,
            peso: 20,
            notas: null,
          },
        ],
      },
    ],
  };

  const ejercicioResuelto: ExerciseSummary = {
    id: 'ex-1',
    nombre: 'Sentadilla',
    nombreOriginal: null,
    imageUrl: 'https://x/img.png',
    gifUrl: null,
    parteCuerpo: 'upper legs',
    grupoMuscular: 'quads',
    equipamiento: 'barbell',
  };

  beforeEach(() => {
    instanceRepository = crearInstanceRepositoryMock();
    templateRepository = crearTemplateRepositoryMock();
    templateRepository.findDiasByIds.mockResolvedValue([]);
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
      updateNombre: jest.fn(),
    };
    exerciseRepository = { findMany: jest.fn(), findById: jest.fn(), findByIds: jest.fn() };
    useCase = new GetAlumnoRutinaVigenteAsProfesorUseCase(
      instanceRepository,
      templateRepository,
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

  it('informa por día a qué plantilla y día está vinculado, y null en los independientes', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(true);
    instanceRepository.findVigentePorAlumno.mockResolvedValue({
      ...instancia,
      dias: [
        {
          id: 'd1',
          numero: 1,
          vinculadoADiaId: 'tday-2',
          ejercicios: instancia.dias[0].ejercicios,
        },
        { id: 'd2', numero: 2, vinculadoADiaId: null, ejercicios: instancia.dias[0].ejercicios },
      ],
    });
    templateRepository.findDiasByIds.mockResolvedValue([
      {
        id: 'tday-2',
        numero: 3,
        templateId: 'tpl-1',
        templateNombre: 'Piernas',
        profesorId: 'prof-1',
        gymId: 'gym-1',
        exerciseIds: ['ex-1'],
      },
    ]);
    exerciseRepository.findByIds.mockResolvedValue([ejercicioResuelto]);

    const salida = await useCase.execute({ invocadoPor: profesor, alumnoId: 'alum-1' });

    expect(templateRepository.findDiasByIds).toHaveBeenCalledWith(['tday-2']);
    expect(salida?.dias.map((d) => [d.id, d.numero, d.vinculado])).toEqual([
      ['d1', 1, { diaId: 'tday-2', templateId: 'tpl-1', templateNombre: 'Piernas', numero: 3 }],
      ['d2', 2, null],
    ]);
  });
});
