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

const ROLES_QUE_PUEDEN_RENOMBRAR: Role[] = [Role.PROFESOR];

export interface ClearExerciseAliasInput {
  invocadoPor: AuthenticatedUser;
  exerciseId: string;
}

/** Vuelve al nombre del catálogo: borra el alias propio. Idempotente. */
@Injectable()
export class ClearExerciseAliasUseCase {
  constructor(
    @Inject(EXERCISE_REPOSITORY) private readonly exerciseRepository: ExerciseRepositoryPort,
    @Inject(EXERCISE_ALIAS_REPOSITORY)
    private readonly aliasRepository: ExerciseAliasRepositoryPort,
  ) {}

  async execute(input: ClearExerciseAliasInput): Promise<ExerciseDetail> {
    if (!ROLES_QUE_PUEDEN_RENOMBRAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_RENOMBRAR);
    }

    const existente = await this.exerciseRepository.findById(input.exerciseId);
    if (!existente) {
      throw new ExerciseNotFoundError(input.exerciseId);
    }

    await this.aliasRepository.delete(input.invocadoPor.id, input.exerciseId);

    const resuelto = await this.exerciseRepository.findById(input.exerciseId, input.invocadoPor.id);
    if (!resuelto) {
      throw new ExerciseNotFoundError(input.exerciseId);
    }
    return resuelto;
  }
}
