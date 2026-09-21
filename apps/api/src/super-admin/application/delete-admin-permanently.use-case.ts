import { Inject, Injectable, Logger } from '@nestjs/common';
import { Role } from '../../identity/domain/role';
import {
  USER_REPOSITORY,
  UserRepositoryPort,
} from '../../identity/application/ports/user-repository.port';
import {
  AUTH_PROVIDER,
  AuthProviderPort,
} from '../../identity/application/ports/auth-provider.port';
import { UserNotFoundError } from '../../identity/application/errors/user-not-found.error';
import { UserNotInactiveError } from '../../identity/application/errors/user-not-inactive.error';
import { PrismaService } from '../../shared-kernel/prisma.service';

export interface DeleteAdminPermanentlyInput {
  adminId: string;
}

export interface DeleteAdminPermanentlyOutput {
  advertencia?: string;
}

/**
 * Hard-delete de un ADMIN — más simple que DeleteUserPermanentlyUseCase
 * (identity/) porque un ADMIN no es dueño de ningún dato propio en el
 * schema (`RoutineTemplate`/`RoutineInstance`/`ProfesorAlumno` cuelgan
 * siempre de PROFESOR/ALUMNO, nunca de ADMIN) — no hace falta
 * `RoutinesCleanupPort` ni una transacción con cascada, solo borrar la
 * fila `User` y su usuario de Supabase Auth. Mismo gate que el resto de
 * la app: solo sobre un usuario ya desactivado.
 */
@Injectable()
export class DeleteAdminPermanentlyUseCase {
  private readonly logger = new Logger(DeleteAdminPermanentlyUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProviderPort,
    private readonly prisma: PrismaService,
  ) {}

  async execute(input: DeleteAdminPermanentlyInput): Promise<DeleteAdminPermanentlyOutput> {
    const objetivo = await this.userRepository.findById(input.adminId);
    if (!objetivo || objetivo.role !== Role.ADMIN) {
      throw new UserNotFoundError(input.adminId);
    }
    if (objetivo.activo) {
      throw new UserNotInactiveError(objetivo.id);
    }

    await this.prisma.user.delete({ where: { id: objetivo.id } });

    // Después de borrar la fila Prisma, nunca antes: si algo falla acá,
    // el huérfano en auth.users queda inerte (sin fila User, JwtAuthGuard
    // lo rechaza siempre) — nunca un usuario fantasma que pueda loguearse.
    for (let intento = 0; intento < 2; intento += 1) {
      try {
        await this.authProvider.deleteAuthUser(objetivo.authUserId);
        return {};
      } catch {
        // Reintenta una vez más antes de rendirse.
      }
    }

    this.logger.error(
      `Huérfano en auth.users tras hard-delete de ADMIN: authUserId=${objetivo.authUserId} (username=${objetivo.username})`,
    );
    return {
      advertencia: `El admin se eliminó correctamente pero no se pudo borrar de auth.users (authUserId: ${objetivo.authUserId}). Requiere limpieza manual.`,
    };
  }
}
