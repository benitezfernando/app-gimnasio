import { Role } from '../../identity/domain/role';
import { UpdateRoutineInstanceUseCase } from './update-routine-instance.use-case';
import {
  RoutineInstanceRepositoryPort,
  RoutineInstanceDetail,
} from './ports/routine-instance-repository.port';
import { CarteraRepositoryPort } from '../../identity/application/ports/cartera-repository.port';
import { RoutineInstanceNotFoundError } from './errors/routine-instance-not-found.error';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';

describe('UpdateRoutineInstanceUseCase', () => {
  let instanceRepository: jest.Mocked<RoutineInstanceRepositoryPort>;
  let carteraRepository: jest.Mocked<CarteraRepositoryPort>;
  let useCase: UpdateRoutineInstanceUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const otroProfesor = { id: 'prof-2', gymId: 'gym-1', role: Role.PROFESOR };

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
    useCase = new UpdateRoutineInstanceUseCase(instanceRepository, carteraRepository);
  });

  it('lanza RoutineInstanceNotFoundError si no existe', async () => {
    instanceRepository.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({ invocadoPor: profesor, instanceId: 'no-existe', nombre: 'Nuevo' }),
    ).rejects.toThrow(RoutineInstanceNotFoundError);
  });

  it('permite editar si el alumno de la instancia está en la cartera del invocador, aunque otro profesor la haya creado', async () => {
    instanceRepository.findById.mockResolvedValue(instancia);
    carteraRepository.existe.mockResolvedValue(true);
    instanceRepository.update.mockResolvedValue({ ...instancia, nombre: 'Actualizada' });

    const resultado = await useCase.execute({
      invocadoPor: otroProfesor,
      instanceId: 'inst-1',
      nombre: 'Actualizada',
    });

    expect(carteraRepository.existe).toHaveBeenCalledWith('prof-2', 'alum-1');
    expect(resultado.nombre).toBe('Actualizada');
  });

  it('rechaza con AlumnoNotInCarteraError si el alumno no está en la cartera del invocador', async () => {
    instanceRepository.findById.mockResolvedValue(instancia);
    carteraRepository.existe.mockResolvedValue(false);
    await expect(
      useCase.execute({ invocadoPor: otroProfesor, instanceId: 'inst-1', nombre: 'Actualizada' }),
    ).rejects.toThrow(AlumnoNotInCarteraError);
  });

  it('lanza RoutineInstanceNotFoundError (no AlumnoNotInCarteraError) si la instancia pertenece a otro gym', async () => {
    instanceRepository.findById.mockResolvedValue({ ...instancia, gymId: 'gym-OTRO' });
    await expect(
      useCase.execute({ invocadoPor: profesor, instanceId: 'inst-1', nombre: 'Actualizada' }),
    ).rejects.toThrow(RoutineInstanceNotFoundError);
    expect(carteraRepository.existe).not.toHaveBeenCalled();
  });
});
