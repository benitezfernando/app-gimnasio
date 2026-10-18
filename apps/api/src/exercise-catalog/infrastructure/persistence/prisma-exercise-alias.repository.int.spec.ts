import { PrismaClient } from '@prisma/client';
import {
  ConexionPrisma,
  conectarPrisma,
  crearPGliteMigrado,
} from '../../../test-support/base-de-prueba';
import { sembrarUsuariosYEjercicios } from '../../../test-support/semillas';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import { PrismaExerciseAliasRepository } from './prisma-exercise-alias.repository';

jest.setTimeout(60_000);

describe('PrismaExerciseAliasRepository (PGlite)', () => {
  let conexion: ConexionPrisma;
  let prisma: PrismaClient;
  let repo: PrismaExerciseAliasRepository;

  beforeAll(async () => {
    conexion = await conectarPrisma(await crearPGliteMigrado());
    prisma = conexion.prisma;
    repo = new PrismaExerciseAliasRepository(prisma as unknown as PrismaService);
    await sembrarUsuariosYEjercicios(prisma);
  });

  afterAll(async () => {
    await conexion.cerrar();
  });

  it('upsert crea el alias y un segundo upsert lo actualiza sin duplicar', async () => {
    await repo.upsert({
      profesorId: 'prof-1',
      exerciseId: 'ex-1',
      nombre: 'Banca',
      nombreNormalizado: 'banca',
    });
    await repo.upsert({
      profesorId: 'prof-1',
      exerciseId: 'ex-1',
      nombre: 'Banca plana',
      nombreNormalizado: 'banca plana',
    });

    const filas = await prisma.exerciseAlias.findMany({
      where: { profesorId: 'prof-1', exerciseId: 'ex-1' },
    });
    expect(filas).toHaveLength(1);
    expect(filas[0].nombre).toBe('Banca plana');
    expect(filas[0].nombreNormalizado).toBe('banca plana');
  });

  it('dos profesores pueden tener alias distintos para el mismo ejercicio', async () => {
    await repo.upsert({
      profesorId: 'prof-2',
      exerciseId: 'ex-1',
      nombre: 'Press plano',
      nombreNormalizado: 'press plano',
    });

    const filas = await prisma.exerciseAlias.findMany({ where: { exerciseId: 'ex-1' } });
    expect(filas.map((f) => [f.profesorId, f.nombre]).sort()).toEqual([
      ['prof-1', 'Banca plana'],
      ['prof-2', 'Press plano'],
    ]);
  });

  it('delete borra el alias propio y es idempotente (no falla si no existe)', async () => {
    await repo.upsert({
      profesorId: 'prof-1',
      exerciseId: 'ex-2',
      nombre: 'Sentadilla',
      nombreNormalizado: 'sentadilla',
    });

    await repo.delete('prof-1', 'ex-2');
    await expect(repo.delete('prof-1', 'ex-2')).resolves.toBeUndefined();

    expect(
      await prisma.exerciseAlias.count({ where: { profesorId: 'prof-1', exerciseId: 'ex-2' } }),
    ).toBe(0);
  });

  it('borrar el profesor borra sus alias en cascada', async () => {
    await repo.upsert({
      profesorId: 'prof-2',
      exerciseId: 'ex-4',
      nombre: 'Remo',
      nombreNormalizado: 'remo',
    });

    await prisma.user.delete({ where: { id: 'prof-2' } });

    expect(await prisma.exerciseAlias.count({ where: { profesorId: 'prof-2' } })).toBe(0);
  });

  it('borrar el ejercicio borra sus alias en cascada', async () => {
    await repo.upsert({
      profesorId: 'prof-1',
      exerciseId: 'ex-5',
      nombre: 'Peso muerto',
      nombreNormalizado: 'peso muerto',
    });

    await prisma.exercise.delete({ where: { id: 'ex-5' } });

    expect(await prisma.exerciseAlias.count({ where: { exerciseId: 'ex-5' } })).toBe(0);
  });
});
