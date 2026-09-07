import { Role } from '../../identity/domain/role';
import { AssignRoutineToAlumnoUseCase } from './assign-routine-to-alumno.use-case';
import {
  RoutineInstanceRepositoryPort,
  RoutineInstanceDetail,
} from './ports/routine-instance-repository.port';
import {
  RoutineTemplateRepositoryPort,
  RoutineTemplateDetail,
} from './ports/routine-template-repository.port';
import { CarteraRepositoryPort } from '../../identity/application/ports/cartera-repository.port';
import {
  UserRepositoryPort,
  UserRecord,
} from '../../identity/application/ports/user-repository.port';
import { ExerciseRepositoryPort } from '../../exercise-catalog/application/ports/exercise-repository.port';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import { UserNotFoundError } from '../../identity/application/errors/user-not-found.error';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';
import { InvalidRoutineInstanceInputError } from './errors/invalid-routine-instance-input.error';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';
import { TemplateHasNoExercisesError } from './errors/template-has-no-exercises.error';
import { TooManyExercisesError } from './errors/too-many-exercises.error';
import { InvalidExerciseIdError } from './errors/invalid-exercise-id.error';

describe('AssignRoutineToAlumnoUseCase', () => {
  let instanceRepository: jest.Mocked<RoutineInstanceRepositoryPort>;
  let templateRepository: jest.Mocked<RoutineTemplateRepositoryPort>;
  let carteraRepository: jest.Mocked<CarteraRepositoryPort>;
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let exerciseRepository: jest.Mocked<ExerciseRepositoryPort>;
  let useCase: AssignRoutineToAlumnoUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };

  const alumno: UserRecord = {
    id: 'alum-1',
    authUserId: 'auth-alum',
    gymId: 'gym-1',
    username: 'juan.perez',
    nombre: 'Juan Perez',
    role: Role.ALUMNO,
    activo: true,
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

  const template: RoutineTemplateDetail = {
    id: 'tpl-1',
    gymId: 'gym-1',
    profesorId: 'prof-1',
    nombre: 'Full body',
    descripcion: null,
    activa: true,
    ejercicios: [unEjercicio],
  };

  const instanciaCreada: RoutineInstanceDetail = {
    id: 'inst-1',
    gymId: 'gym-1',
    profesorId: 'prof-1',
    alumnoId: 'alum-1',
    nombre: 'Full body',
    origenTemplateId: 'tpl-1',
    vigenteDesde: new Date(),
    vigenteHasta: null,
    activa: true,
    ejercicios: [unEjercicio],
  };

  beforeEach(() => {
    instanceRepository = {
      findVigentePorAlumno: jest.fn(),
      findById: jest.fn(),
      crear: jest.fn(),
      update: jest.fn(),
      replaceExercises: jest.fn(),
    };
    templateRepository = {
      findByProfesor: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
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
    exerciseRepository = {
      findMany: jest.fn(),
      findById: jest.fn(),
      findByIds: jest.fn().mockResolvedValue([{ id: 'ex-1' }]),
    } as unknown as jest.Mocked<ExerciseRepositoryPort>;
    useCase = new AssignRoutineToAlumnoUseCase(
      instanceRepository,
      templateRepository,
      carteraRepository,
      userRepository,
      exerciseRepository,
    );
  });

  it('rechaza si quien invoca no es PROFESOR', async () => {
    await expect(
      useCase.execute({
        invocadoPor: admin,
        alumnoId: 'alum-1',
        nombre: 'Full body',
        origenTemplateId: 'tpl-1',
      }),
    ).rejects.toThrow(InsufficientRoleError);
  });

  it('rechaza con InvalidRoutineInstanceInputError si vienen origenTemplateId Y ejercicios', async () => {
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        alumnoId: 'alum-1',
        nombre: 'Full body',
        origenTemplateId: 'tpl-1',
        ejercicios: [unEjercicio],
      }),
    ).rejects.toThrow(InvalidRoutineInstanceInputError);
  });

  it('rechaza con InvalidRoutineInstanceInputError si no viene ninguno de los dos', async () => {
    await expect(
      useCase.execute({ invocadoPor: profesor, alumnoId: 'alum-1', nombre: 'Full body' }),
    ).rejects.toThrow(InvalidRoutineInstanceInputError);
  });

  it('rechaza con UserNotFoundError si el alumno no existe o es de otro gym', async () => {
    userRepository.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        alumnoId: 'no-existe',
        nombre: 'Full body',
        origenTemplateId: 'tpl-1',
      }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('rechaza con AlumnoNotInCarteraError si el alumno es del mismo gym pero no está en la cartera', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(false);
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        alumnoId: 'alum-1',
        nombre: 'Full body',
        origenTemplateId: 'tpl-1',
      }),
    ).rejects.toThrow(AlumnoNotInCarteraError);
  });

  it('rechaza con RoutineTemplateNotFoundError si la plantilla no es del profesor', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(true);
    templateRepository.findById.mockResolvedValue({ ...template, profesorId: 'prof-OTRO' });
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        alumnoId: 'alum-1',
        nombre: 'Full body',
        origenTemplateId: 'tpl-1',
      }),
    ).rejects.toThrow(RoutineTemplateNotFoundError);
  });

  it('rechaza con TemplateHasNoExercisesError si la plantilla no tiene ejercicios', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(true);
    templateRepository.findById.mockResolvedValue({ ...template, ejercicios: [] });
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        alumnoId: 'alum-1',
        nombre: 'Full body',
        origenTemplateId: 'tpl-1',
      }),
    ).rejects.toThrow(TemplateHasNoExercisesError);
  });

  it('rechaza con TooManyExercisesError si arma desde cero con más de 50', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(true);
    const cincuentaYUno = Array.from({ length: 51 }, (_, i) => ({ ...unEjercicio, orden: i + 1 }));

    await expect(
      useCase.execute({
        invocadoPor: profesor,
        alumnoId: 'alum-1',
        nombre: 'Custom',
        ejercicios: cincuentaYUno,
      }),
    ).rejects.toThrow(TooManyExercisesError);
  });

  it('clona los ejercicios de la plantilla y crea la instancia', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(true);
    templateRepository.findById.mockResolvedValue(template);
    instanceRepository.crear.mockResolvedValue(instanciaCreada);

    const resultado = await useCase.execute({
      invocadoPor: profesor,
      alumnoId: 'alum-1',
      nombre: 'Full body',
      origenTemplateId: 'tpl-1',
    });

    expect(instanceRepository.crear).toHaveBeenCalledWith({
      gymId: 'gym-1',
      profesorId: 'prof-1',
      alumnoId: 'alum-1',
      nombre: 'Full body',
      origenTemplateId: 'tpl-1',
      ejercicios: [unEjercicio],
    });
    expect(resultado).toEqual(instanciaCreada);
  });

  it('arma desde cero con los ejercicios provistos, sin origenTemplateId', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(true);
    instanceRepository.crear.mockResolvedValue({ ...instanciaCreada, origenTemplateId: null });

    await useCase.execute({
      invocadoPor: profesor,
      alumnoId: 'alum-1',
      nombre: 'Custom',
      ejercicios: [unEjercicio],
    });

    expect(templateRepository.findById).not.toHaveBeenCalled();
    expect(instanceRepository.crear).toHaveBeenCalledWith({
      gymId: 'gym-1',
      profesorId: 'prof-1',
      alumnoId: 'alum-1',
      nombre: 'Custom',
      origenTemplateId: null,
      ejercicios: [unEjercicio],
    });
  });

  it('rechaza con InvalidExerciseIdError si arma desde cero con un exerciseId inexistente', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(true);
    exerciseRepository.findByIds.mockResolvedValue([]);

    await expect(
      useCase.execute({
        invocadoPor: profesor,
        alumnoId: 'alum-1',
        nombre: 'Custom',
        ejercicios: [unEjercicio],
      }),
    ).rejects.toThrow(InvalidExerciseIdError);
    expect(instanceRepository.crear).not.toHaveBeenCalled();
  });

  it('no valida el catálogo cuando clona desde plantilla (ya validado al armar la plantilla)', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(true);
    templateRepository.findById.mockResolvedValue(template);
    instanceRepository.crear.mockResolvedValue(instanciaCreada);

    await useCase.execute({
      invocadoPor: profesor,
      alumnoId: 'alum-1',
      nombre: 'Full body',
      origenTemplateId: 'tpl-1',
    });

    expect(exerciseRepository.findByIds).not.toHaveBeenCalled();
  });
});
