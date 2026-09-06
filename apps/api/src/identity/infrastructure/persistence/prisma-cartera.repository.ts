import { Injectable } from '@nestjs/common';
import { Role as PrismaRole } from '@prisma/client';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import { UserRecord } from '../../application/ports/user-repository.port';
import {
  CarteraLink,
  CarteraRepositoryPort,
} from '../../application/ports/cartera-repository.port';
import { Role } from '../../domain/role';

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
export class PrismaCarteraRepository implements CarteraRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async existe(profesorId: string, alumnoId: string): Promise<boolean> {
    const vinculo = await this.prisma.profesorAlumno.findUnique({
      where: { profesorId_alumnoId: { profesorId, alumnoId } },
    });
    return vinculo !== null;
  }

  async crear(data: { gymId: string; profesorId: string; alumnoId: string }): Promise<CarteraLink> {
    const creado = await this.prisma.profesorAlumno.create({ data });
    return {
      id: creado.id,
      gymId: creado.gymId,
      profesorId: creado.profesorId,
      alumnoId: creado.alumnoId,
      asignadoEn: creado.asignadoEn,
    };
  }

  async eliminar(profesorId: string, alumnoId: string): Promise<void> {
    await this.prisma.profesorAlumno.delete({
      where: { profesorId_alumnoId: { profesorId, alumnoId } },
    });
  }

  async findAlumnosDeProfesor(profesorId: string): Promise<UserRecord[]> {
    const vinculos = await this.prisma.profesorAlumno.findMany({
      where: { profesorId },
      include: { alumno: true },
      orderBy: { alumno: { nombre: 'asc' } },
    });
    return vinculos.map((v) => this.toUserRecord(v.alumno));
  }

  async findProfesoresDeAlumno(alumnoId: string): Promise<UserRecord[]> {
    const vinculos = await this.prisma.profesorAlumno.findMany({
      where: { alumnoId },
      include: { profesor: true },
      orderBy: { profesor: { nombre: 'asc' } },
    });
    return vinculos.map((v) => this.toUserRecord(v.profesor));
  }

  private toUserRecord(user: PrismaUserRow): UserRecord {
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
