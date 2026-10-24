import { Role } from '../domain/role';
import { resolverAlumnoGestionable } from './resolver-alumno-gestionable';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { CarteraRepositoryPort } from './ports/cartera-repository.port';
import { InsufficientRoleError } from './errors/insufficient-role.error';
import { UserNotFoundError } from './errors/user-not-found.error';
import { CannotTargetAdminError } from './errors/cannot-target-admin.error';
import { AlumnoNotInCarteraError } from '../../routines/application/errors/alumno-not-in-cartera.error';

describe('resolverAlumnoGestionable', () => {
  let userRepository: jest.Mocked<Pick<UserRepositoryPort, 'findById'>>;
  let carteraRepository: jest.Mocked<Pick<CarteraRepositoryPort, 'existe'>>;

  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };
  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const alumno: UserRecord = {
    id: 'alum-1',
    authUserId: 'auth-a1',
    gymId: 'gym-1',
    username: 'ana',
    nombre: 'Ana',
    role: Role.ALUMNO,
    activo: true,
  };

  const resolver = (invocadoPor: typeof admin | typeof profesor) =>
    resolverAlumnoGestionable(
      userRepository as unknown as UserRepositoryPort,
      carteraRepository as unknown as CarteraRepositoryPort,
      invocadoPor,
      'alum-1',
    );

  beforeEach(() => {
    userRepository = { findById: jest.fn().mockResolvedValue(alumno) };
    carteraRepository = { existe: jest.fn().mockResolvedValue(true) };
  });

  it('el ADMIN resuelve a cualquier usuario no admin de su gym, sin mirar la cartera', async () => {
    userRepository.findById.mockResolvedValue({ ...alumno, role: Role.PROFESOR });
    await expect(resolver(admin)).resolves.toMatchObject({ role: Role.PROFESOR });
    expect(carteraRepository.existe).not.toHaveBeenCalled();
  });

  it('el PROFESOR resuelve a un alumno de su cartera', async () => {
    await expect(resolver(profesor)).resolves.toBe(alumno);
    expect(carteraRepository.existe).toHaveBeenCalledWith('prof-1', 'alum-1');
  });

  it('el PROFESOR no puede sobre un alumno que no está en su cartera', async () => {
    carteraRepository.existe.mockResolvedValue(false);
    await expect(resolver(profesor)).rejects.toThrow(AlumnoNotInCarteraError);
  });

  it('el PROFESOR no puede sobre otro profesor: responde como si no existiera', async () => {
    userRepository.findById.mockResolvedValue({ ...alumno, role: Role.PROFESOR });
    await expect(resolver(profesor)).rejects.toThrow(UserNotFoundError);
  });

  it('nadie puede sobre un ADMIN', async () => {
    userRepository.findById.mockResolvedValue({ ...alumno, role: Role.ADMIN });
    await expect(resolver(admin)).rejects.toThrow(CannotTargetAdminError);
    await expect(resolver(profesor)).rejects.toThrow(CannotTargetAdminError);
  });

  it('un usuario de otro gym responde como si no existiera', async () => {
    userRepository.findById.mockResolvedValue({ ...alumno, gymId: 'gym-OTRO' });
    await expect(resolver(profesor)).rejects.toThrow(UserNotFoundError);
  });

  it('un rol que no es ADMIN ni PROFESOR no puede', async () => {
    await expect(
      resolver({ id: 'a', gymId: 'gym-1', role: Role.ALUMNO } as unknown as typeof admin),
    ).rejects.toThrow(InsufficientRoleError);
    expect(userRepository.findById).not.toHaveBeenCalled();
  });
});
