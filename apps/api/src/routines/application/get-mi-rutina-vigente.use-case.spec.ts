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
import { crearInstanceRepositoryMock } from '../../test-support/repositorios-routines.mock';

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
    vigenteDesde: new Date(),
    vigenteHasta: null,
    activa: true,
    dias: [
      {
        id: 'iday-1',
        numero: 1,
        vinculadoADiaId: null,
        ejercicios: [
          {
            exerciseId: 'ex-1',
            orden: 1,
            series: 3,
            repeticiones: 10,
            peso: null,
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
    imageUrl: null,
    gifUrl: 'https://x/anim.gif',
    parteCuerpo: 'upper legs',
    grupoMuscular: 'quads',
    equipamiento: 'barbell',
  };

  beforeEach(() => {
    instanceRepository = crearInstanceRepositoryMock();
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

  it('resuelve los ejercicios de todos los días con un solo findByIds, sin duplicar ids', async () => {
    instanceRepository.findVigentePorAlumno.mockResolvedValue({
      ...instancia,
      dias: [
        {
          id: 'd1',
          numero: 1,
          vinculadoADiaId: null,
          ejercicios: [
            { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10, peso: null, notas: null },
          ],
        },
        {
          id: 'd2',
          numero: 2,
          vinculadoADiaId: 'tday-9',
          ejercicios: [
            { exerciseId: 'ex-1', orden: 1, series: 4, repeticiones: 8, peso: null, notas: null },
          ],
        },
      ],
    });
    exerciseRepository.findByIds.mockResolvedValue([
      {
        id: 'ex-1',
        nombre: 'Sentadilla',
        nombreOriginal: null,
        imageUrl: null,
        gifUrl: null,
        parteCuerpo: 'p',
        grupoMuscular: 'g',
        equipamiento: null,
      },
    ]);

    const salida = await useCase.execute({ invocadoPor: alumno });

    expect(exerciseRepository.findByIds).toHaveBeenCalledTimes(1);
    expect(exerciseRepository.findByIds).toHaveBeenCalledWith(['ex-1']);
    expect(salida?.dias.map((d) => [d.numero, d.ejercicios[0].series])).toEqual([
      [1, 3],
      [2, 4],
    ]);
    expect(JSON.stringify(salida)).not.toContain('tday-9');
  });
});
