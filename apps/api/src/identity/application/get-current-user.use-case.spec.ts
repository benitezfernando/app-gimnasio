import { Role } from '../domain/role';
import { GetCurrentUserUseCase } from './get-current-user.use-case';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { UserNotFoundError } from './errors/user-not-found.error';

describe('GetCurrentUserUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let useCase: GetCurrentUserUseCase;

  const usuario: UserRecord = {
    id: 'user-1',
    authUserId: 'auth-1',
    gymId: 'gym-1',
    username: 'fernando',
    nombre: 'Fernando Benitez',
    role: Role.ADMIN,
    activo: true,
  };

  beforeEach(() => {
    userRepository = {
      findByAuthUserId: jest.fn(),
      findByGymIdAndUsername: jest.fn(),
      findByGymId: jest.fn(),
      findById: jest.fn(),
      deactivate: jest.fn(),
      reactivate: jest.fn(),
      create: jest.fn(),
      updateNombre: jest.fn(),
    };
    useCase = new GetCurrentUserUseCase(userRepository);
  });

  it('devuelve el UserRecord completo cuando existe', async () => {
    userRepository.findById.mockResolvedValue(usuario);

    const resultado = await useCase.execute({ userId: 'user-1' });

    expect(resultado).toEqual(usuario);
    expect(userRepository.findById).toHaveBeenCalledWith('user-1');
  });

  it('lanza UserNotFoundError si no existe', async () => {
    userRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute({ userId: 'no-existe' })).rejects.toThrow(UserNotFoundError);
  });
});
