import { Inject, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import {
  CARTERA_REPOSITORY,
  CarteraRepositoryPort,
} from '../../identity/application/ports/cartera-repository.port';
import { requireGymId } from '../../identity/application/require-gym-id';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepositoryPort,
} from '../../exercise-catalog/application/ports/exercise-repository.port';
import {
  EjercicioItem,
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateRepositoryPort,
} from './ports/routine-template-repository.port';
import {
  ROUTINE_INSTANCE_REPOSITORY,
  RoutineInstanceRepositoryPort,
} from './ports/routine-instance-repository.port';
import { RoutineInstanceNotFoundError } from './errors/routine-instance-not-found.error';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';
import { RoutineDayNotFoundError } from './errors/routine-day-not-found.error';
import { validarDias } from './dias/validar-dias';
import { resolverVinculosPedidos } from './dias/resolver-vinculos-pedidos';
import { validarExerciseIdsEnCatalogo } from './validar-exercise-ids';

export interface ReplaceInstanceDaysInput {
  invocadoPor: AuthenticatedUser;
  instanceId: string;
  dias: Array<{ id?: string; vinculadoADiaId?: string; ejercicios: EjercicioItem[] }>;
}

export interface ReplaceInstanceDaysOutput {
  /** Números (en el orden nuevo) de los días que estaban vinculados y dejaron de estarlo. */
  diasDesvinculados: number[];
}

/**
 * HU-06. Autoriza contra la cartera vigente, nunca contra quién creó la
 * instancia. El vínculo de cada día lo decide la regla única de vínculo.
 */
@Injectable()
export class ReplaceInstanceDaysUseCase {
  constructor(
    @Inject(ROUTINE_INSTANCE_REPOSITORY)
    private readonly instanceRepository: RoutineInstanceRepositoryPort,
    @Inject(ROUTINE_TEMPLATE_REPOSITORY)
    private readonly templateRepository: RoutineTemplateRepositoryPort,
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
  ) {}

  async execute(input: ReplaceInstanceDaysInput): Promise<ReplaceInstanceDaysOutput> {
    const gymId = requireGymId(input.invocadoPor);

    const instance = await this.instanceRepository.findById(input.instanceId);
    if (!instance || instance.gymId !== gymId) {
      throw new RoutineInstanceNotFoundError(input.instanceId);
    }
    const enCartera = await this.carteraRepository.existe(input.invocadoPor.id, instance.alumnoId);
    if (!enCartera) {
      throw new AlumnoNotInCarteraError(instance.alumnoId);
    }

    validarDias(input.dias);
    const vinculoAnteriorPorId = new Map(instance.dias.map((d) => [d.id, d.vinculadoADiaId]));
    for (const dia of input.dias) {
      if (dia.id && !vinculoAnteriorPorId.has(dia.id)) {
        throw new RoutineDayNotFoundError(dia.id);
      }
    }
    await validarExerciseIdsEnCatalogo(
      this.exerciseRepository,
      input.dias.flatMap((d) => d.ejercicios),
    );

    const anteriores = input.dias.map((d) =>
      d.id ? (vinculoAnteriorPorId.get(d.id) ?? null) : null,
    );
    const { vinculos } = await resolverVinculosPedidos(
      this.templateRepository,
      { id: input.invocadoPor.id, gymId },
      input.dias.map((d, i) => ({ ...d, anterior: anteriores[i] })),
    );

    await this.instanceRepository.guardarDias(
      instance.id,
      input.dias.map((d, i) => ({
        ...(d.id ? { id: d.id } : {}),
        vinculadoADiaId: vinculos[i],
        ejercicios: d.ejercicios,
      })),
    );

    return {
      diasDesvinculados: input.dias.flatMap((_, i) =>
        anteriores[i] !== null && vinculos[i] === null ? [i + 1] : [],
      ),
    };
  }
}
