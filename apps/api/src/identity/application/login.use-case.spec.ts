import { Role } from '../domain/role';
import { LoginUseCase } from './login.use-case';
import { AuthProviderPort } from './ports/auth-provider.port';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { InvalidCredentialsError } from './errors/invalid-credentials.error';

describe('LoginUseCase', () => {
  let authProvider: jest.Mocked<AuthProviderPort>;
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let useCase: LoginUseCase;

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
    useCase = new LoginUseCase(authProvider, userRepository);
  });

  it('con password: usa signInStaff, no signInAlumno', async () => {
    authProvider.signInStaff.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      authUserId: 'auth-x',
    });
    userRepository.findByAuthUserId.mockResolvedValue(usuarioActivo);

    const resultado = await useCase.execute({
      gymId: 'gym-1',
      username: 'admin1',
      password: 'secreto',
    });

    expect(authProvider.signInStaff).toHaveBeenCalledWith('gym-1', 'admin1', 'secreto');
    expect(authProvider.signInAlumno).not.toHaveBeenCalled();
    expect(resultado).toEqual({ accessToken: 'a', refreshToken: 'r', authUserId: 'auth-x' });
  });

  it('sin password: usa signInAlumno, no signInStaff', async () => {
    authProvider.signInAlumno.mockResolvedValue({
      accessToken: 'a2',
      refreshToken: 'r2',
      authUserId: 'auth-x',
    });
    userRepository.findByAuthUserId.mockResolvedValue(usuarioActivo);

    const resultado = await useCase.execute({ gymId: 'gym-1', username: 'juan.perez' });

    expect(authProvider.signInAlumno).toHaveBeenCalledWith('gym-1', 'juan.perez');
    expect(authProvider.signInStaff).not.toHaveBeenCalled();
    expect(resultado).toEqual({ accessToken: 'a2', refreshToken: 'r2', authUserId: 'auth-x' });
  });

  it('cualquier falla del provider se traduce a InvalidCredentialsError genérico (con password)', async () => {
    authProvider.signInStaff.mockRejectedValue(new Error('detalle interno de Supabase'));

    await expect(
      useCase.execute({ gymId: 'gym-1', username: 'admin1', password: 'mal' }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('cualquier falla del provider se traduce a InvalidCredentialsError genérico (sin password)', async () => {
    authProvider.signInAlumno.mockRejectedValue(new Error('detalle interno de Supabase'));

    await expect(useCase.execute({ gymId: 'gym-1', username: 'no.existe' })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('el mensaje de error no revela si el username existe o no', async () => {
    authProvider.signInAlumno.mockRejectedValue(new Error('User not found'));

    await expect(useCase.execute({ gymId: 'gym-1', username: 'no.existe' })).rejects.toThrow(
      'Usuario o contraseña incorrectos.',
    );
  });

  it('rechaza con InvalidCredentialsError si no existe un User interno para el authUserId', async () => {
    authProvider.signInAlumno.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      authUserId: 'auth-y',
    });
    userRepository.findByAuthUserId.mockResolvedValue(null);

    await expect(useCase.execute({ gymId: 'gym-1', username: 'juan.perez' })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('rechaza con InvalidCredentialsError si el User interno está desactivado', async () => {
    authProvider.signInStaff.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      authUserId: 'auth-x',
    });
    userRepository.findByAuthUserId.mockResolvedValue({ ...usuarioActivo, activo: false });

    await expect(
      useCase.execute({ gymId: 'gym-1', username: 'admin1', password: 'secreto' }),
    ).rejects.toThrow(InvalidCredentialsError);
  });
});
