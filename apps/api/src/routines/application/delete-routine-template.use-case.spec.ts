import { Role } from '../../identity/domain/role';
import { DeleteRoutineTemplateUseCase } from './delete-routine-template.use-case';
import {
  RoutineTemplateRepositoryPort,
  RoutineTemplateDetail,
} from './ports/routine-template-repository.port';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';
import { TemplateNotInactiveError } from './errors/template-not-inactive.error';

describe('DeleteRoutineTemplateUseCase', () => {
  let templateRepository: jest.Mocked<RoutineTemplateRepositoryPort>;
  let useCase: DeleteRoutineTemplateUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };

  const detalleActiva: RoutineTemplateDetail = {
    id: 'tpl-1',
    gymId: 'gym-1',
    profesorId: 'prof-1',
    nombre: 'Full body',
    descripcion: null,
    activa: true,
    ejercicios: [],
  };

  beforeEach(() => {
    templateRepository = {
      findByProfesor: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      replaceExercises: jest.fn(),
    };
    useCase = new DeleteRoutineTemplateUseCase(templateRepository);
  });

  it('lanza RoutineTemplateNotFoundError si no es del profesor invocador', async () => {
    templateRepository.findById.mockResolvedValue({ ...detalleActiva, profesorId: 'prof-OTRO' });
    await expect(useCase.execute({ invocadoPor: profesor, templateId: 'tpl-1' })).rejects.toThrow(
      RoutineTemplateNotFoundError,
    );
  });

  it('lanza TemplateNotInactiveError si la plantilla está activa (gate del hard-delete)', async () => {
    templateRepository.findById.mockResolvedValue(detalleActiva);
    await expect(useCase.execute({ invocadoPor: profesor, templateId: 'tpl-1' })).rejects.toThrow(
      TemplateNotInactiveError,
    );
    expect(templateRepository.delete).not.toHaveBeenCalled();
  });

  it('elimina si está desactivada', async () => {
    templateRepository.findById.mockResolvedValue({ ...detalleActiva, activa: false });
    await useCase.execute({ invocadoPor: profesor, templateId: 'tpl-1' });
    expect(templateRepository.delete).toHaveBeenCalledWith('tpl-1');
  });
});
