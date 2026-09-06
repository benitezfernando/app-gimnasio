import { Role } from '../../domain/role';
import { RemoveProfesorFromAlumnoUseCase } from './remove-profesor-from-alumno.use-case';
import { CarteraRepositoryPort } from '../ports/cartera-repository.port';
import { UserRepositoryPort, UserRecord } from '../ports/user-repository.port';
import { InsufficientRoleError } from '../errors/insufficient-role.error';
import { UserNotFoundError } from '../errors/user-not-found.error';
import { CarteraLinkNotFoundError } from '../errors/cartera-link-not-found.error';

describe('RemoveProfesorFromAlumnoUseCase', () => {
  let carteraRepository: jest.Mocked<CarteraRepositoryPort>;
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let useCase: RemoveProfesorFromAlumnoUseCase;

  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };
  const profesorInvocador = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };

  const profesorDesactivado: UserRecord = {
    id: 'prof-2',
    authUserId: 'a-prof',
    gymId: 'gym-1',
    username: 'prof2',
    nombre: 'Profe Dos',
    role: Role.PROFESOR,
    activo: false,
  };

  const alumno: UserRecord = {
    id: 'alum-1',
    authUserId: 'a-alum',
    gymId: 'gym-1',
    username: 'juan.perez',
    nombre: 'Juan Perez',
    role: Role.ALUMNO,
    activo: true,
  };

  beforeEach(() => {
    carteraRepository = {
      existe: jest.fn(),
      crear: jest.fn(),
      eliminar: jest.fn(),
      findAlumnosDeProfesor: jest.fn(),
      findProfesoresDeAlumno: jest.fn(),
    };
    userRepository = {
      findByAuthUserId: jest.fn(),
      findByGymIdAndUsername: jest.fn(),
      findByGymId: jest.fn(),
      findById: jest.fn(),
      deactivate: jest.fn(),
      create: jest.fn(),
    };
    useCase = new RemoveProfesorFromAlumnoUseCase(carteraRepository, userRepository);
  });

  it('rechaza si quien invoca no es ADMIN', async () => {
    await expect(
      useCase.execute({ invocadoPor: profesorInvocador, alumnoId: 'alum-1', profesorId: 'prof-2' }),
    ).rejects.toThrow(InsufficientRoleError);
  });

  it('rechaza con UserNotFoundError si el alumno no existe o es de otro gym', async () => {
    userRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ invocadoPor: admin, alumnoId: 'no-existe', profesorId: 'prof-2' }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('rechaza con UserNotFoundError si el alumno es de otro gym (no solo si no existe)', async () => {
    userRepository.findById.mockResolvedValue({ ...alumno, gymId: 'gym-OTRO' });

    await expect(
      useCase.execute({ invocadoPor: admin, alumnoId: 'alum-1', profesorId: 'prof-2' }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('rechaza con CarteraLinkNotFoundError si el vínculo no existe', async () => {
    userRepository.findById.mockImplementation(async (id) =>
      id === 'prof-2' ? profesorDesactivado : alumno,
    );
    carteraRepository.existe.mockResolvedValue(false);

    await expect(
      useCase.execute({ invocadoPor: admin, alumnoId: 'alum-1', profesorId: 'prof-2' }),
    ).rejects.toThrow(CarteraLinkNotFoundError);
    expect(carteraRepository.eliminar).not.toHaveBeenCalled();
  });

  it('quita el vínculo aunque el profesor esté desactivado (no valida activo, a diferencia de Assign)', async () => {
    userRepository.findById.mockImplementation(async (id) =>
      id === 'prof-2' ? profesorDesactivado : alumno,
    );
    carteraRepository.existe.mockResolvedValue(true);

    await useCase.execute({ invocadoPor: admin, alumnoId: 'alum-1', profesorId: 'prof-2' });

    expect(carteraRepository.eliminar).toHaveBeenCalledWith('prof-2', 'alum-1');
  });
});
