import { DomainError } from '../../../shared-kernel/domain-error';

/** Gate del hard-delete de plantillas (PRD §6 regla 11, HU-07). */
export class TemplateNotInactiveError extends DomainError {
  readonly httpStatus = 409;

  constructor(templateId: string) {
    super(
      `La plantilla '${templateId}' está activa — desactivala antes de eliminarla definitivamente.`,
    );
    this.name = 'TemplateNotInactiveError';
  }
}
