import { Role } from '../domain/role';
import { GetUserDeletionImpactUseCase } from './get-user-deletion-impact.use-case';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { CarteraRepositoryPort } from './ports/cartera-repository.port';
import { RoutinesCleanupPort } from './ports/routines-cleanup.port';
import { InsufficientRoleError } from './errors/insufficient-role.error';
import { CannotTargetAdminError } from './errors/cannot-target-admin.error';

describe('GetUserDeletionImpactUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let carteraRepository: jest.Mocked<CarteraRepositoryPort>;
  let routinesCleanup: jest.Mocked<RoutinesCleanupPort>;
  let useCase: GetUserDeletionImpactUseCase;

  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };
  const profesorInvocador = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };

  const profesorObjetivo: UserRecord = {
    id: 'prof-2',
    authUserId: 'auth-p2',
    gymId: 'gym-1',
    username: 'prof2',
    nombre: 'Profe Dos',
    role: Role.PROFESOR,
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
    carteraRepository = {
      existe: jest.fn(),
      crear: jest.fn(),
      eliminar: jest.fn(),
      findAlumnosDeProfesor: jest.fn(),
      findProfesoresDeAlumno: jest.fn(),
    };
    routinesCleanup = { contarImpacto: jest.fn(), eliminarDatosDe: jest.fn() };
    useCase = new GetUserDeletionImpactUseCase(userRepository, carteraRepository, routinesCleanup);
  });

  it('rechaza si quien invoca no es ADMIN', async () => {
    await expect(
      useCase.execute({ invocadoPor: profesorInvocador, userId: 'prof-2' }),
    ).rejects.toThrow(InsufficientRoleError);
  });

  it('rechaza con CannotTargetAdminError si el objetivo es ADMIN', async () => {
    userRepository.findById.mockResolvedValue({ ...profesorObjetivo, role: Role.ADMIN });
    await expect(useCase.execute({ invocadoPor: admin, userId: 'prof-2' })).rejects.toThrow(
      CannotTargetAdminError,
    );
  });

  it('combina el impacto de routines con los vínculos de cartera', async () => {
    userRepository.findById.mockResolvedValue(profesorObjetivo);
    routinesCleanup.contarImpacto.mockResolvedValue({
      plantillasABorrar: 2,
      instanciasABorrar: 1,
      instanciasQueSobreviven: 3,
    });
    carteraRepository.findAlumnosDeProfesor.mockResolvedValue([
      {
        id: 'a1',
        authUserId: 'x',
        gymId: 'gym-1',
        username: 'a1',
        nombre: 'A1',
        role: Role.ALUMNO,
        activo: true,
      },
    ]);

    const resultado = await useCase.execute({ invocadoPor: admin, userId: 'prof-2' });

    expect(routinesCleanup.contarImpacto).toHaveBeenCalledWith('prof-2', Role.PROFESOR);
    expect(resultado).toEqual({
      plantillasABorrar: 2,
      instanciasABorrar: 1,
      instanciasQueSobreviven: 3,
      vinculosDeCarteraABorrar: 1,
    });
  });
});
