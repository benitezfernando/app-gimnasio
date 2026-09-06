import { Injectable } from '@nestjs/common';
import { Prisma, Role as PrismaRole } from '@prisma/client';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import { UserRecord, UserRepositoryPort } from '../../application/ports/user-repository.port';
import { Role } from '../../domain/role';
import { DuplicateUsernameError } from '../../application/errors/duplicate-username.error';

interface PrismaUserRow {
  id: string;
  authUserId: string;
  gymId: string;
  username: string;
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

  async findByGymIdAndUsername(gymId: string, username: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { gymId_username: { gymId, username } },
    });
    return user ? this.toRecord(user) : null;
  }

  async findByGymId(gymId: string, role?: Role): Promise<UserRecord[]> {
    const users = await this.prisma.user.findMany({
      where: { gymId, ...(role ? { role: role as unknown as PrismaRole } : {}) },
      orderBy: { nombre: 'asc' },
    });
    return users.map((u) => this.toRecord(u));
  }

  async findById(id: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? this.toRecord(user) : null;
  }

  async deactivate(id: string): Promise<UserRecord> {
    const user = await this.prisma.user.update({ where: { id }, data: { activo: false } });
    return this.toRecord(user);
  }

  async create(
    data: {
      gymId: string;
      authUserId: string;
      username: string;
      nombre: string;
      role: Role;
    },
    vinculoCartera?: { profesorId: string },
  ): Promise<UserRecord> {
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const creado = await tx.user.create({
          data: {
            gymId: data.gymId,
            authUserId: data.authUserId,
            username: data.username,
            nombre: data.nombre,
            // Los valores de `Role` (dominio) y `PrismaRole` son idénticos por
            // diseño (ver identity/domain/role.ts) — cast explícito documentado.
            role: data.role as unknown as PrismaRole,
          },
        });

        if (vinculoCartera) {
          await tx.profesorAlumno.create({
            data: {
              gymId: data.gymId,
              profesorId: vinculoCartera.profesorId,
              alumnoId: creado.id,
            },
          });
        }

        return creado;
      });
      return this.toRecord(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DuplicateUsernameError(data.username, data.gymId);
      }
      throw error;
    }
  }

  private toRecord(user: PrismaUserRow): UserRecord {
    return {
      id: user.id,
      authUserId: user.authUserId,
      gymId: user.gymId,
      username: user.username,
      nombre: user.nombre,
      role: user.role as unknown as Role,
      activo: user.activo,
    };
  }
}
