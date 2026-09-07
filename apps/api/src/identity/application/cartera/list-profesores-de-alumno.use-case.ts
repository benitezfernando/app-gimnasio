import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../domain/role';
import { AuthenticatedUser } from '../../domain/authenticated-user';
import { CARTERA_REPOSITORY, CarteraRepositoryPort } from '../ports/cartera-repository.port';
import { USER_REPOSITORY, UserRepositoryPort, UserRecord } from '../ports/user-repository.port';
import { resolveUserInGym } from '../resolve-user-in-gym';
import { InsufficientRoleError } from '../errors/insufficient-role.error';

export interface ListProfesoresDeAlumnoInput {
  invocadoPor: AuthenticatedUser;
  alumnoId: string;
}

const ROLES_QUE_PUEDEN_VER_CARTERA_AJENA: Role[] = [Role.ADMIN];

@Injectable()
export class ListProfesoresDeAlumnoUseCase {
  constructor(
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
  ) {}

  async execute(input: ListProfesoresDeAlumnoInput): Promise<UserRecord[]> {
    if (!ROLES_QUE_PUEDEN_VER_CARTERA_AJENA.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_VER_CARTERA_AJENA);
    }

    await resolveUserInGym(this.userRepository, input.alumnoId, input.invocadoPor.gymId);

    return this.carteraRepository.findProfesoresDeAlumno(input.alumnoId);
  }
}
