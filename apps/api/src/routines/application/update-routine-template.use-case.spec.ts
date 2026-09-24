import { Role } from '../../identity/domain/role';
import { UpdateRoutineTemplateUseCase } from './update-routine-template.use-case';
import {
  RoutineTemplateRepositoryPort,
  RoutineTemplateDetail,
} from './ports/routine-template-repository.port';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';
import { crearTemplateRepositoryMock } from '../../test-support/repositorios-routines.mock';

describe('UpdateRoutineTemplateUseCase', () => {
  let templateRepository: jest.Mocked<RoutineTemplateRepositoryPort>;
  let useCase: UpdateRoutineTemplateUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };

  const detalle: RoutineTemplateDetail = {
    id: 'tpl-1',
    gymId: 'gym-1',
    profesorId: 'prof-1',
    nombre: 'Full body',
    descripcion: null,
    activa: true,
    dias: [],
  };

  beforeEach(() => {
    templateRepository = crearTemplateRepositoryMock();
    useCase = new UpdateRoutineTemplateUseCase(templateRepository);
  });

  it('lanza RoutineTemplateNotFoundError si no es del profesor invocador', async () => {
    templateRepository.findById.mockResolvedValue({ ...detalle, profesorId: 'prof-OTRO' });
    await expect(
      useCase.execute({ invocadoPor: profesor, templateId: 'tpl-1', nombre: 'Nuevo nombre' }),
    ).rejects.toThrow(RoutineTemplateNotFoundError);
    expect(templateRepository.update).not.toHaveBeenCalled();
  });

  it('actualiza nombre/descripcion/activa si es del profesor invocador', async () => {
    templateRepository.findById.mockResolvedValue(detalle);
    templateRepository.update.mockResolvedValue({
      ...detalle,
      nombre: 'Nuevo nombre',
      activa: false,
    });

    const resultado = await useCase.execute({
      invocadoPor: profesor,
      templateId: 'tpl-1',
      nombre: 'Nuevo nombre',
      activa: false,
    });

    expect(templateRepository.update).toHaveBeenCalledWith('tpl-1', {
      nombre: 'Nuevo nombre',
      descripcion: undefined,
      activa: false,
    });
    expect(resultado.nombre).toBe('Nuevo nombre');
  });
});
