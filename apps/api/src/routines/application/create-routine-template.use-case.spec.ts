import { Role } from '../../identity/domain/role';
import { CreateRoutineTemplateUseCase } from './create-routine-template.use-case';
import { RoutineTemplateRepositoryPort } from './ports/routine-template-repository.port';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';

describe('CreateRoutineTemplateUseCase', () => {
  let templateRepository: jest.Mocked<RoutineTemplateRepositoryPort>;
  let useCase: CreateRoutineTemplateUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };

  beforeEach(() => {
    templateRepository = {
      findByProfesor: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      replaceExercises: jest.fn(),
    };
    useCase = new CreateRoutineTemplateUseCase(templateRepository);
  });

  it('rechaza si quien invoca no es PROFESOR', async () => {
    await expect(useCase.execute({ invocadoPor: admin, nombre: 'Full body' })).rejects.toThrow(
      InsufficientRoleError,
    );
    expect(templateRepository.create).not.toHaveBeenCalled();
  });

  it('crea la plantilla con el gymId y profesorId del invocador', async () => {
    templateRepository.create.mockResolvedValue({
      id: 'tpl-1',
      gymId: 'gym-1',
      profesorId: 'prof-1',
      nombre: 'Full body',
      descripcion: null,
      activa: true,
    });

    const resultado = await useCase.execute({ invocadoPor: profesor, nombre: 'Full body' });

    expect(templateRepository.create).toHaveBeenCalledWith({
      gymId: 'gym-1',
      profesorId: 'prof-1',
      nombre: 'Full body',
      descripcion: null,
    });
    expect(resultado.id).toBe('tpl-1');
  });
});
