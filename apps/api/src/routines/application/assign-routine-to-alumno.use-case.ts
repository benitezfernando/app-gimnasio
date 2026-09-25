import { Inject, Injectable } from '@nestjs/common';
import { Role } from '../../identity/domain/role';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import {
  CARTERA_REPOSITORY,
  CarteraRepositoryPort,
} from '../../identity/application/ports/cartera-repository.port';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
} from '../../identity/application/ports/user-repository.port';
import { resolveUserInGym } from '../../identity/application/resolve-user-in-gym';
import { requireGymId } from '../../identity/application/require-gym-id';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepositoryPort,
} from '../../exercise-catalog/application/ports/exercise-repository.port';
import {
  DiaPlantillaReferencia,
  EjercicioItem,
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateRepositoryPort,
} from './ports/routine-template-repository.port';
import {
  ROUTINE_INSTANCE_REPOSITORY,
  RoutineInstanceDetail,
  RoutineInstanceRepositoryPort,
} from './ports/routine-instance-repository.port';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';
import { InvalidRoutineInstanceInputError } from './errors/invalid-routine-instance-input.error';
import { validarDias } from './dias/validar-dias';
import { resolverVinculosPedidos } from './dias/resolver-vinculos-pedidos';
import { validarExerciseIdsEnCatalogo } from './validar-exercise-ids';

export interface AssignRoutineToAlumnoInput {
  invocadoPor: AuthenticatedUser;
  alumnoId: string;
  nombre?: string;
  dias: Array<{ vinculadoADiaId?: string; ejercicios: EjercicioItem[] }>;
}

const ROLES_QUE_PUEDEN_ASIGNAR: Role[] = [Role.PROFESOR];

/**
 * HU-05. Cada día puede venir de un día de plantilla (vinculado si el
 * conjunto coincide) o armado desde cero. Autoriza contra la cartera
 * vigente del invocador.
 */
@Injectable()
export class AssignRoutineToAlumnoUseCase {
  constructor(
    @Inject(ROUTINE_INSTANCE_REPOSITORY)
    private readonly instanceRepository: RoutineInstanceRepositoryPort,
    @Inject(ROUTINE_TEMPLATE_REPOSITORY)
    private readonly templateRepository: RoutineTemplateRepositoryPort,
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
  ) {}

  async execute(input: AssignRoutineToAlumnoInput): Promise<RoutineInstanceDetail> {
    if (!ROLES_QUE_PUEDEN_ASIGNAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_ASIGNAR);
    }
    if (input.dias.length === 0) {
      throw new InvalidRoutineInstanceInputError();
    }

    const gymId = requireGymId(input.invocadoPor);
    const alumno = await resolveUserInGym(this.userRepository, input.alumnoId, gymId);
    if (alumno.role !== Role.ALUMNO) {
      throw new AlumnoNotInCarteraError(input.alumnoId);
    }
    const enCartera = await this.carteraRepository.existe(input.invocadoPor.id, input.alumnoId);
    if (!enCartera) {
      throw new AlumnoNotInCarteraError(input.alumnoId);
    }

    validarDias(input.dias);
    await validarExerciseIdsEnCatalogo(
      this.exerciseRepository,
      input.dias.flatMap((d) => d.ejercicios),
    );

    const { vinculos, referencias } = await resolverVinculosPedidos(
      this.templateRepository,
      { id: input.invocadoPor.id, gymId },
      input.dias.map((d) => ({ ...d, anterior: null })),
    );

    const nombre = input.nombre?.trim() || nombreDePlantillaComun(vinculos, referencias);
    if (!nombre) {
      throw new InvalidRoutineInstanceInputError();
    }

    return this.instanceRepository.crear({
      gymId,
      profesorId: input.invocadoPor.id,
      alumnoId: input.alumnoId,
      nombre,
      dias: input.dias.map((d, i) => ({ vinculadoADiaId: vinculos[i], ejercicios: d.ejercicios })),
    });
  }
}

function nombreDePlantillaComun(
  vinculos: Array<string | null>,
  referencias: Map<string, DiaPlantillaReferencia>,
): string | undefined {
  if (vinculos.some((v) => v === null)) return undefined;
  const plantillas = new Set(vinculos.map((v) => referencias.get(v!)!.templateId));
  if (plantillas.size !== 1) return undefined;
  return referencias.get(vinculos[0]!)!.templateNombre;
}
