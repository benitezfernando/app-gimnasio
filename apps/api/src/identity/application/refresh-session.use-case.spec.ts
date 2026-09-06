import { Role } from '../domain/role';
import { RefreshSessionUseCase } from './refresh-session.use-case';
import { AuthProviderPort } from './ports/auth-provider.port';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { InvalidCredentialsError } from './errors/invalid-credentials.error';

describe('RefreshSessionUseCase', () => {
  let authProvider: jest.Mocked<AuthProviderPort>;
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let useCase: RefreshSessionUseCase;

  const usuarioActivo: UserRecord = {
    id: 'u1',
    authUserId: 'auth-x',
    gymId: 'gym-1',
    username: 'admin1',
    nombre: 'Admin',
    role: Role.ADMIN,
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
    };
    userRepository = {
      findByAuthUserId: jest.fn(),
      findByGymIdAndUsername: jest.fn(),
      findByGymId: jest.fn(),
      findById: jest.fn(),
      deactivate: jest.fn(),
      create: jest.fn(),
    };
    useCase = new RefreshSessionUseCase(authProvider, userRepository);
  });

  it('refresh_token válido devuelve la sesión nueva del provider', async () => {
    authProvider.refreshSession.mockResolvedValue({
      accessToken: 'nuevo-access',
      refreshToken: 'nuevo-refresh',
      authUserId: 'auth-x',
    });
    userRepository.findByAuthUserId.mockResolvedValue(usuarioActivo);

    const resultado = await useCase.execute({ refreshToken: 'refresh-viejo' });

    expect(authProvider.refreshSession).toHaveBeenCalledWith('refresh-viejo');
    expect(resultado).toEqual({
      accessToken: 'nuevo-access',
      refreshToken: 'nuevo-refresh',
      authUserId: 'auth-x',
    });
  });

  it('refresh_token inválido o expirado se traduce a InvalidCredentialsError genérico', async () => {
    authProvider.refreshSession.mockRejectedValue(new Error('invalid_grant: token expirado'));

    await expect(useCase.execute({ refreshToken: 'basura' })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('el mensaje de error no filtra el detalle interno del provider', async () => {
    authProvider.refreshSession.mockRejectedValue(new Error('detalle interno de Supabase'));

    await expect(useCase.execute({ refreshToken: 'basura' })).rejects.toThrow(
      'Usuario o contraseña incorrectos.',
    );
  });

  it('rechaza con InvalidCredentialsError si no existe un User interno para el authUserId', async () => {
    authProvider.refreshSession.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      authUserId: 'auth-fantasma',
    });
    userRepository.findByAuthUserId.mockResolvedValue(null);

    await expect(useCase.execute({ refreshToken: 'r-viejo' })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('rechaza con InvalidCredentialsError si el User interno fue desactivado desde el login original', async () => {
    authProvider.refreshSession.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      authUserId: 'auth-x',
    });
    userRepository.findByAuthUserId.mockResolvedValue({ ...usuarioActivo, activo: false });

    await expect(useCase.execute({ refreshToken: 'r-viejo' })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });
});
