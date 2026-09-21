import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared-kernel/prisma.service';
import { UserRecord } from '../../identity/application/ports/user-repository.port';
import { Role as PrismaRole } from '@prisma/client';
import { Role } from '../../identity/domain/role';

/**
 * Único caso de uso de este módulo que no pasa por `UserRepositoryPort`:
 * ese puerto está diseñado para consultas gym-scoped (`findByGymId`
 * exige un gymId). Listar TODOS los ADMIN de TODOS los gyms es
 * exclusivo de SUPER_ADMIN — no tiene sentido forzarlo al puerto
 * existente, así que este caso de uso habla con Prisma directo.
 */
@Injectable()
export class ListAdminsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(): Promise<UserRecord[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: PrismaRole.ADMIN },
      orderBy: [{ gymId: 'asc' }, { nombre: 'asc' }],
    });
    return admins.map((u) => ({
      id: u.id,
      authUserId: u.authUserId,
      gymId: u.gymId,
      username: u.username,
      nombre: u.nombre,
      role: u.role as unknown as Role,
      activo: u.activo,
    }));
  }
}
