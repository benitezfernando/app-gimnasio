import { PrismaClient } from '@prisma/client';
import {
  ConexionPrisma,
  conectarPrisma,
  crearPGliteMigrado,
} from '../../../test-support/base-de-prueba';
import { GYM, sembrarUsuariosYEjercicios } from '../../../test-support/semillas';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import { Role } from '../../../identity/domain/role';
import { PrismaRoutinesCleanupAdapter } from './prisma-routines-cleanup.adapter';

jest.setTimeout(60_000);

describe('PrismaRoutinesCleanupAdapter.contarImpacto de un alumno (PGlite)', () => {
  let conexion: ConexionPrisma;
  let prisma: PrismaClient;
  let adapter: PrismaRoutinesCleanupAdapter;

  async function rutina(alumnoId: string, profesorId: string | null, activa: boolean) {
    await prisma.routineInstance.create({
      data: { gymId: GYM, alumnoId, profesorId, nombre: 'R', activa },
    });
  }

  beforeAll(async () => {
    conexion = await conectarPrisma(await crearPGliteMigrado());
    prisma = conexion.prisma;
    adapter = new PrismaRoutinesCleanupAdapter(prisma as unknown as PrismaService);
    await sembrarUsuariosYEjercicios(prisma);

    await rutina('alum-1', 'prof-1', true); // del invocador
    await rutina('alum-1', 'prof-1', false); // del invocador, histórica
    await rutina('alum-1', 'prof-2', false); // de otro profesor
    await rutina('alum-1', null, false); // sin dueño (su profesor fue eliminado)
  });

  afterAll(async () => {
    await conexion.cerrar();
  });

  it('cuenta todas las rutinas del alumno y, aparte, las de profesores distintos del invocador', async () => {
    const impacto = await adapter.contarImpacto('alum-1', Role.ALUMNO, 'prof-1');

    expect(impacto.instanciasABorrar).toBe(4);
    expect(impacto.instanciasDeOtrosProfesores).toBe(1);
  });

  it('sin profesor invocador no calcula las de otros profesores', async () => {
    const impacto = await adapter.contarImpacto('alum-1', Role.ALUMNO);

    expect(impacto.instanciasABorrar).toBe(4);
    expect(impacto.instanciasDeOtrosProfesores).toBe(0);
  });
});
