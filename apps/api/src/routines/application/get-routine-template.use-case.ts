import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../identity/domain/role';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import {
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateDetail,
  RoutineTemplateRepositoryPort,
} from './ports/routine-template-repository.port';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';

export interface GetRoutineTemplateInput {
  invocadoPor: AuthenticatedUser;
  templateId: string;
}

const ROLES_QUE_PUEDEN_VER: Role[] = [Role.PROFESOR];

@Injectable()
export class GetRoutineTemplateUseCase {
  constructor(
    @Inject(ROUTINE_TEMPLATE_REPOSITORY)
    private readonly templateRepository: RoutineTemplateRepositoryPort,
  ) {}

  async execute(input: GetRoutineTemplateInput): Promise<RoutineTemplateDetail> {
    if (!ROLES_QUE_PUEDEN_VER.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_VER);
    }

    const template = await this.templateRepository.findById(input.templateId);
    if (!template || template.profesorId !== input.invocadoPor.id) {
      throw new RoutineTemplateNotFoundError(input.templateId);
    }

    return template;
  }
}
