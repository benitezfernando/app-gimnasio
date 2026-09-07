import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../identity/domain/role';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import {
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateRepositoryPort,
} from './ports/routine-template-repository.port';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';
import { TemplateNotInactiveError } from './errors/template-not-inactive.error';

export interface DeleteRoutineTemplateInput {
  invocadoPor: AuthenticatedUser;
  templateId: string;
}

const ROLES_QUE_PUEDEN_ELIMINAR: Role[] = [Role.PROFESOR];

/** Gate del hard-delete (HLD, "Convención de hard-delete", PRD §6 regla 11). */
@Injectable()
export class DeleteRoutineTemplateUseCase {
  constructor(
    @Inject(ROUTINE_TEMPLATE_REPOSITORY)
    private readonly templateRepository: RoutineTemplateRepositoryPort,
  ) {}

  async execute(input: DeleteRoutineTemplateInput): Promise<void> {
    if (!ROLES_QUE_PUEDEN_ELIMINAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_ELIMINAR);
    }

    const template = await this.templateRepository.findById(input.templateId);
    if (!template || template.profesorId !== input.invocadoPor.id) {
      throw new RoutineTemplateNotFoundError(input.templateId);
    }

    if (template.activa) {
      throw new TemplateNotInactiveError(input.templateId);
    }

    await this.templateRepository.delete(input.templateId);
  }
}
