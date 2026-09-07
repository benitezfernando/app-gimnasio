import { Role } from '../domain/role';
import { DeleteUserPermanentlyUseCase } from './delete-user-permanently.use-case';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { RoutinesCleanupPort } from './ports/routines-cleanup.port';
import { AuthProviderPort } from './ports/auth-provider.port';
import { InsufficientRoleError } from './errors/insufficient-role.error';
import { CannotTargetAdminError } from './errors/cannot-target-admin.error';
import { UserNotInactiveError } from './errors/user-not-inactive.error';

describe('DeleteUserPermanentlyUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let routinesCleanup: jest.Mocked<RoutinesCleanupPort>;
  let authProvider: jest.Mocked<AuthProviderPort>;
  let prisma: {
    $transaction: jest.Mock;
    profesorAlumno: { deleteMany: jest.Mock };
    user: { delete: jest.Mock };
  };
  let useCase: DeleteUserPermanentlyUseCase;

  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };
  const profesorInvocador = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };

  const alumnoInactivo: UserRecord = {
    id: 'alum-1',
    authUserId: 'auth-a1',
    gymId: 'gym-1',
    username: 'juan.perez',
    nombre: 'Juan',
    role: Role.ALUMNO,
    activo: false,
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
    routinesCleanup = { contarImpacto: jest.fn(), eliminarDatosDe: jest.fn() };
    authProvider = {
      createStaffUser: jest.fn(),
      createAlumnoUser: jest.fn(),
      signInStaff: jest.fn(),
      signInAlumno: jest.fn(),
      refreshSession: jest.fn(),
      deleteAuthUser: jest.fn(),
    };
    prisma = {
      $transaction: jest.fn(async (cb) => cb(prisma)),
      profesorAlumno: { deleteMany: jest.fn() },
      user: { delete: jest.fn() },
    };
    useCase = new DeleteUserPermanentlyUseCase(
      userRepository,
      routinesCleanup,
      authProvider,
      prisma as never,
    );
  });

  it('rechaza si quien invoca no es ADMIN', async () => {
    await expect(
      useCase.execute({ invocadoPor: profesorInvocador, userId: 'alum-1' }),
    ).rejects.toThrow(InsufficientRoleError);
  });

  it('rechaza con CannotTargetAdminError si el objetivo es ADMIN', async () => {
    userRepository.findById.mockResolvedValue({
      ...alumnoInactivo,
      role: Role.ADMIN,
      activo: false,
    });
    await expect(useCase.execute({ invocadoPor: admin, userId: 'alum-1' })).rejects.toThrow(
      CannotTargetAdminError,
    );
  });

  it('rechaza con UserNotInactiveError si el objetivo está activo (gate del hard-delete)', async () => {
    userRepository.findById.mockResolvedValue({ ...alumnoInactivo, activo: true });
    await expect(useCase.execute({ invocadoPor: admin, userId: 'alum-1' })).rejects.toThrow(
      UserNotInactiveError,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('elimina en transacción y borra auth.users — sin advertencia si todo sale bien', async () => {
    userRepository.findById.mockResolvedValue(alumnoInactivo);
    authProvider.deleteAuthUser.mockResolvedValue(undefined);

    const resultado = await useCase.execute({ invocadoPor: admin, userId: 'alum-1' });

    expect(routinesCleanup.eliminarDatosDe).toHaveBeenCalledWith('alum-1', Role.ALUMNO, prisma);
    expect(prisma.profesorAlumno.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ profesorId: 'alum-1' }, { alumnoId: 'alum-1' }] },
    });
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'alum-1' } });
    expect(authProvider.deleteAuthUser).toHaveBeenCalledWith('auth-a1');
    expect(resultado).toEqual({});
  });

  it('devuelve una advertencia si auth.users falla tras el reintento, sin lanzar', async () => {
    userRepository.findById.mockResolvedValue(alumnoInactivo);
    authProvider.deleteAuthUser.mockRejectedValue(new Error('Supabase caído'));

    const resultado = await useCase.execute({ invocadoPor: admin, userId: 'alum-1' });

    expect(authProvider.deleteAuthUser).toHaveBeenCalledTimes(2);
    expect(resultado.advertencia).toContain('auth-a1');
  });
});
