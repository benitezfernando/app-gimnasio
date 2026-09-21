import { Role } from '../domain/role';
import { EditUserUseCase } from './edit-user.use-case';
import { AuthProviderPort } from './ports/auth-provider.port';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { CarteraRepositoryPort } from './ports/cartera-repository.port';
import { CannotEditAdminError } from './errors/cannot-edit-admin.error';
import { AlumnoHasNoPasswordError } from './errors/alumno-has-no-password.error';
import { UserNotFoundError } from './errors/user-not-found.error';
import { AlumnoNotInCarteraError } from '../../routines/application/errors/alumno-not-in-cartera.error';

describe('EditUserUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let authProvider: jest.Mocked<AuthProviderPort>;
  let carteraRepository: jest.Mocked<CarteraRepositoryPort>;
  let useCase: EditUserUseCase;

  const admin: UserRecord = {
    id: 'admin-1',
    authUserId: 'auth-admin',
    gymId: 'gym-1',
    username: 'admin1',
    nombre: 'Admin',
    role: Role.ADMIN,
    activo: true,
  };
  const profesorInvocador: UserRecord = {
    id: 'prof-1',
    authUserId: 'auth-prof',
    gymId: 'gym-1',
    username: 'prof1',
    nombre: 'Profe',
    role: Role.PROFESOR,
    activo: true,
  };
  const profesorObjetivo: UserRecord = {
    id: 'prof-2',
    authUserId: 'auth-prof2',
    gymId: 'gym-1',
    username: 'prof2',
    nombre: 'Profe Dos',
    role: Role.PROFESOR,
    activo: true,
  };
  const alumno: UserRecord = {
    id: 'alum-1',
    authUserId: 'auth-alum',
    gymId: 'gym-1',
    username: 'juan.perez',
    nombre: 'Juan Perez',
    role: Role.ALUMNO,
    activo: true,
  };
  const alumnoOtroGym: UserRecord = { ...alumno, id: 'alum-2', gymId: 'gym-2' };
  const otroAdmin: UserRecord = { ...admin, id: 'admin-2' };

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
    carteraRepository = {
      existe: jest.fn(),
      crear: jest.fn(),
      eliminar: jest.fn(),
      findAlumnosDeProfesor: jest.fn(),
      findProfesoresDeAlumno: jest.fn(),
    };
    useCase = new EditUserUseCase(userRepository, authProvider, carteraRepository);
  });

  it('ADMIN edita nombre de un PROFESOR de su gym', async () => {
    userRepository.findById.mockResolvedValue(profesorObjetivo);
    userRepository.updateNombre.mockResolvedValue({ ...profesorObjetivo, nombre: 'Nuevo Nombre' });

    const resultado = await useCase.execute({
      invocadoPor: { id: admin.id, gymId: admin.gymId, role: Role.ADMIN },
      userId: profesorObjetivo.id,
      nombre: 'Nuevo Nombre',
    });

    expect(userRepository.updateNombre).toHaveBeenCalledWith(profesorObjetivo.id, 'Nuevo Nombre');
    expect(resultado.nombre).toBe('Nuevo Nombre');
  });

  it('ADMIN edita la password de un PROFESOR de su gym', async () => {
    userRepository.findById.mockResolvedValue(profesorObjetivo);

    await useCase.execute({
      invocadoPor: { id: admin.id, gymId: admin.gymId, role: Role.ADMIN },
      userId: profesorObjetivo.id,
      password: 'nueva-password-123',
    });

    expect(authProvider.updateStaffPassword).toHaveBeenCalledWith(
      profesorObjetivo.authUserId,
      'nueva-password-123',
    );
    expect(userRepository.updateNombre).not.toHaveBeenCalled();
  });

  it('ADMIN no puede editar un usuario de otro gym (404, anti-enumeración)', async () => {
    userRepository.findById.mockResolvedValue(alumnoOtroGym);

    await expect(
      useCase.execute({
        invocadoPor: { id: admin.id, gymId: admin.gymId, role: Role.ADMIN },
        userId: alumnoOtroGym.id,
        nombre: 'X',
      }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('ADMIN no puede editar otro ADMIN por esta vía', async () => {
    userRepository.findById.mockResolvedValue(otroAdmin);

    await expect(
      useCase.execute({
        invocadoPor: { id: admin.id, gymId: admin.gymId, role: Role.ADMIN },
        userId: otroAdmin.id,
        nombre: 'X',
      }),
    ).rejects.toThrow(CannotEditAdminError);
  });

  it('setear password a un ALUMNO rechaza con AlumnoHasNoPasswordError', async () => {
    userRepository.findById.mockResolvedValue(alumno);

    await expect(
      useCase.execute({
        invocadoPor: { id: admin.id, gymId: admin.gymId, role: Role.ADMIN },
        userId: alumno.id,
        password: 'lo-que-sea',
      }),
    ).rejects.toThrow(AlumnoHasNoPasswordError);
  });

  it('PROFESOR edita el nombre de un ALUMNO de su cartera', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(true);
    userRepository.updateNombre.mockResolvedValue({ ...alumno, nombre: 'Juan P.' });

    const resultado = await useCase.execute({
      invocadoPor: {
        id: profesorInvocador.id,
        gymId: profesorInvocador.gymId,
        role: Role.PROFESOR,
      },
      userId: alumno.id,
      nombre: 'Juan P.',
    });

    expect(carteraRepository.existe).toHaveBeenCalledWith(profesorInvocador.id, alumno.id);
    expect(resultado.nombre).toBe('Juan P.');
  });

  it('PROFESOR no puede editar un ALUMNO fuera de su cartera', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.existe.mockResolvedValue(false);

    await expect(
      useCase.execute({
        invocadoPor: {
          id: profesorInvocador.id,
          gymId: profesorInvocador.gymId,
          role: Role.PROFESOR,
        },
        userId: alumno.id,
        nombre: 'X',
      }),
    ).rejects.toThrow(AlumnoNotInCarteraError);
  });

  it('PROFESOR no puede editar a otro PROFESOR', async () => {
    userRepository.findById.mockResolvedValue(profesorObjetivo);

    await expect(
      useCase.execute({
        invocadoPor: {
          id: profesorInvocador.id,
          gymId: profesorInvocador.gymId,
          role: Role.PROFESOR,
        },
        userId: profesorObjetivo.id,
        nombre: 'X',
      }),
    ).rejects.toThrow(UserNotFoundError);
  });
});
