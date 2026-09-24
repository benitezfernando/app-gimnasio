import { Role } from '../../identity/domain/role';
import { ExerciseRepositoryPort } from '../../exercise-catalog/application/ports/exercise-repository.port';
import {
  crearInstanceRepositoryMock,
  crearTemplateRepositoryMock,
} from '../../test-support/repositorios-routines.mock';
import { ReplaceTemplateDaysUseCase } from './replace-template-days.use-case';
import { EjercicioItem, RoutineTemplateDetail } from './ports/routine-template-repository.port';
import { RoutineInstanceDetail } from './ports/routine-instance-repository.port';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';
import { RoutineDayNotFoundError } from './errors/routine-day-not-found.error';
import { EmptyDayError } from './errors/empty-day.error';
import { InvalidExerciseIdError } from './errors/invalid-exercise-id.error';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';

function ej(exerciseId: string, orden: number, series = 4): EjercicioItem {
  return { exerciseId, orden, series, repeticiones: 12, peso: 50, notas: null };
}

describe('ReplaceTemplateDaysUseCase', () => {
  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  let templateRepository: ReturnType<typeof crearTemplateRepositoryMock>;
  let instanceRepository: ReturnType<typeof crearInstanceRepositoryMock>;
  let exerciseRepository: jest.Mocked<Pick<ExerciseRepositoryPort, 'findByIds'>>;
  let useCase: ReplaceTemplateDaysUseCase;

  const plantilla: RoutineTemplateDetail = {
    id: 'tpl-1',
    gymId: 'gym-1',
    profesorId: 'prof-1',
    nombre: 'Split',
    descripcion: null,
    activa: true,
    dias: [
      { id: 'tday-1', numero: 1, ejercicios: [ej('ex-1', 1)] },
      { id: 'tday-2', numero: 2, ejercicios: [ej('ex-2', 1)] },
    ],
  };

  function instanciaCon(dias: RoutineInstanceDetail['dias']): RoutineInstanceDetail {
    return {
      id: 'inst-1',
      gymId: 'gym-1',
      profesorId: 'prof-1',
      alumnoId: 'alum-1',
      nombre: 'R',
      vigenteDesde: new Date(),
      vigenteHasta: null,
      activa: true,
      dias,
    };
  }

  beforeEach(() => {
    templateRepository = crearTemplateRepositoryMock();
    instanceRepository = crearInstanceRepositoryMock();
    exerciseRepository = {
      findByIds: jest.fn(async (ids: string[]) => ids.map((id) => ({ id }))),
    } as unknown as jest.Mocked<Pick<ExerciseRepositoryPort, 'findByIds'>>;
    templateRepository.findById.mockResolvedValue(plantilla);
    instanceRepository.findActivasConDiasVinculadosA.mockResolvedValue([]);
    useCase = new ReplaceTemplateDaysUseCase(
      templateRepository,
      instanceRepository,
      exerciseRepository as unknown as ExerciseRepositoryPort,
    );
  });

  it('solo PROFESOR', async () => {
    await expect(
      useCase.execute({
        invocadoPor: { ...profesor, role: Role.ADMIN },
        templateId: 'tpl-1',
        dias: [],
      }),
    ).rejects.toThrow(InsufficientRoleError);
  });

  it('plantilla de otro profesor → 404', async () => {
    await expect(
      useCase.execute({
        invocadoPor: { ...profesor, id: 'prof-2' },
        templateId: 'tpl-1',
        dias: [],
      }),
    ).rejects.toThrow(RoutineTemplateNotFoundError);
  });

  it('valida los días (día vacío → 400) antes de escribir', async () => {
    await expect(
      useCase.execute({ invocadoPor: profesor, templateId: 'tpl-1', dias: [{ ejercicios: [] }] }),
    ).rejects.toThrow(EmptyDayError);
    expect(templateRepository.guardarDias).not.toHaveBeenCalled();
  });

  it('un id de día que no es de esta plantilla → 404', async () => {
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        templateId: 'tpl-1',
        dias: [{ id: 'tday-ajeno', ejercicios: [ej('ex-1', 1)] }],
      }),
    ).rejects.toThrow(RoutineDayNotFoundError);
  });

  it('ejercicio inexistente en el catálogo → 400', async () => {
    exerciseRepository.findByIds.mockResolvedValue([]);
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        templateId: 'tpl-1',
        dias: [{ ejercicios: [ej('ex-x', 1)] }],
      }),
    ).rejects.toThrow(InvalidExerciseIdError);
  });

  it('propaga a los días de alumno vinculados conservando sus valores, en la misma llamada a guardarDias', async () => {
    instanceRepository.findActivasConDiasVinculadosA.mockResolvedValue([
      instanciaCon([
        { id: 'iday-1', numero: 1, vinculadoADiaId: 'tday-1', ejercicios: [ej('ex-1', 1, 3)] },
        { id: 'iday-2', numero: 2, vinculadoADiaId: 'tday-2', ejercicios: [ej('ex-2', 1, 5)] },
        { id: 'iday-3', numero: 3, vinculadoADiaId: null, ejercicios: [ej('ex-9', 1)] },
      ]),
    ]);
    const nuevosDias = [
      { id: 'tday-1', ejercicios: [ej('ex-1', 1), ej('ex-2', 2)] },
      { id: 'tday-2', ejercicios: [ej('ex-3', 1)] },
    ];

    await useCase.execute({ invocadoPor: profesor, templateId: 'tpl-1', dias: nuevosDias });

    expect(instanceRepository.findActivasConDiasVinculadosA).toHaveBeenCalledWith([
      'tday-1',
      'tday-2',
    ]);
    expect(templateRepository.guardarDias).toHaveBeenCalledTimes(1);
    const [templateId, dias, propagacion] = templateRepository.guardarDias.mock.calls[0];
    expect(templateId).toBe('tpl-1');
    expect(dias).toBe(nuevosDias);
    expect(propagacion).toEqual([
      // ex-2 pasó del Día 2 al Día 1 en la plantilla: conserva series 5 del alumno (prioridad 2)
      { diaInstanciaId: 'iday-1', ejercicios: [ej('ex-1', 1, 3), ej('ex-2', 2, 5)] },
      { diaInstanciaId: 'iday-2', ejercicios: [ej('ex-3', 1)] },
    ]);
  });

  it('no propaga a días de alumno cuyo día de plantilla se borra en este guardado (SetNull los desvincula)', async () => {
    instanceRepository.findActivasConDiasVinculadosA.mockResolvedValue([
      instanciaCon([
        { id: 'iday-2', numero: 1, vinculadoADiaId: 'tday-2', ejercicios: [ej('ex-2', 1)] },
      ]),
    ]);

    await useCase.execute({
      invocadoPor: profesor,
      templateId: 'tpl-1',
      dias: [{ id: 'tday-1', ejercicios: [ej('ex-1', 1)] }],
    });

    expect(templateRepository.guardarDias.mock.calls[0][2]).toEqual([]);
  });

  it('plantilla sin días previos no busca instancias', async () => {
    templateRepository.findById.mockResolvedValue({ ...plantilla, dias: [] });
    await useCase.execute({
      invocadoPor: profesor,
      templateId: 'tpl-1',
      dias: [{ ejercicios: [ej('ex-1', 1)] }],
    });
    expect(instanceRepository.findActivasConDiasVinculadosA).not.toHaveBeenCalled();
  });
});
