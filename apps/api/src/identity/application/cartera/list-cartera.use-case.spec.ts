import { Role } from '../../domain/role';
import { ListCarteraUseCase } from './list-cartera.use-case';
import { CarteraRepositoryPort } from '../ports/cartera-repository.port';
import { UserRecord } from '../ports/user-repository.port';
import { InsufficientRoleError } from '../errors/insufficient-role.error';

describe('ListCarteraUseCase', () => {
  let carteraRepository: jest.Mocked<CarteraRepositoryPort>;
  let useCase: ListCarteraUseCase;

  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };

  const alumnos: UserRecord[] = [
    {
      id: 'alum-1',
      authUserId: 'a1',
      gymId: 'gym-1',
      username: 'juan.perez',
      nombre: 'Juan Perez',
      role: Role.ALUMNO,
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
    useCase = new ListCarteraUseCase(carteraRepository);
  });

  it('rechaza si quien invoca no es PROFESOR', async () => {
    await expect(useCase.execute({ invocadoPor: admin })).rejects.toThrow(InsufficientRoleError);
  });

  it('devuelve los alumnos del profesor autenticado, nunca de un profesorId externo', async () => {
    carteraRepository.findAlumnosDeProfesor.mockResolvedValue(alumnos);

    const resultado = await useCase.execute({ invocadoPor: profesor });

    expect(carteraRepository.findAlumnosDeProfesor).toHaveBeenCalledWith('prof-1');
    expect(resultado).toEqual(alumnos);
  });
});
