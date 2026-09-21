import { Role } from '../../identity/domain/role';
import { DeactivateAdminUseCase } from './deactivate-admin.use-case';
import {
  UserRepositoryPort,
  UserRecord,
} from '../../identity/application/ports/user-repository.port';
import { UserNotFoundError } from '../../identity/application/errors/user-not-found.error';

describe('DeactivateAdminUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let useCase: DeactivateAdminUseCase;

  const adminDeCualquierGym: UserRecord = {
    id: 'admin-1',
    authUserId: 'auth-admin',
    gymId: 'gym-lejano',
    username: 'admin1',
    nombre: 'Admin',
    role: Role.ADMIN,
    activo: true,
  };
  const noAdmin: UserRecord = { ...adminDeCualquierGym, id: 'prof-1', role: Role.PROFESOR };

  beforeEach(() => {
    userRepository = {
      findByAuthUserId: jest.fn(),
      findByGymIdAndUsername: jest.fn(),
      findByGymId: jest.fn(),
      findById: jest.fn(),
      deactivate: jest.fn(),
      create: jest.fn(),
      updateNombre: jest.fn(),
    };
    useCase = new DeactivateAdminUseCase(userRepository);
  });

  it('desactiva un ADMIN de cualquier gym (sin restricción de gym)', async () => {
    userRepository.findById.mockResolvedValue(adminDeCualquierGym);
    userRepository.deactivate.mockResolvedValue({ ...adminDeCualquierGym, activo: false });

    const resultado = await useCase.execute({ adminId: adminDeCualquierGym.id });

    expect(userRepository.deactivate).toHaveBeenCalledWith(adminDeCualquierGym.id);
    expect(resultado.activo).toBe(false);
  });

  it('rechaza si el id no corresponde a un ADMIN', async () => {
    userRepository.findById.mockResolvedValue(noAdmin);

    await expect(useCase.execute({ adminId: noAdmin.id })).rejects.toThrow(UserNotFoundError);
  });

  it('rechaza si el id no existe', async () => {
    userRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute({ adminId: 'no-existe' })).rejects.toThrow(UserNotFoundError);
  });
});
