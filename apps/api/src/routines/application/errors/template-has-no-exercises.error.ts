import { DomainError } from '../../../shared-kernel/domain-error';

export class TemplateHasNoExercisesError extends DomainError {
  readonly httpStatus = 400;

  constructor(templateId: string) {
    super(
      `La plantilla '${templateId}' no tiene ejercicios — agregale al menos uno antes de asignarla (HU-04).`,
    );
    this.name = 'TemplateHasNoExercisesError';
  }
}
