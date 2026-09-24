import { RoutineTemplateRepositoryPort } from '../routines/application/ports/routine-template-repository.port';
import { RoutineInstanceRepositoryPort } from '../routines/application/ports/routine-instance-repository.port';

export function crearTemplateRepositoryMock(): jest.Mocked<RoutineTemplateRepositoryPort> {
  return {
    findByProfesor: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findDiasByIds: jest.fn(),
    guardarDias: jest.fn(),
  };
}

export function crearInstanceRepositoryMock(): jest.Mocked<RoutineInstanceRepositoryPort> {
  return {
    findVigentePorAlumno: jest.fn(),
    findById: jest.fn(),
    findActivasConDiasVinculadosA: jest.fn(),
    crear: jest.fn(),
    update: jest.fn(),
    guardarDias: jest.fn(),
  };
}
