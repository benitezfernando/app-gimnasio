import { Inject, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { Role } from '../../identity/domain/role';
import {
  CARTERA_REPOSITORY,
  CarteraRepositoryPort,
} from '../../identity/application/ports/cartera-repository.port';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
} from '../../identity/application/ports/user-repository.port';
import { resolveUserInGym } from '../../identity/application/resolve-user-in-gym';
import {
  EXERCISE_REPOSITORY,
  ExerciseRepositoryPort,
} from '../../exercise-catalog/application/ports/exercise-repository.port';
import {
  ROUTINE_INSTANCE_REPOSITORY,
  RoutineInstanceRepositoryPort,
} from './ports/routine-instance-repository.port';
import {
  ROUTINE_TEMPLATE_REPOSITORY,
  RoutineTemplateRepositoryPort,
} from './ports/routine-template-repository.port';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';
import { requireGymId } from '../../identity/application/require-gym-id';
import { RutinaVigenteDiaOutput, resolverDiasDeRutina } from './resolver-dias-de-rutina';

export interface GetAlumnoRutinaVigenteAsProfesorInput {
  invocadoPor: AuthenticatedUser;
  alumnoId: string;
}

export interface VinculoDiaOutput {
  /** Id del día de plantilla: el editor del profesor lo reenvía como `vinculadoADiaId` al guardar. */
  diaId: string;
  templateId: string;
  templateNombre: string;
  numero: number;
}

export interface RutinaVigenteDiaConVinculoOutput extends RutinaVigenteDiaOutput {
  id: string;
  vinculado: VinculoDiaOutput | null;
}

/** Salida exclusiva de la vista PROFESOR — el ALUMNO no recibe datos de vínculo. */
export interface RutinaVigenteConVinculacionOutput {
  id: string;
  nombre: string;
  dias: RutinaVigenteDiaConVinculoOutput[];
}

@Injectable()
export class GetAlumnoRutinaVigenteAsProfesorUseCase {
  constructor(
    @Inject(ROUTINE_INSTANCE_REPOSITORY)
    private readonly instanceRepository: RoutineInstanceRepositoryPort,
    @Inject(ROUTINE_TEMPLATE_REPOSITORY)
    private readonly templateRepository: RoutineTemplateRepositoryPort,
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
  ) {}

  async execute(
    input: GetAlumnoRutinaVigenteAsProfesorInput,
  ): Promise<RutinaVigenteConVinculacionOutput | null> {
    const alumno = await resolveUserInGym(
      this.userRepository,
      input.alumnoId,
      requireGymId(input.invocadoPor),
    );
    if (alumno.role !== Role.ALUMNO) {
      throw new AlumnoNotInCarteraError(input.alumnoId);
    }

    const enCartera = await this.carteraRepository.existe(input.invocadoPor.id, input.alumnoId);
    if (!enCartera) {
      throw new AlumnoNotInCarteraError(input.alumnoId);
    }

    const instancia = await this.instanceRepository.findVigentePorAlumno(input.alumnoId);
    if (!instancia) {
      return null;
    }

    const diasResueltos = await resolverDiasDeRutina(this.exerciseRepository, instancia.dias);
    const idsVinculados = instancia.dias.flatMap((d) =>
      d.vinculadoADiaId ? [d.vinculadoADiaId] : [],
    );
    const referencias = new Map(
      (await this.templateRepository.findDiasByIds(idsVinculados)).map((r) => [r.id, r]),
    );

    return {
      id: instancia.id,
      nombre: instancia.nombre,
      dias: instancia.dias.map((dia, indice) => {
        const referencia = dia.vinculadoADiaId ? referencias.get(dia.vinculadoADiaId) : undefined;
        return {
          id: dia.id,
          ...diasResueltos[indice],
          vinculado: referencia
            ? {
                diaId: referencia.id,
                templateId: referencia.templateId,
                templateNombre: referencia.templateNombre,
                numero: referencia.numero,
              }
            : null,
        };
      }),
    };
  }
}
