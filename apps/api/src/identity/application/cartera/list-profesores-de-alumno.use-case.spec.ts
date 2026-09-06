import { Role } from '../../domain/role';
import { ListProfesoresDeAlumnoUseCase } from './list-profesores-de-alumno.use-case';
import { CarteraRepositoryPort } from '../ports/cartera-repository.port';
import { UserRepositoryPort, UserRecord } from '../ports/user-repository.port';
import { InsufficientRoleError } from '../errors/insufficient-role.error';
import { UserNotFoundError } from '../errors/user-not-found.error';

describe('ListProfesoresDeAlumnoUseCase', () => {
  let carteraRepository: jest.Mocked<CarteraRepositoryPort>;
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let useCase: ListProfesoresDeAlumnoUseCase;

  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };
  const profesorInvocador = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };

  const alumno: UserRecord = {
    id: 'alum-1',
    authUserId: 'a-alum',
    gymId: 'gym-1',
    username: 'juan.perez',
    nombre: 'Juan Perez',
    role: Role.ALUMNO,
    activo: true,
  };

  const profesores: UserRecord[] = [
    {
      id: 'prof-2',
      authUserId: 'a-prof',
      gymId: 'gym-1',
      username: 'prof2',
      nombre: 'Profe Dos',
      role: Role.PROFESOR,
      activo: true,
    },
  ];

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
    useCase = new ListProfesoresDeAlumnoUseCase(carteraRepository, userRepository);
  });

  it('rechaza si quien invoca no es ADMIN', async () => {
    await expect(
      useCase.execute({ invocadoPor: profesorInvocador, alumnoId: 'alum-1' }),
    ).rejects.toThrow(InsufficientRoleError);
  });

  it('rechaza con UserNotFoundError si el alumno no existe o es de otro gym', async () => {
    userRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute({ invocadoPor: admin, alumnoId: 'no-existe' })).rejects.toThrow(
      UserNotFoundError,
    );
  });

  it('rechaza con UserNotFoundError si el alumno es de otro gym (no solo si no existe)', async () => {
    userRepository.findById.mockResolvedValue({ ...alumno, gymId: 'gym-OTRO' });

    await expect(useCase.execute({ invocadoPor: admin, alumnoId: 'alum-1' })).rejects.toThrow(
      UserNotFoundError,
    );
  });

  it('devuelve los profesores asignados al alumno', async () => {
    userRepository.findById.mockResolvedValue(alumno);
    carteraRepository.findProfesoresDeAlumno.mockResolvedValue(profesores);

    const resultado = await useCase.execute({ invocadoPor: admin, alumnoId: 'alum-1' });

    expect(carteraRepository.findProfesoresDeAlumno).toHaveBeenCalledWith('alum-1');
    expect(resultado).toEqual(profesores);
  });
});
