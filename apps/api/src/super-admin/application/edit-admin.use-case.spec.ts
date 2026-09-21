import { Role } from '../../identity/domain/role';
import { EditAdminUseCase } from './edit-admin.use-case';
import { AuthProviderPort } from '../../identity/application/ports/auth-provider.port';
import {
  UserRepositoryPort,
  UserRecord,
} from '../../identity/application/ports/user-repository.port';
import { UserNotFoundError } from '../../identity/application/errors/user-not-found.error';

describe('EditAdminUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let authProvider: jest.Mocked<AuthProviderPort>;
  let useCase: EditAdminUseCase;

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
    authProvider = {
      createStaffUser: jest.fn(),
      createAlumnoUser: jest.fn(),
      signInStaff: jest.fn(),
      signInAlumno: jest.fn(),
      refreshSession: jest.fn(),
      deleteAuthUser: jest.fn(),
      updateStaffPassword: jest.fn(),
    };
    useCase = new EditAdminUseCase(userRepository, authProvider);
  });

  it('edita nombre y password de un ADMIN de cualquier gym (sin restricción de gym)', async () => {
    userRepository.findById.mockResolvedValue(adminDeCualquierGym);
    userRepository.updateNombre.mockResolvedValue({ ...adminDeCualquierGym, nombre: 'Nuevo' });

    const resultado = await useCase.execute({
      adminId: adminDeCualquierGym.id,
      nombre: 'Nuevo',
      password: 'nueva-pass-123',
    });

    expect(userRepository.updateNombre).toHaveBeenCalledWith(adminDeCualquierGym.id, 'Nuevo');
    expect(authProvider.updateStaffPassword).toHaveBeenCalledWith(
      adminDeCualquierGym.authUserId,
      'nueva-pass-123',
    );
    expect(resultado.nombre).toBe('Nuevo');
  });

  it('rechaza si el id no corresponde a un ADMIN', async () => {
    userRepository.findById.mockResolvedValue(noAdmin);

    await expect(useCase.execute({ adminId: noAdmin.id, nombre: 'X' })).rejects.toThrow(
      UserNotFoundError,
    );
  });

  it('rechaza si el id no existe', async () => {
    userRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute({ adminId: 'no-existe', nombre: 'X' })).rejects.toThrow(
      UserNotFoundError,
    );
  });
});
