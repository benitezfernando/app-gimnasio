import { Role } from '../domain/role';
import { ReactivateUserUseCase } from './reactivate-user.use-case';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { CarteraRepositoryPort } from './ports/cartera-repository.port';
import { InsufficientRoleError } from './errors/insufficient-role.error';
import { AlumnoNotInCarteraError } from '../../routines/application/errors/alumno-not-in-cartera.error';

describe('ReactivateUserUseCase', () => {
  let userRepository: jest.Mocked<Pick<UserRepositoryPort, 'findById' | 'reactivate'>>;
  let carteraRepository: jest.Mocked<Pick<CarteraRepositoryPort, 'existe'>>;
  let useCase: ReactivateUserUseCase;

  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };
  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const alumnoInactivo: UserRecord = {
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
      findById: jest.fn().mockResolvedValue(alumnoInactivo),
      reactivate: jest.fn().mockResolvedValue({ ...alumnoInactivo, activo: true }),
    };
    carteraRepository = { existe: jest.fn().mockResolvedValue(true) };
    useCase = new ReactivateUserUseCase(
      userRepository as unknown as UserRepositoryPort,
      carteraRepository as unknown as CarteraRepositoryPort,
    );
  });

  it('PROFESOR reactiva a un alumno de su cartera', async () => {
    const resultado = await useCase.execute({ invocadoPor: profesor, userId: 'alum-1' });

    expect(userRepository.reactivate).toHaveBeenCalledWith('alum-1');
    expect(resultado.activo).toBe(true);
  });

  it('PROFESOR no reactiva a un alumno ajeno', async () => {
    carteraRepository.existe.mockResolvedValue(false);

    await expect(useCase.execute({ invocadoPor: profesor, userId: 'alum-1' })).rejects.toThrow(
      AlumnoNotInCarteraError,
    );
    expect(userRepository.reactivate).not.toHaveBeenCalled();
  });

  it('ADMIN reactiva a un usuario de su gym', async () => {
    await useCase.execute({ invocadoPor: admin, userId: 'alum-1' });
    expect(userRepository.reactivate).toHaveBeenCalledWith('alum-1');
  });

  it('un ALUMNO no puede reactivar a nadie', async () => {
    const alumno = { id: 'alum-9', gymId: 'gym-1', role: Role.ALUMNO };
    await expect(useCase.execute({ invocadoPor: alumno, userId: 'alum-1' })).rejects.toThrow(
      InsufficientRoleError,
    );
  });
});
