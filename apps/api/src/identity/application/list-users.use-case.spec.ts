import { Role } from '../domain/role';
import { ListUsersUseCase } from './list-users.use-case';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { InsufficientRoleError } from './errors/insufficient-role.error';

describe('ListUsersUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let useCase: ListUsersUseCase;

  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };
  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };

  const usuariosDelGym: UserRecord[] = [
    {
      id: 'u1',
      authUserId: 'a1',
      gymId: 'gym-1',
      username: 'prof1',
      nombre: 'A',
      role: Role.PROFESOR,
      activo: true,
    },
    {
      id: 'u2',
      authUserId: 'a2',
      gymId: 'gym-1',
      username: 'juan.perez',
      nombre: 'B',
      role: Role.ALUMNO,
      activo: true,
    },
  ];

  beforeEach(() => {
    userRepository = {
      findByAuthUserId: jest.fn(),
      findByGymIdAndUsername: jest.fn(),
      findByGymId: jest.fn(),
      findById: jest.fn(),
      deactivate: jest.fn(),
      create: jest.fn(),
    };
    useCase = new ListUsersUseCase(userRepository);
  });

  it('rechaza si quien invoca no es ADMIN', async () => {
    await expect(useCase.execute({ invocadoPor: profesor })).rejects.toThrow(InsufficientRoleError);
    expect(userRepository.findByGymId).not.toHaveBeenCalled();
  });

  it('ADMIN lista los usuarios de SU gym, sin filtro de rol', async () => {
    userRepository.findByGymId.mockResolvedValue(usuariosDelGym);

    const resultado = await useCase.execute({ invocadoPor: admin });

    expect(userRepository.findByGymId).toHaveBeenCalledWith('gym-1', undefined);
    expect(resultado).toEqual(usuariosDelGym);
  });

  it('ADMIN puede filtrar por rol', async () => {
    userRepository.findByGymId.mockResolvedValue([usuariosDelGym[1]]);

    const resultado = await useCase.execute({ invocadoPor: admin, role: Role.ALUMNO });

    expect(userRepository.findByGymId).toHaveBeenCalledWith('gym-1', Role.ALUMNO);
    expect(resultado).toEqual([usuariosDelGym[1]]);
  });
});
