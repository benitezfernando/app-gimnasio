import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../identity/domain/role';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepositoryPort,
} from '../../exercise-catalog/application/ports/exercise-repository.port';
import {
  ActualizacionDiaVinculado,
  DiaPlantillaAGuardar,
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateDetail,
  RoutineTemplateRepositoryPort,
} from './ports/routine-template-repository.port';
import {
  ROUTINE_INSTANCE_REPOSITORY,
  RoutineInstanceRepositoryPort,
} from './ports/routine-instance-repository.port';
import { RoutineTemplateNotFoundError } from './errors/routine-template-not-found.error';
import { RoutineDayNotFoundError } from './errors/routine-day-not-found.error';
import { validarDias } from './dias/validar-dias';
import { mergeDiaVinculado } from './dias/merge-dia-vinculado';
import { MAX_EJERCICIOS_TOTALES } from './dias/limites';
import { validarExerciseIdsEnCatalogo } from './validar-exercise-ids';

export interface ReplaceTemplateDaysInput {
  invocadoPor: AuthenticatedUser;
  templateId: string;
  dias: DiaPlantillaAGuardar[];
}

export interface ReplaceTemplateDaysOutput {
  /** alumnoId de cada alumno cuyos días vinculados a esta plantilla quedaron desincronizados en este guardado por superar el límite de ejercicios. */
  alumnosDesincronizados: string[];
}

const ROLES_QUE_PUEDEN_EDITAR: Role[] = [Role.PROFESOR];

@Injectable()
export class ReplaceTemplateDaysUseCase {
  constructor(
    @Inject(ROUTINE_TEMPLATE_REPOSITORY)
    private readonly templateRepository: RoutineTemplateRepositoryPort,
    @Inject(ROUTINE_INSTANCE_REPOSITORY)
    private readonly instanceRepository: RoutineInstanceRepositoryPort,
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
  ) {}

  async execute(input: ReplaceTemplateDaysInput): Promise<ReplaceTemplateDaysOutput> {
    if (!ROLES_QUE_PUEDEN_EDITAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_EDITAR);
    }

    const template = await this.templateRepository.findById(input.templateId);
    if (!template || template.profesorId !== input.invocadoPor.id) {
      throw new RoutineTemplateNotFoundError(input.templateId);
    }

    validarDias(input.dias);
    const idsExistentes = new Set(template.dias.map((d) => d.id));
    for (const dia of input.dias) {
      if (dia.id && !idsExistentes.has(dia.id)) {
        throw new RoutineDayNotFoundError(dia.id);
      }
    }
    await validarExerciseIdsEnCatalogo(
      this.exerciseRepository,
      input.dias.flatMap((d) => d.ejercicios),
    );

    const { actualizaciones, alumnosDesincronizados } = await this.calcularPropagacion(
      template,
      input.dias,
    );
    await this.templateRepository.guardarDias(template.id, input.dias, actualizaciones);
    return { alumnosDesincronizados };
  }

  private async calcularPropagacion(
    template: RoutineTemplateDetail,
    dias: DiaPlantillaAGuardar[],
  ): Promise<{ actualizaciones: ActualizacionDiaVinculado[]; alumnosDesincronizados: string[] }> {
    const idsDiasPlantilla = template.dias.map((d) => d.id);
    if (idsDiasPlantilla.length === 0) {
      return { actualizaciones: [], alumnosDesincronizados: [] };
    }

    const deEstaPlantilla = new Set(idsDiasPlantilla);
    const diasNuevosPorId = new Map(dias.flatMap((d) => (d.id ? [[d.id, d] as const] : [])));
    const instancias =
      await this.instanceRepository.findActivasConDiasVinculadosA(idsDiasPlantilla);

    const actualizaciones: ActualizacionDiaVinculado[] = [];
    const alumnosDesincronizados: string[] = [];

    for (const instancia of instancias) {
      const vinculados = instancia.dias.filter(
        (d) => d.vinculadoADiaId !== null && deEstaPlantilla.has(d.vinculadoADiaId),
      );

      const candidatas = new Map<string, ActualizacionDiaVinculado>();
      for (const diaInstancia of vinculados) {
        const diaPlantilla = diasNuevosPorId.get(diaInstancia.vinculadoADiaId!);
        if (!diaPlantilla) continue;
        candidatas.set(diaInstancia.id, {
          diaInstanciaId: diaInstancia.id,
          ejercicios: mergeDiaVinculado({
            ejerciciosDiaPlantilla: diaPlantilla.ejercicios,
            ejerciciosDiaInstancia: diaInstancia.ejercicios,
            ejerciciosOtrosDiasVinculados: vinculados
              .filter((otro) => otro.id !== diaInstancia.id)
              .map((otro) => otro.ejercicios),
          }),
        });
      }
      if (candidatas.size === 0) continue;

      const totalConCambios = instancia.dias.reduce((suma, dia) => {
        const candidata = candidatas.get(dia.id);
        return suma + (candidata ? candidata.ejercicios.length : dia.ejercicios.length);
      }, 0);

      if (totalConCambios > MAX_EJERCICIOS_TOTALES) {
        // Este alumno quedaría por encima del límite: sus días vinculados a
        // esta plantilla NO reciben el cambio y se desvinculan, en vez de
        // bloquear el guardado de la plantilla para todos los demás.
        for (const diaInstancia of vinculados) {
          if (!candidatas.has(diaInstancia.id)) continue;
          actualizaciones.push({
            diaInstanciaId: diaInstancia.id,
            ejercicios: diaInstancia.ejercicios,
            desvincular: true,
          });
        }
        alumnosDesincronizados.push(instancia.alumnoId);
      } else {
        actualizaciones.push(...candidatas.values());
      }
    }
    return { actualizaciones, alumnosDesincronizados };
  }
}
