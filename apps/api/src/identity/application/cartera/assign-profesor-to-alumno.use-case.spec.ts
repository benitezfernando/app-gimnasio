import { Role } from '../../domain/role';
import { AssignProfesorToAlumnoUseCase } from './assign-profesor-to-alumno.use-case';
import { CarteraRepositoryPort } from '../ports/cartera-repository.port';
import { UserRepositoryPort, UserRecord } from '../ports/user-repository.port';
import { InsufficientRoleError } from '../errors/insufficient-role.error';
import { UserNotFoundError } from '../errors/user-not-found.error';
import { InvalidCarteraRoleError } from '../errors/invalid-cartera-role.error';
import { InactiveUserError } from '../errors/inactive-user.error';
import { CarteraLinkAlreadyExistsError } from '../errors/cartera-link-already-exists.error';

describe('AssignProfesorToAlumnoUseCase', () => {
  let carteraRepository: jest.Mocked<CarteraRepositoryPort>;
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let useCase: AssignProfesorToAlumnoUseCase;

  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };
  const profesorInvocador = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };

  const profesor: UserRecord = {
    id: 'prof-2',
    authUserId: 'a-prof',
    gymId: 'gym-1',
    username: 'prof2',
    nombre: 'Profe Dos',
    role: Role.PROFESOR,
    activo: true,
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
    useCase = new AssignProfesorToAlumnoUseCase(carteraRepository, userRepository);
  });

  it('rechaza si quien invoca no es ADMIN', async () => {
    await expect(
      useCase.execute({ invocadoPor: profesorInvocador, alumnoId: 'alum-1', profesorId: 'prof-2' }),
    ).rejects.toThrow(InsufficientRoleError);
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it('rechaza con UserNotFoundError si el profesor no existe', async () => {
    userRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ invocadoPor: admin, alumnoId: 'alum-1', profesorId: 'no-existe' }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('rechaza con UserNotFoundError (no 403) si el profesor es de otro gym', async () => {
    userRepository.findById.mockResolvedValue({ ...profesor, gymId: 'gym-OTRO' });

    await expect(
      useCase.execute({ invocadoPor: admin, alumnoId: 'alum-1', profesorId: 'prof-2' }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('rechaza con InvalidCarteraRoleError si el profesorId no tiene rol PROFESOR', async () => {
    userRepository.findById.mockResolvedValue({ ...profesor, role: Role.ALUMNO });

    await expect(
      useCase.execute({ invocadoPor: admin, alumnoId: 'alum-1', profesorId: 'prof-2' }),
    ).rejects.toThrow(InvalidCarteraRoleError);
  });

  it('rechaza con InactiveUserError si el profesor está desactivado', async () => {
    userRepository.findById.mockResolvedValue({ ...profesor, activo: false });

    await expect(
      useCase.execute({ invocadoPor: admin, alumnoId: 'alum-1', profesorId: 'prof-2' }),
    ).rejects.toThrow(InactiveUserError);
  });

  it('rechaza con UserNotFoundError si el alumno no existe', async () => {
    userRepository.findById.mockImplementation(async (id) => (id === 'prof-2' ? profesor : null));

    await expect(
      useCase.execute({ invocadoPor: admin, alumnoId: 'no-existe', profesorId: 'prof-2' }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('rechaza con UserNotFoundError (no 403) si el alumno es de otro gym', async () => {
    userRepository.findById.mockImplementation(async (id) =>
      id === 'prof-2' ? profesor : { ...alumno, gymId: 'gym-OTRO' },
    );

    await expect(
      useCase.execute({ invocadoPor: admin, alumnoId: 'alum-1', profesorId: 'prof-2' }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('rechaza con InvalidCarteraRoleError si el alumnoId no tiene rol ALUMNO', async () => {
    userRepository.findById.mockImplementation(async (id) =>
      id === 'prof-2' ? profesor : { ...alumno, role: Role.PROFESOR },
    );

    await expect(
      useCase.execute({ invocadoPor: admin, alumnoId: 'alum-1', profesorId: 'prof-2' }),
    ).rejects.toThrow(InvalidCarteraRoleError);
  });

  it('rechaza con InactiveUserError si el alumno está desactivado', async () => {
    userRepository.findById.mockImplementation(async (id) =>
      id === 'prof-2' ? profesor : { ...alumno, activo: false },
    );

    await expect(
      useCase.execute({ invocadoPor: admin, alumnoId: 'alum-1', profesorId: 'prof-2' }),
    ).rejects.toThrow(InactiveUserError);
  });

  it('rechaza con CarteraLinkAlreadyExistsError si el vínculo ya existe', async () => {
    userRepository.findById.mockImplementation(async (id) => (id === 'prof-2' ? profesor : alumno));
    carteraRepository.existe.mockResolvedValue(true);

    await expect(
      useCase.execute({ invocadoPor: admin, alumnoId: 'alum-1', profesorId: 'prof-2' }),
    ).rejects.toThrow(CarteraLinkAlreadyExistsError);
    expect(carteraRepository.crear).not.toHaveBeenCalled();
  });

  it('crea el vínculo cuando todas las validaciones pasan', async () => {
    userRepository.findById.mockImplementation(async (id) => (id === 'prof-2' ? profesor : alumno));
    carteraRepository.existe.mockResolvedValue(false);
    const vinculoCreado = {
      id: 'link-1',
      gymId: 'gym-1',
      profesorId: 'prof-2',
      alumnoId: 'alum-1',
      asignadoEn: new Date(),
    };
    carteraRepository.crear.mockResolvedValue(vinculoCreado);

    const resultado = await useCase.execute({
      invocadoPor: admin,
      alumnoId: 'alum-1',
      profesorId: 'prof-2',
    });

    expect(carteraRepository.crear).toHaveBeenCalledWith({
      gymId: 'gym-1',
      profesorId: 'prof-2',
      alumnoId: 'alum-1',
    });
    expect(resultado).toEqual(vinculoCreado);
  });
});
