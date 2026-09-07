import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../identity/domain/role';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import {
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateRepositoryPort,
  RoutineTemplateSummary,
} from './ports/routine-template-repository.port';

export interface ListRoutineTemplatesInput {
  invocadoPor: AuthenticatedUser;
}

const ROLES_QUE_PUEDEN_LISTAR: Role[] = [Role.PROFESOR];

@Injectable()
export class ListRoutineTemplatesUseCase {
  constructor(
    @Inject(ROUTINE_TEMPLATE_REPOSITORY)
    private readonly templateRepository: RoutineTemplateRepositoryPort,
  ) {}

  async execute(input: ListRoutineTemplatesInput): Promise<RoutineTemplateSummary[]> {
    if (!ROLES_QUE_PUEDEN_LISTAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_LISTAR);
    }
    return this.templateRepository.findByProfesor(input.invocadoPor.id);
  }
}
