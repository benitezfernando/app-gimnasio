import { Role } from '../domain/role';
import { InviteUserUseCase } from './invite-user.use-case';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { AuthProviderPort } from './ports/auth-provider.port';
import { InsufficientRoleError } from './errors/insufficient-role.error';
import { DuplicateEmailError } from './errors/duplicate-email.error';

describe('InviteUserUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let authProvider: jest.Mocked<AuthProviderPort>;
  let useCase: InviteUserUseCase;

  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };
  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const alumno = { id: 'alum-1', gymId: 'gym-1', role: Role.ALUMNO };

  beforeEach(() => {
    userRepository = {
      findByAuthUserId: jest.fn(),
      findByGymIdAndEmail: jest.fn(),
      create: jest.fn(),
    };
    authProvider = { inviteUserByEmail: jest.fn() };
    useCase = new InviteUserUseCase(userRepository, authProvider);
  });

  it('rechaza si quien invoca es ALUMNO', async () => {
    await expect(
      useCase.execute({
        email: 'nuevo@gym.com',
        nombre: 'Nuevo',
        rol: Role.ALUMNO,
        invocadoPor: alumno,
      }),
    ).rejects.toThrow(InsufficientRoleError);
    expect(authProvider.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('rechaza si ya existe un usuario con ese email en el gym', async () => {
    userRepository.findByGymIdAndEmail.mockResolvedValue({
      id: 'existing',
      authUserId: 'auth-existing',
      gymId: 'gym-1',
      email: 'nuevo@gym.com',
      nombre: 'X',
      role: Role.ALUMNO,
      activo: true,
    });

    await expect(
      useCase.execute({
        email: 'nuevo@gym.com',
        nombre: 'Nuevo',
        rol: Role.ALUMNO,
        invocadoPor: admin,
      }),
    ).rejects.toThrow(DuplicateEmailError);
    expect(authProvider.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('ADMIN puede invitar: invita en Supabase y crea el User con el authUserId resultante', async () => {
    userRepository.findByGymIdAndEmail.mockResolvedValue(null);
    authProvider.inviteUserByEmail.mockResolvedValue({ authUserId: 'auth-nuevo-123' });
    const creado: UserRecord = {
      id: 'user-nuevo',
      authUserId: 'auth-nuevo-123',
      gymId: 'gym-1',
      email: 'nuevo@gym.com',
      nombre: 'Nuevo',
      role: Role.ALUMNO,
      activo: true,
    };
    userRepository.create.mockResolvedValue(creado);

    const resultado = await useCase.execute({
      email: 'nuevo@gym.com',
      nombre: 'Nuevo',
      rol: Role.ALUMNO,
      invocadoPor: admin,
    });

    expect(authProvider.inviteUserByEmail).toHaveBeenCalledWith('nuevo@gym.com');
    expect(userRepository.create).toHaveBeenCalledWith({
      gymId: 'gym-1',
      authUserId: 'auth-nuevo-123',
      email: 'nuevo@gym.com',
      nombre: 'Nuevo',
      role: Role.ALUMNO,
    });
    expect(resultado).toEqual(creado);
  });

  it('PROFESOR también puede invitar', async () => {
    userRepository.findByGymIdAndEmail.mockResolvedValue(null);
    authProvider.inviteUserByEmail.mockResolvedValue({ authUserId: 'auth-otro' });
    userRepository.create.mockResolvedValue({
      id: 'user-2',
      authUserId: 'auth-otro',
      gymId: 'gym-1',
      email: 'otro@gym.com',
      nombre: 'Otro',
      role: Role.ALUMNO,
      activo: true,
    });

    await expect(
      useCase.execute({
        email: 'otro@gym.com',
        nombre: 'Otro',
        rol: Role.ALUMNO,
        invocadoPor: profesor,
      }),
    ).resolves.toBeDefined();
  });
});
