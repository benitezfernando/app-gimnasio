import { Role } from '../../identity/domain/role';
import { DeleteAdminPermanentlyUseCase } from './delete-admin-permanently.use-case';
import { AuthProviderPort } from '../../identity/application/ports/auth-provider.port';
import {
  UserRepositoryPort,
  UserRecord,
} from '../../identity/application/ports/user-repository.port';
import { UserNotFoundError } from '../../identity/application/errors/user-not-found.error';
import { UserNotInactiveError } from '../../identity/application/errors/user-not-inactive.error';
import { PrismaService } from '../../shared-kernel/prisma.service';

describe('DeleteAdminPermanentlyUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let authProvider: jest.Mocked<AuthProviderPort>;
  let prisma: { user: { delete: jest.Mock } };
  let useCase: DeleteAdminPermanentlyUseCase;

  const adminInactivo: UserRecord = {
    id: 'admin-1',
    authUserId: 'auth-admin',
    gymId: 'gym-lejano',
    username: 'admin1',
    nombre: 'Admin',
    role: Role.ADMIN,
    activo: false,
  };
  const noAdmin: UserRecord = { ...adminInactivo, id: 'prof-1', role: Role.PROFESOR };

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
    prisma = { user: { delete: jest.fn() } };
    useCase = new DeleteAdminPermanentlyUseCase(
      userRepository,
      authProvider,
      prisma as unknown as PrismaService,
    );
  });

  it('elimina definitivamente un ADMIN ya desactivado', async () => {
    userRepository.findById.mockResolvedValue(adminInactivo);
    prisma.user.delete.mockResolvedValue(adminInactivo);
    authProvider.deleteAuthUser.mockResolvedValue(undefined);

    const resultado = await useCase.execute({ adminId: adminInactivo.id });

    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: adminInactivo.id } });
    expect(authProvider.deleteAuthUser).toHaveBeenCalledWith(adminInactivo.authUserId);
    expect(resultado).toEqual({});
  });

  it('rechaza si el ADMIN sigue activo', async () => {
    userRepository.findById.mockResolvedValue({ ...adminInactivo, activo: true });

    await expect(useCase.execute({ adminId: adminInactivo.id })).rejects.toThrow(
      UserNotInactiveError,
    );
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('rechaza si el id no corresponde a un ADMIN', async () => {
    userRepository.findById.mockResolvedValue(noAdmin);

    await expect(useCase.execute({ adminId: noAdmin.id })).rejects.toThrow(UserNotFoundError);
  });

  it('rechaza si el id no existe', async () => {
    userRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute({ adminId: 'no-existe' })).rejects.toThrow(UserNotFoundError);
  });

  it('si falla borrar en Supabase Auth, reintenta una vez y después devuelve advertencia', async () => {
    userRepository.findById.mockResolvedValue(adminInactivo);
    prisma.user.delete.mockResolvedValue(adminInactivo);
    authProvider.deleteAuthUser.mockRejectedValue(new Error('Supabase caído'));

    const resultado = await useCase.execute({ adminId: adminInactivo.id });

    expect(authProvider.deleteAuthUser).toHaveBeenCalledTimes(2);
    expect(resultado.advertencia).toContain(adminInactivo.authUserId);
  });
});
