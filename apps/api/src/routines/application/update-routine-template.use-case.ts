import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../identity/domain/role';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import {
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateRepositoryPort,
  RoutineTemplateSummary,
} from './ports/routine-template-repository.port';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';

export interface UpdateRoutineTemplateInput {
  invocadoPor: AuthenticatedUser;
  templateId: string;
  nombre?: string;
  descripcion?: string;
  activa?: boolean;
}

const ROLES_QUE_PUEDEN_EDITAR: Role[] = [Role.PROFESOR];

@Injectable()
export class UpdateRoutineTemplateUseCase {
  constructor(
    @Inject(ROUTINE_TEMPLATE_REPOSITORY)
    private readonly templateRepository: RoutineTemplateRepositoryPort,
  ) {}

  async execute(input: UpdateRoutineTemplateInput): Promise<RoutineTemplateSummary> {
    if (!ROLES_QUE_PUEDEN_EDITAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_EDITAR);
    }

    const template = await this.templateRepository.findById(input.templateId);
    if (!template || template.profesorId !== input.invocadoPor.id) {
      throw new RoutineTemplateNotFoundError(input.templateId);
    }

    return this.templateRepository.update(input.templateId, {
      nombre: input.nombre,
      descripcion: input.descripcion,
      activa: input.activa,
    });
  }
}
