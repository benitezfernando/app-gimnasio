import { Injectable } from '@nestjs/common';
import { Role as PrismaRole } from '@prisma/client';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import { UserRecord, UserRepositoryPort } from '../../application/ports/user-repository.port';
import { Role } from '../../domain/role';

interface PrismaUserRow {
  id: string;
  authUserId: string;
  gymId: string;
  email: string;
  nombre: string;
  role: PrismaRole;
  activo: boolean;
}

@Injectable()
export class PrismaUserRepository implements UserRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByAuthUserId(authUserId: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { authUserId } });
    return user ? this.toRecord(user) : null;
  }

  async findByGymIdAndEmail(gymId: string, email: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { gymId_email: { gymId, email } },
    });
    return user ? this.toRecord(user) : null;
  }

  async create(data: {
    gymId: string;
    authUserId: string;
    email: string;
    nombre: string;
    role: Role;
  }): Promise<UserRecord> {
    const user = await this.prisma.user.create({
      data: {
        gymId: data.gymId,
        authUserId: data.authUserId,
        email: data.email,
        nombre: data.nombre,
        // Los valores de `Role` (dominio) y `PrismaRole` son idénticos por
        // diseño (ver identity/domain/role.ts) — cast explícito documentado,
        // no una coincidencia accidental.
        role: data.role as unknown as PrismaRole,
      },
    });
    return this.toRecord(user);
  }

  private toRecord(user: PrismaUserRow): UserRecord {
    return {
      id: user.id,
      authUserId: user.authUserId,
      gymId: user.gymId,
      email: user.email,
      nombre: user.nombre,
      role: user.role as unknown as Role,
      activo: user.activo,
    };
  }
}
