import { DomainError } from '../../../shared-kernel/domain-error';

export class RoutineTemplateNotFoundError extends DomainError {
  readonly httpStatus = 404;

  constructor(templateId: string) {
    super(`No existe una plantilla con id '${templateId}' que te pertenezca.`);
    this.name = 'RoutineTemplateNotFoundError';
  }
}
