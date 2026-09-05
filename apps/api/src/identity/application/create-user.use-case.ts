import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../domain/role';
import { AuthenticatedUser } from '../domain/authenticated-user';
import { USER_REPOSITORY, UserRepositoryPort, UserRecord } from './ports/user-repository.port';
import { AUTH_PROVIDER, AuthProviderPort } from './ports/auth-provider.port';
import { RoleHierarchyError } from './errors/role-hierarchy.error';
import { DuplicateUsernameError } from './errors/duplicate-username.error';

export interface CreateProfesorInput {
  role: Role.PROFESOR;
  username: string;
  nombre: string;
  password: string;
  invocadoPor: AuthenticatedUser;
}

export interface CreateAlumnoInput {
  role: Role.ALUMNO;
  nombre: string;
  apellido: string;
  invocadoPor: AuthenticatedUser;
}

export type CreateUserInput = CreateProfesorInput | CreateAlumnoInput;

const ROLES_QUE_PUEDE_CREAR: Record<Role, Role[]> = {
  [Role.ADMIN]: [Role.PROFESOR, Role.ALUMNO],
  [Role.PROFESOR]: [Role.ALUMNO],
  [Role.ALUMNO]: [],
};

const MAX_INTENTOS_USERNAME = 1000;

/**
 * Alta manual de PROFESOR o ALUMNO — nunca ADMIN (no es una capacidad de
 * esta app). ADMIN puede crear PROFESOR o ALUMNO; PROFESOR solo ALUMNO.
 * Esta jerarquía se valida ACÁ, no solo vía `@Roles()` del endpoint (un
 * guard de rol solo valida "quién soy", no "a quién puedo crear").
 */
@Injectable()
export class CreateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProviderPort,
  ) {}

  async execute(input: CreateUserInput): Promise<UserRecord> {
    const rolesPermitidos = ROLES_QUE_PUEDE_CREAR[input.invocadoPor.role];
    if (!rolesPermitidos.includes(input.role)) {
      throw new RoleHierarchyError(input.invocadoPor.role, input.role);
    }

    const gymId = input.invocadoPor.gymId;

    if (input.role === Role.PROFESOR) {
      return this.crearProfesor(gymId, input);
    }
    return this.crearAlumno(gymId, input);
  }

  private async crearProfesor(gymId: string, input: CreateProfesorInput): Promise<UserRecord> {
    const existente = await this.userRepository.findByGymIdAndUsername(gymId, input.username);
    if (existente) {
      throw new DuplicateUsernameError(input.username, gymId);
    }

    const { authUserId } = await this.authProvider.createStaffUser(
      gymId,
      input.username,
      input.password,
    );

    try {
      return await this.userRepository.create({
        gymId,
        authUserId,
        username: input.username,
        nombre: input.nombre,
        role: Role.PROFESOR,
      });
    } catch (error) {
      // Best-effort: si falla, queda un usuario Supabase huérfano que hay
      // que limpiar manualmente — no existe (todavía) un mecanismo de
      // reconciliación asincrónica, está fuera de alcance de este fix.
      try {
        await this.authProvider.deleteAuthUser(authUserId);
      } catch {
        // Swallow: la compensación es best-effort, el error original manda.
      }
      throw error;
    }
  }

  private async crearAlumno(gymId: string, input: CreateAlumnoInput): Promise<UserRecord> {
    const username = await this.generarUsernameDisponible(gymId, input.nombre, input.apellido);

    const { authUserId } = await this.authProvider.createAlumnoUser(gymId, username);

    try {
      return await this.userRepository.create({
        gymId,
        authUserId,
        username,
        nombre: `${input.nombre} ${input.apellido}`,
        role: Role.ALUMNO,
      });
    } catch (error) {
      // Best-effort: si falla, queda un usuario Supabase huérfano que hay
      // que limpiar manualmente — no existe (todavía) un mecanismo de
      // reconciliación asincrónica, está fuera de alcance de este fix.
      try {
        await this.authProvider.deleteAuthUser(authUserId);
      } catch {
        // Swallow: la compensación es best-effort, el error original manda.
      }
      throw error;
    }
  }

  private async generarUsernameDisponible(
    gymId: string,
    nombre: string,
    apellido: string,
  ): Promise<string> {
    const base = `${this.normalizar(nombre)}.${this.normalizar(apellido)}`;

    for (let intento = 0; intento < MAX_INTENTOS_USERNAME; intento += 1) {
      const candidato = intento === 0 ? base : `${base}${intento + 1}`;
      const existente = await this.userRepository.findByGymIdAndUsername(gymId, candidato);
      if (!existente) {
        return candidato;
      }
    }

    throw new Error(
      `No se pudo generar un username disponible a partir de '${base}' tras ${MAX_INTENTOS_USERNAME} intentos`,
    );
  }

  private normalizar(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }
}
