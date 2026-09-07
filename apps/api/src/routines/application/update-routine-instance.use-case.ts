import { Inject, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import {
  CARTERA_REPOSITORY,
  CarteraRepositoryPort,
} from '../../identity/application/ports/cartera-repository.port';
import {
  ROUTINE_INSTANCE_REPOSITORY,
  RoutineInstanceDetail,
  RoutineInstanceRepositoryPort,
} from './ports/routine-instance-repository.port';
import { RoutineInstanceNotFoundError } from './errors/routine-instance-not-found.error';
import { AlumnoNotInCarteraError } from './errors/alumno-not-in-cartera.error';

export interface UpdateRoutineInstanceInput {
  invocadoPor: AuthenticatedUser;
  instanceId: string;
  nombre?: string;
}

/**
 * Autoriza contra la cartera VIGENTE (¿el alumno de esta instancia está
 * en la cartera del invocador hoy?), nunca contra `instance.profesorId`
 * (quién la creó). Si el alumno tiene 2 profesores, cualquiera de los dos
 * puede editar la misma instancia — HLD §3 Routines.
 */
@Injectable()
export class UpdateRoutineInstanceUseCase {
  constructor(
    @Inject(ROUTINE_INSTANCE_REPOSITORY)
    private readonly instanceRepository: RoutineInstanceRepositoryPort,
    @Inject(CARTERA_REPOSITORY) private readonly carteraRepository: CarteraRepositoryPort,
  ) {}

  async execute(input: UpdateRoutineInstanceInput): Promise<RoutineInstanceDetail> {
    const instance = await this.instanceRepository.findById(input.instanceId);
    if (!instance || instance.gymId !== input.invocadoPor.gymId) {
      throw new RoutineInstanceNotFoundError(input.instanceId);
    }

    const enCartera = await this.carteraRepository.existe(input.invocadoPor.id, instance.alumnoId);
    if (!enCartera) {
      throw new AlumnoNotInCarteraError(instance.alumnoId);
    }

    return this.instanceRepository.update(input.instanceId, { nombre: input.nombre });
  }
}
