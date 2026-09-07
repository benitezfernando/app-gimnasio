import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../identity/domain/role';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import {
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateRepositoryPort,
  RoutineTemplateSummary,
} from './ports/routine-template-repository.port';

export interface CreateRoutineTemplateInput {
  invocadoPor: AuthenticatedUser;
  nombre: string;
  descripcion?: string;
}

const ROLES_QUE_PUEDEN_CREAR: Role[] = [Role.PROFESOR];

@Injectable()
export class CreateRoutineTemplateUseCase {
  constructor(
    @Inject(ROUTINE_TEMPLATE_REPOSITORY)
    private readonly templateRepository: RoutineTemplateRepositoryPort,
  ) {}

  async execute(input: CreateRoutineTemplateInput): Promise<RoutineTemplateSummary> {
    if (!ROLES_QUE_PUEDEN_CREAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_CREAR);
    }

    return this.templateRepository.create({
      gymId: input.invocadoPor.gymId,
      profesorId: input.invocadoPor.id,
      nombre: input.nombre,
      descripcion: input.descripcion ?? null,
    });
  }
}
