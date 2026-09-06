import { Role } from '../domain/role';
import { CreateUserUseCase } from './create-user.use-case';
import { UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { AuthProviderPort } from './ports/auth-provider.port';
import { RoleHierarchyError } from './errors/role-hierarchy.error';
import { DuplicateUsernameError } from './errors/duplicate-username.error';

describe('CreateUserUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let authProvider: jest.Mocked<AuthProviderPort>;
  let useCase: CreateUserUseCase;

  const admin = { id: 'admin-1', gymId: 'gym-1', role: Role.ADMIN };
  const profesor = { id: 'prof-1', gymId: 'gym-1', role: Role.PROFESOR };
  const alumno = { id: 'alum-1', gymId: 'gym-1', role: Role.ALUMNO };

  beforeEach(() => {
    userRepository = {
      findByAuthUserId: jest.fn(),
      findByGymIdAndUsername: jest.fn(),
      findByGymId: jest.fn(),
      findById: jest.fn(),
      deactivate: jest.fn(),
      create: jest.fn(),
    };
    authProvider = {
      createStaffUser: jest.fn(),
      createAlumnoUser: jest.fn(),
      signInStaff: jest.fn(),
      signInAlumno: jest.fn(),
      refreshSession: jest.fn(),
      deleteAuthUser: jest.fn(),
    };
    useCase = new CreateUserUseCase(userRepository, authProvider);
  });

  describe('jerarquía de quién crea a quién', () => {
    it('ALUMNO no puede crear a nadie', async () => {
      await expect(
        useCase.execute({ role: Role.ALUMNO, nombre: 'X', apellido: 'Y', invocadoPor: alumno }),
      ).rejects.toThrow(RoleHierarchyError);
      expect(authProvider.createAlumnoUser).not.toHaveBeenCalled();
    });

    it('PROFESOR no puede crear otro PROFESOR', async () => {
      await expect(
        useCase.execute({
          role: Role.PROFESOR,
          username: 'nuevo.profe',
          nombre: 'Nuevo',
          password: 'password123',
          invocadoPor: profesor,
        }),
      ).rejects.toThrow(RoleHierarchyError);
      expect(authProvider.createStaffUser).not.toHaveBeenCalled();
    });

    it('PROFESOR sí puede crear ALUMNO', async () => {
      userRepository.findByGymIdAndUsername.mockResolvedValue(null);
      authProvider.createAlumnoUser.mockResolvedValue({ authUserId: 'auth-x' });
      userRepository.create.mockResolvedValue({
        id: 'u1',
        authUserId: 'auth-x',
        gymId: 'gym-1',
        username: 'juan.perez',
        nombre: 'Juan Perez',
        role: Role.ALUMNO,
        activo: true,
      });

      await expect(
        useCase.execute({
          role: Role.ALUMNO,
          nombre: 'Juan',
          apellido: 'Perez',
          invocadoPor: profesor,
        }),
      ).resolves.toBeDefined();
    });

    it('ADMIN puede crear PROFESOR', async () => {
      userRepository.findByGymIdAndUsername.mockResolvedValue(null);
      authProvider.createStaffUser.mockResolvedValue({ authUserId: 'auth-p' });
      userRepository.create.mockResolvedValue({
        id: 'u2',
        authUserId: 'auth-p',
        gymId: 'gym-1',
        username: 'nuevo.profe',
        nombre: 'Nuevo',
        role: Role.PROFESOR,
        activo: true,
      });

      await expect(
        useCase.execute({
          role: Role.PROFESOR,
          username: 'nuevo.profe',
          nombre: 'Nuevo',
          password: 'password123',
          invocadoPor: admin,
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('alta de PROFESOR', () => {
    it('rechaza si el username ya existe en el gym', async () => {
      userRepository.findByGymIdAndUsername.mockResolvedValue({
        id: 'existing',
        authUserId: 'a',
        gymId: 'gym-1',
        username: 'nuevo.profe',
        nombre: 'X',
        role: Role.PROFESOR,
        activo: true,
      });

      await expect(
        useCase.execute({
          role: Role.PROFESOR,
          username: 'nuevo.profe',
          nombre: 'Nuevo',
          password: 'password123',
          invocadoPor: admin,
        }),
      ).rejects.toThrow(DuplicateUsernameError);
      expect(authProvider.createStaffUser).not.toHaveBeenCalled();
    });

    it('crea con la password real recibida, tal cual', async () => {
      userRepository.findByGymIdAndUsername.mockResolvedValue(null);
      authProvider.createStaffUser.mockResolvedValue({ authUserId: 'auth-p' });
      userRepository.create.mockResolvedValue({
        id: 'u2',
        authUserId: 'auth-p',
        gymId: 'gym-1',
        username: 'nuevo.profe',
        nombre: 'Nuevo',
        role: Role.PROFESOR,
        activo: true,
      });

      await useCase.execute({
        role: Role.PROFESOR,
        username: 'nuevo.profe',
        nombre: 'Nuevo',
        password: 'password123',
        invocadoPor: admin,
      });

      expect(authProvider.createStaffUser).toHaveBeenCalledWith(
        'gym-1',
        'nuevo.profe',
        'password123',
      );
      expect(userRepository.create).toHaveBeenCalledWith({
        gymId: 'gym-1',
        authUserId: 'auth-p',
        username: 'nuevo.profe',
        nombre: 'Nuevo',
        role: Role.PROFESOR,
      });
    });

    it('si userRepository.create falla, compensa borrando el usuario de Supabase y re-lanza el error original', async () => {
      userRepository.findByGymIdAndUsername.mockResolvedValue(null);
      authProvider.createStaffUser.mockResolvedValue({ authUserId: 'auth-p' });
      const errorOriginal = new DuplicateUsernameError('nuevo.profe', 'gym-1');
      userRepository.create.mockRejectedValue(errorOriginal);

      await expect(
        useCase.execute({
          role: Role.PROFESOR,
          username: 'nuevo.profe',
          nombre: 'Nuevo',
          password: 'password123',
          invocadoPor: admin,
        }),
      ).rejects.toThrow(errorOriginal);

      expect(authProvider.deleteAuthUser).toHaveBeenCalledWith('auth-p');
    });
  });

  describe('alta de ALUMNO', () => {
    it('genera el username como nombre.apellido en minúsculas, sin password/username como input', async () => {
      userRepository.findByGymIdAndUsername.mockResolvedValue(null);
      authProvider.createAlumnoUser.mockResolvedValue({ authUserId: 'auth-a' });
      userRepository.create.mockResolvedValue({
        id: 'u3',
        authUserId: 'auth-a',
        gymId: 'gym-1',
        username: 'juan.perez',
        nombre: 'Juan Perez',
        role: Role.ALUMNO,
        activo: true,
      });

      const resultado = await useCase.execute({
        role: Role.ALUMNO,
        nombre: 'Juan',
        apellido: 'Perez',
        invocadoPor: admin,
      });

      expect(userRepository.findByGymIdAndUsername).toHaveBeenCalledWith('gym-1', 'juan.perez');
      expect(authProvider.createAlumnoUser).toHaveBeenCalledWith('gym-1', 'juan.perez');
      expect(resultado.username).toBe('juan.perez');
    });

    it('normaliza acentos y mayúsculas (José Pérez -> jose.perez)', async () => {
      userRepository.findByGymIdAndUsername.mockResolvedValue(null);
      authProvider.createAlumnoUser.mockResolvedValue({ authUserId: 'auth-b' });
      userRepository.create.mockImplementation(async (data) => ({
        ...data,
        id: 'u4',
        activo: true,
      }));

      const resultado = await useCase.execute({
        role: Role.ALUMNO,
        nombre: 'José',
        apellido: 'Pérez',
        invocadoPor: admin,
      });

      expect(resultado.username).toBe('jose.perez');
    });

    it('agrega sufijo numérico incremental si el username base ya existe (juan.perez -> juan.perez2)', async () => {
      userRepository.findByGymIdAndUsername.mockImplementation(async (_gymId, username) =>
        username === 'juan.perez'
          ? {
              id: 'otro',
              authUserId: 'auth-otro',
              gymId: 'gym-1',
              username: 'juan.perez',
              nombre: 'Otro Juan',
              role: Role.ALUMNO,
              activo: true,
            }
          : null,
      );
      authProvider.createAlumnoUser.mockResolvedValue({ authUserId: 'auth-c' });
      userRepository.create.mockImplementation(async (data) => ({
        ...data,
        id: 'u5',
        activo: true,
      }));

      const resultado = await useCase.execute({
        role: Role.ALUMNO,
        nombre: 'Juan',
        apellido: 'Perez',
        invocadoPor: admin,
      });

      expect(resultado.username).toBe('juan.perez2');
      expect(authProvider.createAlumnoUser).toHaveBeenCalledWith('gym-1', 'juan.perez2');
    });

    it('devuelve el username generado en el resultado (para que el creador se lo comunique al alumno)', async () => {
      userRepository.findByGymIdAndUsername.mockResolvedValue(null);
      authProvider.createAlumnoUser.mockResolvedValue({ authUserId: 'auth-d' });
      userRepository.create.mockImplementation(async (data) => ({
        ...data,
        id: 'u6',
        activo: true,
      }));

      const resultado = await useCase.execute({
        role: Role.ALUMNO,
        nombre: 'Ana',
        apellido: 'Gomez',
        invocadoPor: admin,
      });

      expect(resultado.username).toBe('ana.gomez');
    });

    it('si userRepository.create falla, compensa borrando el usuario de Supabase y re-lanza el error original', async () => {
      userRepository.findByGymIdAndUsername.mockResolvedValue(null);
      authProvider.createAlumnoUser.mockResolvedValue({ authUserId: 'auth-a' });
      const errorOriginal = new Error('P2002: unique constraint violation');
      userRepository.create.mockRejectedValue(errorOriginal);

      await expect(
        useCase.execute({
          role: Role.ALUMNO,
          nombre: 'Juan',
          apellido: 'Perez',
          invocadoPor: admin,
        }),
      ).rejects.toThrow(errorOriginal);

      expect(authProvider.deleteAuthUser).toHaveBeenCalledWith('auth-a');
    });
  });

  describe('cartera automática al crear alumno (HU-02, regla 9)', () => {
    it('si el alta la hace un PROFESOR, pasa el vínculo de cartera a userRepository.create', async () => {
      userRepository.findByGymIdAndUsername.mockResolvedValue(null);
      authProvider.createAlumnoUser.mockResolvedValue({ authUserId: 'auth-x' });
      userRepository.create.mockResolvedValue({
        id: 'u1',
        authUserId: 'auth-x',
        gymId: 'gym-1',
        username: 'juan.perez',
        nombre: 'Juan Perez',
        role: Role.ALUMNO,
        activo: true,
      });

      await useCase.execute({
        role: Role.ALUMNO,
        nombre: 'Juan',
        apellido: 'Perez',
        invocadoPor: profesor,
      });

      expect(userRepository.create).toHaveBeenCalledWith(
        {
          gymId: 'gym-1',
          authUserId: 'auth-x',
          username: 'juan.perez',
          nombre: 'Juan Perez',
          role: Role.ALUMNO,
        },
        { profesorId: 'prof-1' },
      );
    });

    it('si el alta la hace un ADMIN, NO pasa ningún vínculo de cartera', async () => {
      userRepository.findByGymIdAndUsername.mockResolvedValue(null);
      authProvider.createAlumnoUser.mockResolvedValue({ authUserId: 'auth-y' });
      userRepository.create.mockResolvedValue({
        id: 'u2',
        authUserId: 'auth-y',
        gymId: 'gym-1',
        username: 'ana.gomez',
        nombre: 'Ana Gomez',
        role: Role.ALUMNO,
        activo: true,
      });

      await useCase.execute({
        role: Role.ALUMNO,
        nombre: 'Ana',
        apellido: 'Gomez',
        invocadoPor: admin,
      });

      expect(userRepository.create).toHaveBeenCalledWith({
        gymId: 'gym-1',
        authUserId: 'auth-y',
        username: 'ana.gomez',
        nombre: 'Ana Gomez',
        role: Role.ALUMNO,
      });
    });
  });
});
