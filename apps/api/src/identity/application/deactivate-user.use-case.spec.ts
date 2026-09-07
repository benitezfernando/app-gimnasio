import { Role } from '../domain/role';
import { DeactivateUserUseCase } from './deactivate-user.use-case';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { InsufficientRoleError } from './errors/insufficient-role.error';
import { UserNotFoundError } from './errors/user-not-found.error';
import { CannotTargetAdminError } from './errors/cannot-target-admin.error';

describe('DeactivateUserUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let useCase: DeactivateUserUseCase;

  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };
  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };

  const usuarioObjetivo: UserRecord = {
    id: 'target-1',
    authUserId: 'auth-target',
    gymId: 'gym-1',
    username: 'juan.perez',
    nombre: 'Juan Perez',
    role: Role.ALUMNO,
    activo: true,
  };

  beforeEach(() => {
    userRepository = {
      findByAuthUserId: jest.fn(),
      findByGymIdAndUsername: jest.fn(),
      findByGymId: jest.fn(),
      findById: jest.fn(),
      deactivate: jest.fn(),
      create: jest.fn(),
    };
    useCase = new DeactivateUserUseCase(userRepository);
  });

  it('rechaza si quien invoca no es ADMIN', async () => {
    await expect(useCase.execute({ invocadoPor: profesor, userId: 'target-1' })).rejects.toThrow(
      InsufficientRoleError,
    );
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it('rechaza con UserNotFoundError si el usuario no existe', async () => {
    userRepository.findById.mockResolvedValue(null);
    await expect(useCase.execute({ invocadoPor: admin, userId: 'no-existe' })).rejects.toThrow(
      UserNotFoundError,
    );
    expect(userRepository.deactivate).not.toHaveBeenCalled();
  });

  it('rechaza con UserNotFoundError si el usuario existe pero es de otro gym', async () => {
    userRepository.findById.mockResolvedValue({ ...usuarioObjetivo, gymId: 'gym-OTRO' });
    await expect(useCase.execute({ invocadoPor: admin, userId: 'target-1' })).rejects.toThrow(
      UserNotFoundError,
    );
    expect(userRepository.deactivate).not.toHaveBeenCalled();
  });

  it('rechaza con CannotTargetAdminError si el objetivo es ADMIN (incluso a sí mismo)', async () => {
    const otroAdmin: UserRecord = { ...usuarioObjetivo, id: 'admin-2', role: Role.ADMIN };
    userRepository.findById.mockResolvedValue(otroAdmin);

    await expect(useCase.execute({ invocadoPor: admin, userId: 'admin-2' })).rejects.toThrow(
      CannotTargetAdminError,
    );
    expect(userRepository.deactivate).not.toHaveBeenCalled();
  });

  it('ADMIN desactiva un usuario de su propio gym (baja lógica, no delete)', async () => {
    userRepository.findById.mockResolvedValue(usuarioObjetivo);
    userRepository.deactivate.mockResolvedValue({ ...usuarioObjetivo, activo: false });

    const resultado = await useCase.execute({ invocadoPor: admin, userId: 'target-1' });

    expect(userRepository.deactivate).toHaveBeenCalledWith('target-1');
    expect(resultado.activo).toBe(false);
  });
});
