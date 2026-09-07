import { resolveUserInGym } from './resolve-user-in-gym';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { UserNotFoundError } from './errors/user-not-found.error';
import { Role } from '../domain/role';

describe('resolveUserInGym', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;

  const usuario: UserRecord = {
    id: 'user-1',
    authUserId: 'auth-1',
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
  });

  it('devuelve el usuario si existe y es del gym pedido', async () => {
    userRepository.findById.mockResolvedValue(usuario);

    const resultado = await resolveUserInGym(userRepository, 'user-1', 'gym-1');

    expect(resultado).toEqual(usuario);
  });

  it('lanza UserNotFoundError si no existe', async () => {
    userRepository.findById.mockResolvedValue(null);

    await expect(resolveUserInGym(userRepository, 'no-existe', 'gym-1')).rejects.toThrow(
      UserNotFoundError,
    );
  });

  it('lanza UserNotFoundError (no otro tipo de error) si es de otro gym', async () => {
    userRepository.findById.mockResolvedValue({ ...usuario, gymId: 'gym-OTRO' });

    await expect(resolveUserInGym(userRepository, 'user-1', 'gym-1')).rejects.toThrow(
      UserNotFoundError,
    );
  });
});
