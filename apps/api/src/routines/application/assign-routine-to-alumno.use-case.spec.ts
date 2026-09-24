import { Role } from '../../identity/domain/role';
import { CarteraRepositoryPort } from '../../identity/application/ports/cartera-repository.port';
import {
  UserRecord,
  UserRepositoryPort,
} from '../../identity/application/ports/user-repository.port';
import { ExerciseRepositoryPort } from '../../exercise-catalog/application/ports/exercise-repository.port';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import {
  crearInstanceRepositoryMock,
  crearTemplateRepositoryMock,
} from '../../test-support/repositorios-routines.mock';
import { AssignRoutineToAlumnoUseCase } from './assign-routine-to-alumno.use-case';
import { EjercicioItem } from './ports/routine-template-repository.port';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';
import { InvalidRoutineInstanceInputError } from './errors/invalid-routine-instance-input.error';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';
import { TooManyDaysError } from './errors/too-many-days.error';

function ej(exerciseId: string, orden = 1): EjercicioItem {
  return { exerciseId, orden, series: 3, repeticiones: 10, peso: null, notas: null };
}

describe('AssignRoutineToAlumnoUseCase', () => {
  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const alumno: UserRecord = {
    id: 'alum-1',
    authUserId: 'auth-alum',
    gymId: 'gym-1',
    username: 'juan.perez',
    nombre: 'Juan',
    role: Role.ALUMNO,
    activo: true,
  };
  const refPiernas = {
    id: 'tday-1',
    numero: 1,
    templateId: 'tpl-1',
    templateNombre: 'Piernas',
    profesorId: 'prof-1',
    gymId: 'gym-1',
    exerciseIds: ['ex-1'],
  };

  let instanceRepository: ReturnType<typeof crearInstanceRepositoryMock>;
  let templateRepository: ReturnType<typeof crearTemplateRepositoryMock>;
  let carteraRepository: jest.Mocked<Pick<CarteraRepositoryPort, 'existe'>>;
  let userRepository: jest.Mocked<Pick<UserRepositoryPort, 'findById'>>;
  let exerciseRepository: jest.Mocked<Pick<ExerciseRepositoryPort, 'findByIds'>>;
  let useCase: AssignRoutineToAlumnoUseCase;

  beforeEach(() => {
    instanceRepository = crearInstanceRepositoryMock();
    templateRepository = crearTemplateRepositoryMock();
    carteraRepository = { existe: jest.fn().mockResolvedValue(true) };
    userRepository = { findById: jest.fn().mockResolvedValue(alumno) };
    exerciseRepository = {
      findByIds: jest.fn(async (ids: string[]) => ids.map((id) => ({ id }))),
    } as unknown as jest.Mocked<Pick<ExerciseRepositoryPort, 'findByIds'>>;
    templateRepository.findDiasByIds.mockResolvedValue([]);
    instanceRepository.crear.mockImplementation(async (data) => ({
      id: 'inst-nueva',
      gymId: data.gymId,
      profesorId: data.profesorId,
      alumnoId: data.alumnoId,
      nombre: data.nombre,
      vigenteDesde: new Date(),
      vigenteHasta: null,
      activa: true,
      dias: data.dias.map((d, i) => ({
        id: `d${i}`,
        numero: i + 1,
        vinculadoADiaId: d.vinculadoADiaId,
        ejercicios: d.ejercicios,
      })),
    }));
    useCase = new AssignRoutineToAlumnoUseCase(
      instanceRepository,
      templateRepository,
      carteraRepository as unknown as CarteraRepositoryPort,
      userRepository as unknown as UserRepositoryPort,
      exerciseRepository as unknown as ExerciseRepositoryPort,
    );
  });

  it('solo PROFESOR', async () => {
    await expect(
      useCase.execute({
        invocadoPor: { ...profesor, role: Role.ADMIN },
        alumnoId: 'alum-1',
        nombre: 'R',
        dias: [{ ejercicios: [ej('ex-1')] }],
      }),
    ).rejects.toThrow(InsufficientRoleError);
  });

  it('sin días → 400', async () => {
    await expect(
      useCase.execute({ invocadoPor: profesor, alumnoId: 'alum-1', nombre: 'R', dias: [] }),
    ).rejects.toThrow(InvalidRoutineInstanceInputError);
  });

  it('alumno fuera de la cartera → 403', async () => {
    carteraRepository.existe.mockResolvedValue(false);
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        alumnoId: 'alum-1',
        nombre: 'R',
        dias: [{ ejercicios: [ej('ex-1')] }],
      }),
    ).rejects.toThrow(AlumnoNotInCarteraError);
  });

  it('valida límites de días', async () => {
    const dias = Array.from({ length: 8 }, (_, i) => ({ ejercicios: [ej(`ex-${i}`)] }));
    await expect(
      useCase.execute({ invocadoPor: profesor, alumnoId: 'alum-1', nombre: 'R', dias }),
    ).rejects.toThrow(TooManyDaysError);
  });

  it('combina días vinculados y desde cero, y aplica la regla de vínculo', async () => {
    templateRepository.findDiasByIds.mockResolvedValue([refPiernas]);

    await useCase.execute({
      invocadoPor: profesor,
      alumnoId: 'alum-1',
      nombre: 'Mi split',
      dias: [
        { vinculadoADiaId: 'tday-1', ejercicios: [ej('ex-1')] },
        { vinculadoADiaId: 'tday-1', ejercicios: [ej('ex-1'), ej('ex-2', 2)] },
        { ejercicios: [ej('ex-3')] },
      ],
    });

    expect(templateRepository.findDiasByIds).toHaveBeenCalledWith(['tday-1']);
    expect(instanceRepository.crear.mock.calls[0][0].dias.map((d) => d.vinculadoADiaId)).toEqual([
      'tday-1',
      null,
      null,
    ]);
  });

  it('vincular a un día de plantilla ajena → 404', async () => {
    templateRepository.findDiasByIds.mockResolvedValue([{ ...refPiernas, profesorId: 'prof-2' }]);
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        alumnoId: 'alum-1',
        nombre: 'R',
        dias: [{ vinculadoADiaId: 'tday-1', ejercicios: [ej('ex-1')] }],
      }),
    ).rejects.toThrow(RoutineTemplateNotFoundError);
  });

  it('sin nombre y todos los días vinculados a la misma plantilla → usa el nombre de la plantilla', async () => {
    templateRepository.findDiasByIds.mockResolvedValue([refPiernas]);
    await useCase.execute({
      invocadoPor: profesor,
      alumnoId: 'alum-1',
      dias: [{ vinculadoADiaId: 'tday-1', ejercicios: [ej('ex-1')] }],
    });
    expect(instanceRepository.crear.mock.calls[0][0].nombre).toBe('Piernas');
  });

  it('sin nombre y algún día independiente → 400', async () => {
    templateRepository.findDiasByIds.mockResolvedValue([refPiernas]);
    await expect(
      useCase.execute({
        invocadoPor: profesor,
        alumnoId: 'alum-1',
        dias: [
          { vinculadoADiaId: 'tday-1', ejercicios: [ej('ex-1')] },
          { ejercicios: [ej('ex-2')] },
        ],
      }),
    ).rejects.toThrow(InvalidRoutineInstanceInputError);
  });
});
