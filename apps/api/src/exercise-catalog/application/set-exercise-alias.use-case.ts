import { Inject, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { Role } from '../../identity/domain/role';
import { InsufficientRoleError } from '../../identity/application/errors/insufficient-role.error';
import {
  EXERCISE_REPOSITORY,
  ExerciseDetail,
  ExerciseRepositoryPort,
} from './ports/exercise-repository.port';
import {
  EXERCISE_ALIAS_REPOSITORY,
  ExerciseAliasRepositoryPort,
} from './ports/exercise-alias-repository.port';
import { ExerciseNotFoundError } from './errors/exercise-not-found.error';
import { InvalidExerciseAliasError } from './errors/invalid-exercise-alias.error';
import { normalizarNombre } from '../normalizar-nombre';

export const MAX_LONGITUD_ALIAS = 80;

const ROLES_QUE_PUEDEN_RENOMBRAR: Role[] = [Role.PROFESOR];

export interface SetExerciseAliasInput {
  invocadoPor: AuthenticatedUser;
  exerciseId: string;
  nombre: string;
}

/**
 * Crea o actualiza el alias que el profesor le pone a un ejercicio del
 * catálogo. Solo escribe en `ExerciseAlias`: el catálogo no se toca.
 */
@Injectable()
export class SetExerciseAliasUseCase {
  constructor(
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
    @Inject(EXERCISE_ALIAS_REPOSITORY)
    private readonly aliasRepository: ExerciseAliasRepositoryPort,
  ) {}

  async execute(input: SetExerciseAliasInput): Promise<ExerciseDetail> {
    if (!ROLES_QUE_PUEDEN_RENOMBRAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_RENOMBRAR);
    }

    const nombre = input.nombre.trim();
    if (nombre.length === 0 || nombre.length > MAX_LONGITUD_ALIAS) {
      throw new InvalidExerciseAliasError(MAX_LONGITUD_ALIAS);
    }

    const existente = await this.exerciseRepository.findById(input.exerciseId);
    if (!existente) {
      throw new ExerciseNotFoundError(input.exerciseId);
    }

    // Un alias idéntico al catálogo es ruido que ensucia `nombreCatalogo`.
    if (nombre === existente.nombre) {
      await this.aliasRepository.delete(input.invocadoPor.id, input.exerciseId);
    } else {
      await this.aliasRepository.upsert({
        profesorId: input.invocadoPor.id,
        exerciseId: input.exerciseId,
        nombre,
        nombreNormalizado: normalizarNombre(nombre),
      });
    }

    const resuelto = await this.exerciseRepository.findById(input.exerciseId, input.invocadoPor.id);
    if (!resuelto) {
      throw new ExerciseNotFoundError(input.exerciseId);
    }
    return resuelto;
  }
}
