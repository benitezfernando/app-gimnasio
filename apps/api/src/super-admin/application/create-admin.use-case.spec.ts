import { Role } from '../../identity/domain/role';
import { CreateAdminUseCase } from './create-admin.use-case';
import { AuthProviderPort } from '../../identity/application/ports/auth-provider.port';
import {
  UserRepositoryPort,
  UserRecord,
} from '../../identity/application/ports/user-repository.port';
import { ReservedGymIdError } from './errors/reserved-gym-id.error';
import { PLATFORM_PSEUDO_GYM_ID } from '../../identity/infrastructure/auth/synthetic-credentials';
import { DuplicateUsernameError } from '../../identity/application/errors/duplicate-username.error';

describe('CreateAdminUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let authProvider: jest.Mocked<AuthProviderPort>;
  let useCase: CreateAdminUseCase;

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
    authProvider = {
      createStaffUser: jest.fn(),
      createAlumnoUser: jest.fn(),
      signInStaff: jest.fn(),
      signInAlumno: jest.fn(),
      refreshSession: jest.fn(),
      deleteAuthUser: jest.fn(),
      updateStaffPassword: jest.fn(),
    };
    useCase = new CreateAdminUseCase(userRepository, authProvider);
  });

  it('crea un ADMIN con el gymId indicado', async () => {
    authProvider.createStaffUser.mockResolvedValue({ authUserId: 'auth-new-admin' });
    const creado: UserRecord = {
      id: 'admin-new',
      authUserId: 'auth-new-admin',
      gymId: 'gym-nuevo',
      username: 'nuevoadmin',
      nombre: 'Nuevo Admin',
      role: Role.ADMIN,
      activo: true,
    };
    userRepository.create.mockResolvedValue(creado);

    const resultado = await useCase.execute({
      gymId: 'gym-nuevo',
      username: 'nuevoadmin',
      nombre: 'Nuevo Admin',
      password: 'segura123',
    });

    expect(authProvider.createStaffUser).toHaveBeenCalledWith(
      'gym-nuevo',
      'nuevoadmin',
      'segura123',
    );
    expect(userRepository.create).toHaveBeenCalledWith({
      gymId: 'gym-nuevo',
      authUserId: 'auth-new-admin',
      username: 'nuevoadmin',
      nombre: 'Nuevo Admin',
      role: Role.ADMIN,
    });
    expect(resultado).toEqual(creado);
  });

  it('rechaza si gymId es el reservado para SUPER_ADMIN', async () => {
    await expect(
      useCase.execute({
        gymId: PLATFORM_PSEUDO_GYM_ID,
        username: 'x',
        nombre: 'X',
        password: 'segura123',
      }),
    ).rejects.toThrow(ReservedGymIdError);
    expect(authProvider.createStaffUser).not.toHaveBeenCalled();
  });

  it('rechaza con DuplicateUsernameError si ya existe un usuario con ese username en el gym', async () => {
    const existente: UserRecord = {
      id: 'admin-existente',
      authUserId: 'auth-existente',
      gymId: 'gym-nuevo',
      username: 'nuevoadmin',
      nombre: 'Admin Existente',
      role: Role.ADMIN,
      activo: true,
    };
    userRepository.findByGymIdAndUsername.mockResolvedValue(existente);

    await expect(
      useCase.execute({
        gymId: 'gym-nuevo',
        username: 'nuevoadmin',
        nombre: 'Nuevo Admin',
        password: 'segura123',
      }),
    ).rejects.toThrow(DuplicateUsernameError);
    expect(authProvider.createStaffUser).not.toHaveBeenCalled();
  });

  it('si falla la fila en Prisma, compensa borrando el usuario de Supabase Auth', async () => {
    authProvider.createStaffUser.mockResolvedValue({ authUserId: 'auth-huerfano' });
    userRepository.create.mockRejectedValue(new Error('username duplicado'));

    await expect(
      useCase.execute({ gymId: 'gym-nuevo', username: 'x', nombre: 'X', password: 'segura123' }),
    ).rejects.toThrow('username duplicado');
    expect(authProvider.deleteAuthUser).toHaveBeenCalledWith('auth-huerfano');
  });
});
