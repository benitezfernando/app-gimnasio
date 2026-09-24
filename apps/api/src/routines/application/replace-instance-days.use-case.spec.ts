import { Role } from '../../identity/domain/role';
import { CarteraRepositoryPort } from '../../identity/application/ports/cartera-repository.port';
import { ExerciseRepositoryPort } from '../../exercise-catalog/application/ports/exercise-repository.port';
import {
  crearInstanceRepositoryMock,
  crearTemplateRepositoryMock,
} from '../../test-support/repositorios-routines.mock';
import { ReplaceInstanceDaysUseCase } from './replace-instance-days.use-case';
import { EjercicioItem } from './ports/routine-template-repository.port';
import { RoutineInstanceDetail } from './ports/routine-instance-repository.port';
import { RoutineInstanceNotFoundError } from './errors/routine-instance-not-found.error';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';
import { RoutineDayNotFoundError } from './errors/routine-day-not-found.error';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';

function ej(exerciseId: string, orden = 1, series = 3): EjercicioItem {
  return { exerciseId, orden, series, repeticiones: 10, peso: null, notas: null };
}

describe('ReplaceInstanceDaysUseCase', () => {
  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const referencia = (id: string, exerciseIds: string[], profesorId = 'prof-1') => ({
    id,
    numero: 1,
    templateId: 'tpl-1',
    templateNombre: 'T',
    profesorId,
    gymId: 'gym-1',
    exerciseIds,
  });

  const instancia: RoutineInstanceDetail = {
    id: 'inst-1',
    gymId: 'gym-1',
    profesorId: 'prof-1',
    alumnoId: 'alum-1',
    nombre: 'R',
    vigenteDesde: new Date(),
    vigenteHasta: null,
    activa: true,
    dias: [
      { id: 'd1', numero: 1, vinculadoADiaId: 'tday-1', ejercicios: [ej('ex-1'), ej('ex-2', 2)] },
      { id: 'd2', numero: 2, vinculadoADiaId: 'tday-2', ejercicios: [ej('ex-3')] },
      { id: 'd3', numero: 3, vinculadoADiaId: null, ejercicios: [ej('ex-4')] },
    ],
  };

  let instanceRepository: ReturnType<typeof crearInstanceRepositoryMock>;
  let templateRepository: ReturnType<typeof crearTemplateRepositoryMock>;
  let carteraRepository: jest.Mocked<Pick<CarteraRepositoryPort, 'existe'>>;
  let useCase: ReplaceInstanceDaysUseCase;

  beforeEach(() => {
    instanceRepository = crearInstanceRepositoryMock();
    templateRepository = crearTemplateRepositoryMock();
    carteraRepository = { existe: jest.fn().mockResolvedValue(true) };
    instanceRepository.findById.mockResolvedValue(instancia);
    templateRepository.findDiasByIds.mockResolvedValue([
      referencia('tday-1', ['ex-1', 'ex-2']),
      referencia('tday-2', ['ex-3'], 'prof-2'),
    ]);
    const exerciseRepository = {
      findByIds: jest.fn(async (ids: string[]) => ids.map((id) => ({ id }))),
    } as unknown as ExerciseRepositoryPort;
    useCase = new ReplaceInstanceDaysUseCase(
      instanceRepository,
      templateRepository,
      carteraRepository as unknown as CarteraRepositoryPort,
      exerciseRepository,
    );
  });

  function guardado() {
    return instanceRepository.guardarDias.mock.calls[0][1];
  }

  it('instancia de otro gym → 404', async () => {
    instanceRepository.findById.mockResolvedValue({ ...instancia, gymId: 'gym-2' });
    await expect(
      useCase.execute({ invocadoPor: profesor, instanceId: 'inst-1', dias: [] }),
    ).rejects.toThrow(RoutineInstanceNotFoundError);
  });

  it('alumno fuera de la cartera → 403', async () => {
    carteraRepository.existe.mockResolvedValue(false);
    await expect(
      useCase.execute({ invocadoPor: profesor, instanceId: 'inst-1', dias: [] }),
    ).rejects.toThrow(AlumnoNotInCarteraError);
  });

  it('id de día ajeno a la instancia → 404', async () => {
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        instanceId: 'inst-1',
        dias: [{ id: 'dx', ejercicios: [ej('ex-1')] }],
      }),
    ).rejects.toThrow(RoutineDayNotFoundError);
  });

  it('cambiar series o reordenar días no desvincula nada', async () => {
    const resultado = await useCase.execute({
      invocadoPor: profesor,
      instanceId: 'inst-1',
      dias: [
        { id: 'd3', ejercicios: [ej('ex-4')] },
        { id: 'd1', vinculadoADiaId: 'tday-1', ejercicios: [ej('ex-2', 1, 9), ej('ex-1', 2)] },
        { id: 'd2', vinculadoADiaId: 'tday-2', ejercicios: [ej('ex-3')] },
      ],
    });
    expect(guardado().map((d) => [d.id, d.vinculadoADiaId])).toEqual([
      ['d3', null],
      ['d1', 'tday-1'],
      ['d2', 'tday-2'],
    ]);
    expect(resultado).toEqual({ diasDesvinculados: [] });
  });

  it('agregar un ejercicio desvincula solo ese día e informa su número nuevo', async () => {
    const resultado = await useCase.execute({
      invocadoPor: profesor,
      instanceId: 'inst-1',
      dias: [
        { id: 'd2', vinculadoADiaId: 'tday-2', ejercicios: [ej('ex-3')] },
        {
          id: 'd1',
          vinculadoADiaId: 'tday-1',
          ejercicios: [ej('ex-1'), ej('ex-2', 2), ej('ex-5', 3)],
        },
      ],
    });
    expect(guardado().map((d) => d.vinculadoADiaId)).toEqual(['tday-2', null]);
    expect(resultado).toEqual({ diasDesvinculados: [2] });
  });

  it('mover un ejercicio de día desvincula los dos días', async () => {
    const resultado = await useCase.execute({
      invocadoPor: profesor,
      instanceId: 'inst-1',
      dias: [
        { id: 'd1', vinculadoADiaId: 'tday-1', ejercicios: [ej('ex-1')] },
        { id: 'd2', vinculadoADiaId: 'tday-2', ejercicios: [ej('ex-3'), ej('ex-2', 2)] },
      ],
    });
    expect(resultado).toEqual({ diasDesvinculados: [1, 2] });
  });

  it('conserva un vínculo existente a la plantilla de otro profesor de la cartera', async () => {
    await useCase.execute({
      invocadoPor: profesor,
      instanceId: 'inst-1',
      dias: [{ id: 'd2', vinculadoADiaId: 'tday-2', ejercicios: [ej('ex-3', 1, 7)] }],
    });
    expect(guardado()[0].vinculadoADiaId).toBe('tday-2');
  });

  it('vincular un día a la plantilla de otro profesor → 404', async () => {
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        instanceId: 'inst-1',
        dias: [{ id: 'd3', vinculadoADiaId: 'tday-2', ejercicios: [ej('ex-3')] }],
      }),
    ).rejects.toThrow(RoutineTemplateNotFoundError);
  });

  it('reemplazar un día importando otro día de plantilla sin tocarlo lo vincula al nuevo', async () => {
    templateRepository.findDiasByIds.mockResolvedValue([referencia('tday-7', ['ex-6'])]);
    await useCase.execute({
      invocadoPor: profesor,
      instanceId: 'inst-1',
      dias: [{ id: 'd3', vinculadoADiaId: 'tday-7', ejercicios: [ej('ex-6')] }],
    });
    expect(guardado()[0]).toEqual({
      id: 'd3',
      vinculadoADiaId: 'tday-7',
      ejercicios: [ej('ex-6')],
    });
  });
});
