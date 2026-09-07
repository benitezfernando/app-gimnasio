import { Role } from '../../identity/domain/role';
import { GetMiRutinaVigenteUseCase } from './get-mi-rutina-vigente.use-case';
import {
  RoutineInstanceRepositoryPort,
  RoutineInstanceDetail,
} from './ports/routine-instance-repository.port';
import {
  ExerciseRepositoryPort,
  ExerciseSummary,
} from '../../exercise-catalog/application/ports/exercise-repository.port';

describe('GetMiRutinaVigenteUseCase', () => {
  let instanceRepository: jest.Mocked<RoutineInstanceRepositoryPort>;
  let exerciseRepository: jest.Mocked<ExerciseRepositoryPort>;
  let useCase: GetMiRutinaVigenteUseCase;

  const alumno = { id: 'alum-1', gymId: 'gym-1', role: Role.ALUMNO };

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
        peso: null,
        descanso: 60,
        notas: null,
      },
    ],
  };

  const ejercicioResuelto: ExerciseSummary = {
    id: 'ex-1',
    nombre: 'Sentadilla',
    imageUrl: null,
    gifUrl: 'https://x/anim.gif',
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
    exerciseRepository = { findMany: jest.fn(), findById: jest.fn(), findByIds: jest.fn() };
    useCase = new GetMiRutinaVigenteUseCase(instanceRepository, exerciseRepository);
  });

  it('siempre resuelve la rutina del propio invocadoPor.id, nunca de un alumnoId ajeno', async () => {
    instanceRepository.findVigentePorAlumno.mockResolvedValue(instancia);
    exerciseRepository.findByIds.mockResolvedValue([ejercicioResuelto]);

    await useCase.execute({ invocadoPor: alumno });

    expect(instanceRepository.findVigentePorAlumno).toHaveBeenCalledWith('alum-1');
  });

  it('devuelve null si no hay rutina vigente (HU-08, estado vacío)', async () => {
    instanceRepository.findVigentePorAlumno.mockResolvedValue(null);

    const resultado = await useCase.execute({ invocadoPor: alumno });

    expect(resultado).toBeNull();
  });
});
