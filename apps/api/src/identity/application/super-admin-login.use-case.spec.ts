import { Role } from '../domain/role';
import { SuperAdminLoginUseCase } from './super-admin-login.use-case';
import { AuthProviderPort } from './ports/auth-provider.port';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { InvalidCredentialsError } from './errors/invalid-credentials.error';
import { PLATFORM_PSEUDO_GYM_ID } from '../infrastructure/auth/synthetic-credentials';

describe('SuperAdminLoginUseCase', () => {
  let authProvider: jest.Mocked<AuthProviderPort>;
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let useCase: SuperAdminLoginUseCase;

  const superAdmin: UserRecord = {
    id: 'sa-1',
    authUserId: 'auth-sa',
    gymId: null,
    username: 'root',
    nombre: 'Root',
    role: Role.SUPER_ADMIN,
    activo: true,
  };

  beforeEach(() => {
    authProvider = {
      createStaffUser: jest.fn(),
      createAlumnoUser: jest.fn(),
      signInStaff: jest.fn(),
      signInAlumno: jest.fn(),
      refreshSession: jest.fn(),
      deleteAuthUser: jest.fn(),
      updateStaffPassword: jest.fn(),
    };
    userRepository = {
      findByAuthUserId: jest.fn(),
      findByGymIdAndUsername: jest.fn(),
      findByGymId: jest.fn(),
      findById: jest.fn(),
      deactivate: jest.fn(),
      create: jest.fn(),
      updateNombre: jest.fn(),
    };
    useCase = new SuperAdminLoginUseCase(authProvider, userRepository);
  });

  it('usa signInStaff con PLATFORM_PSEUDO_GYM_ID, nunca con un gymId real', async () => {
    authProvider.signInStaff.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      authUserId: 'auth-sa',
    });
    userRepository.findByAuthUserId.mockResolvedValue(superAdmin);

    await useCase.execute({ username: 'root', password: 'secreto' });

    expect(authProvider.signInStaff).toHaveBeenCalledWith(
      PLATFORM_PSEUDO_GYM_ID,
      'root',
      'secreto',
    );
  });

  it('rechaza si el authProvider falla', async () => {
    authProvider.signInStaff.mockRejectedValue(new Error('detalle interno'));

    await expect(useCase.execute({ username: 'root', password: 'mal' })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('rechaza si el User resuelto no es SUPER_ADMIN (defensa en profundidad)', async () => {
    authProvider.signInStaff.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      authUserId: 'auth-otro',
    });
    userRepository.findByAuthUserId.mockResolvedValue({
      ...superAdmin,
      authUserId: 'auth-otro',
      role: Role.ADMIN,
    });

    await expect(useCase.execute({ username: 'root', password: 'secreto' })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('rechaza si el SUPER_ADMIN está desactivado', async () => {
    authProvider.signInStaff.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      authUserId: 'auth-sa',
    });
    userRepository.findByAuthUserId.mockResolvedValue({ ...superAdmin, activo: false });

    await expect(useCase.execute({ username: 'root', password: 'secreto' })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });
});
