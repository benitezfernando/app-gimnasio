import { Role } from '../../identity/domain/role';
import { ListRoutineTemplatesUseCase } from './list-routine-templates.use-case';
import { RoutineTemplateRepositoryPort } from './ports/routine-template-repository.port';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';

describe('ListRoutineTemplatesUseCase', () => {
  let templateRepository: jest.Mocked<RoutineTemplateRepositoryPort>;
  let useCase: ListRoutineTemplatesUseCase;

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
    useCase = new ListRoutineTemplatesUseCase(templateRepository);
  });

  it('rechaza si quien invoca no es PROFESOR', async () => {
    await expect(useCase.execute({ invocadoPor: admin })).rejects.toThrow(InsufficientRoleError);
  });

  it('lista las plantillas del profesor autenticado, nunca de un profesorId externo', async () => {
    templateRepository.findByProfesor.mockResolvedValue([
      {
        id: 'tpl-1',
        gymId: 'gym-1',
        profesorId: 'prof-1',
        nombre: 'Full body',
        descripcion: null,
        activa: true,
      },
    ]);

    const resultado = await useCase.execute({ invocadoPor: profesor });

    expect(templateRepository.findByProfesor).toHaveBeenCalledWith('prof-1');
    expect(resultado).toHaveLength(1);
  });
});
