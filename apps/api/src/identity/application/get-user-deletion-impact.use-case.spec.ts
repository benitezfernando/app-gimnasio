import { Role } from '../domain/role';
import { GetUserDeletionImpactUseCase } from './get-user-deletion-impact.use-case';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { CarteraRepositoryPort } from './ports/cartera-repository.port';
import { RoutinesCleanupPort } from './ports/routines-cleanup.port';
import { InsufficientRoleError } from './errors/insufficient-role.error';
import { CannotTargetAdminError } from './errors/cannot-target-admin.error';
import { UserNotFoundError } from './errors/user-not-found.error';
import { AlumnoNotInCarteraError } from '../../routines/application/errors/alumno-not-in-cartera.error';

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

  const alumnoObjetivo: UserRecord = {
    id: 'alum-1',
    authUserId: 'auth-a1',
    gymId: 'gym-1',
    username: 'ana',
    nombre: 'Ana',
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
      reactivate: jest.fn(),
      create: jest.fn(),
      updateNombre: jest.fn(),
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

  it('rechaza si quien invoca no es ADMIN ni PROFESOR', async () => {
    const alumno = { id: 'alum-9', gymId: 'gym-1', role: Role.ALUMNO };
    await expect(useCase.execute({ invocadoPor: alumno, userId: 'prof-2' })).rejects.toThrow(
      InsufficientRoleError,
    );
  });

  it('un PROFESOR no puede ver el impacto de otro profesor', async () => {
    userRepository.findById.mockResolvedValue(profesorObjetivo);
    await expect(
      useCase.execute({ invocadoPor: profesorInvocador, userId: 'prof-2' }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('un PROFESOR no puede ver el impacto de un alumno ajeno', async () => {
    userRepository.findById.mockResolvedValue(alumnoObjetivo);
    carteraRepository.existe.mockResolvedValue(false);
    await expect(
      useCase.execute({ invocadoPor: profesorInvocador, userId: 'alum-1' }),
    ).rejects.toThrow(AlumnoNotInCarteraError);
  });

  it('para un PROFESOR sobre su alumno cuenta a los otros profesores y sus rutinas', async () => {
    userRepository.findById.mockResolvedValue(alumnoObjetivo);
    carteraRepository.existe.mockResolvedValue(true);
    routinesCleanup.contarImpacto.mockResolvedValue({
      plantillasABorrar: 0,
      instanciasABorrar: 3,
      instanciasQueSobreviven: 0,
      instanciasDeOtrosProfesores: 2,
    });
    carteraRepository.findProfesoresDeAlumno.mockResolvedValue([
      { ...profesorObjetivo, id: 'prof-1' },
      { ...profesorObjetivo, id: 'prof-2' },
      { ...profesorObjetivo, id: 'prof-3' },
    ]);

    const resultado = await useCase.execute({ invocadoPor: profesorInvocador, userId: 'alum-1' });

    expect(routinesCleanup.contarImpacto).toHaveBeenCalledWith('alum-1', Role.ALUMNO, 'prof-1');
    expect(resultado).toEqual({
      plantillasABorrar: 0,
      instanciasABorrar: 3,
      instanciasQueSobreviven: 0,
      instanciasDeOtrosProfesores: 2,
      vinculosDeCarteraABorrar: 3,
      otrosProfesores: 2,
    });
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
      instanciasDeOtrosProfesores: 0,
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

    expect(routinesCleanup.contarImpacto).toHaveBeenCalledWith('prof-2', Role.PROFESOR, undefined);
    expect(resultado).toEqual({
      plantillasABorrar: 2,
      instanciasABorrar: 1,
      instanciasQueSobreviven: 3,
      instanciasDeOtrosProfesores: 0,
      vinculosDeCarteraABorrar: 1,
      otrosProfesores: 0,
    });
  });
});
