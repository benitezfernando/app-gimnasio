import { Inject, Injectable, Logger } from '@nestjs/common';
import { Role } from '../domain/role';
import { AuthenticatedUser } from '../domain/authenticated-user';
import { USER_REPOSITORY, UserRepositoryPort } from './ports/user-repository.port';
import { ROUTINES_CLEANUP, RoutinesCleanupPort } from './ports/routines-cleanup.port';
import { AUTH_PROVIDER, AuthProviderPort } from './ports/auth-provider.port';
import { resolveUserInGym } from './resolve-user-in-gym';
import { InsufficientRoleError } from './errors/insufficient-role.error';
import { CannotTargetAdminError } from './errors/cannot-target-admin.error';
import { UserNotInactiveError } from './errors/user-not-inactive.error';
import { PrismaService } from '../../shared-kernel/prisma.service';

export interface DeleteUserPermanentlyInput {
  invocadoPor: AuthenticatedUser;
  userId: string;
}

export interface DeleteUserPermanentlyOutput {
  advertencia?: string;
}

const ROLES_QUE_PUEDEN_ELIMINAR: Role[] = [Role.ADMIN];

/**
 * Hard-delete real (PRD §6 regla 10, HU-03c). `PrismaService` inyectado
 * directamente acá (no vía un repo) porque este caso de uso ES la raíz de
 * la transacción cross-context — orquesta `RoutinesCleanupPort` (DIP) más
 * `ProfesorAlumno` y `User`, todo en una `$transaction`. Fuga de
 * infraestructura deliberada, mismo criterio que la transacción de alta
 * con cartera del Bloque 3A: no se construye un Unit of Work genérico
 * para un solo caso de uso.
 */
@Injectable()
export class DeleteUserPermanentlyUseCase {
  private readonly logger = new Logger(DeleteUserPermanentlyUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepositoryPort,
    @Inject(ROUTINES_CLEANUP) private readonly routinesCleanup: RoutinesCleanupPort,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProviderPort,
    private readonly prisma: PrismaService,
  ) {}

  async execute(input: DeleteUserPermanentlyInput): Promise<DeleteUserPermanentlyOutput> {
    if (!ROLES_QUE_PUEDEN_ELIMINAR.includes(input.invocadoPor.role)) {
      throw new InsufficientRoleError(input.invocadoPor.role, ROLES_QUE_PUEDEN_ELIMINAR);
    }

    const objetivo = await resolveUserInGym(
      this.userRepository,
      input.userId,
      input.invocadoPor.gymId,
    );
    if (objetivo.role === Role.ADMIN) {
      throw new CannotTargetAdminError(objetivo.id);
    }
    if (objetivo.activo) {
      throw new UserNotInactiveError(objetivo.id);
    }

    const role = objetivo.role as Role.PROFESOR | Role.ALUMNO;
    await this.prisma.$transaction(async (tx) => {
      await this.routinesCleanup.eliminarDatosDe(objetivo.id, role, tx);
      await tx.profesorAlumno.deleteMany({
        where: { OR: [{ profesorId: objetivo.id }, { alumnoId: objetivo.id }] },
      });
      await tx.user.delete({ where: { id: objetivo.id } });
    });

    // Después de la transacción de Prisma, nunca antes: si algo falla acá,
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
      `Huérfano en auth.users tras hard-delete: authUserId=${objetivo.authUserId} (username=${objetivo.username})`,
    );
    return {
      advertencia: `El usuario se eliminó correctamente pero no se pudo borrar de auth.users (authUserId: ${objetivo.authUserId}). Requiere limpieza manual — ver HLD §6.`,
    };
  }
}
