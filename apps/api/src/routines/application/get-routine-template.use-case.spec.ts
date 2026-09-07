import { Role } from '../../identity/domain/role';
import { GetRoutineTemplateUseCase } from './get-routine-template.use-case';
import {
  RoutineTemplateRepositoryPort,
  RoutineTemplateDetail,
} from './ports/routine-template-repository.port';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';

describe('GetRoutineTemplateUseCase', () => {
  let templateRepository: jest.Mocked<RoutineTemplateRepositoryPort>;
  let useCase: GetRoutineTemplateUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const otroProfesor = { id: 'prof-2', gymId: 'gym-1', role: Role.PROFESOR };

  const detalle: RoutineTemplateDetail = {
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
    useCase = new GetRoutineTemplateUseCase(templateRepository);
  });

  it('rechaza si quien invoca no es PROFESOR', async () => {
    await expect(
      useCase.execute({
        invocadoPor: { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN },
        templateId: 'tpl-1',
      }),
    ).rejects.toThrow(InsufficientRoleError);
  });

  it('lanza RoutineTemplateNotFoundError si no existe', async () => {
    templateRepository.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({ invocadoPor: profesor, templateId: 'no-existe' }),
    ).rejects.toThrow(RoutineTemplateNotFoundError);
  });

  it('lanza RoutineTemplateNotFoundError (no 403) si la plantilla es de otro profesor', async () => {
    templateRepository.findById.mockResolvedValue(detalle);
    await expect(
      useCase.execute({ invocadoPor: otroProfesor, templateId: 'tpl-1' }),
    ).rejects.toThrow(RoutineTemplateNotFoundError);
  });

  it('devuelve el detalle si es del profesor invocador', async () => {
    templateRepository.findById.mockResolvedValue(detalle);
    const resultado = await useCase.execute({ invocadoPor: profesor, templateId: 'tpl-1' });
    expect(resultado).toEqual(detalle);
  });
});
