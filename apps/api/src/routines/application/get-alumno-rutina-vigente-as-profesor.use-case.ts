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

export interface GetAlumnoRutinaVigenteAsProfesorInput {
  invocadoPor: AuthenticatedUser;
  alumnoId: string;
}

export interface RutinaVigenteEjercicioResuelto {
  exerciseId: string;
  nombre: string;
  imageUrl: string | null;
  gifUrl: string | null;
  orden: number;
  series: number;
  repeticiones: number;
  peso: number | null;
  notas: string | null;
}

export interface RutinaVigenteOutput {
  id: string;
  nombre: string;
  ejercicios: RutinaVigenteEjercicioResuelto[];
}

/**
 * Salida exclusiva de la vista PROFESOR — `GetMiRutinaVigenteUseCase`
 * (vista del ALUMNO) sigue devolviendo `RutinaVigenteOutput` sin estos
 * campos, a propósito (ver diseño §B: "esto es información solo para el
 * profesor").
 */
export interface RutinaVigenteConVinculacionOutput extends RutinaVigenteOutput {
  vinculada: boolean;
  origenTemplateId: string | null;
  origenTemplateNombre: string | null;
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
      input.invocadoPor.gymId,
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

    const rutina = await this.resolverRutina(instancia.id, instancia.nombre, instancia.ejercicios);

    let origenTemplateNombre: string | null = null;
    if (instancia.vinculada && instancia.origenTemplateId) {
      const template = await this.templateRepository.findById(instancia.origenTemplateId);
      origenTemplateNombre = template?.nombre ?? null;
    }

    return {
      ...rutina,
      vinculada: instancia.vinculada,
      origenTemplateId: instancia.origenTemplateId,
      origenTemplateNombre,
    };
  }

  private async resolverRutina(
    id: string,
    nombre: string,
    ejercicios: Array<{
      exerciseId: string;
      orden: number;
      series: number;
      repeticiones: number;
      peso: number | null;
      notas: string | null;
    }>,
  ): Promise<RutinaVigenteOutput> {
    const catalogados = await this.exerciseRepository.findByIds(
      ejercicios.map((e) => e.exerciseId),
    );
    const porId = new Map(catalogados.map((e) => [e.id, e]));

    return {
      id,
      nombre,
      ejercicios: ejercicios.map((e) => {
        const catalogo = porId.get(e.exerciseId);
        return {
          exerciseId: e.exerciseId,
          nombre: catalogo?.nombre ?? '(ejercicio no encontrado)',
          imageUrl: catalogo?.imageUrl ?? null,
          gifUrl: catalogo?.gifUrl ?? null,
          orden: e.orden,
          series: e.series,
          repeticiones: e.repeticiones,
          peso: e.peso,
          notas: e.notas,
        };
      }),
    };
  }
}
