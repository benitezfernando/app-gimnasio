import { PrismaClient } from '@prisma/client';
import {
  ConexionPrisma,
  conectarPrisma,
  crearPGliteMigrado,
} from '../../../test-support/base-de-prueba';
import { sembrarUsuariosYEjercicios } from '../../../test-support/semillas';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import { normalizarNombre } from '../../normalizar-nombre';
import { PrismaExerciseRepository } from './prisma-exercise.repository';

jest.setTimeout(60_000);

describe('PrismaExerciseRepository con alias (PGlite)', () => {
  let conexion: ConexionPrisma;
  let prisma: PrismaClient;
  let repo: PrismaExerciseRepository;

  beforeAll(async () => {
    conexion = await conectarPrisma(await crearPGliteMigrado());
    prisma = conexion.prisma;
    repo = new PrismaExerciseRepository(prisma as unknown as PrismaService);
    await sembrarUsuariosYEjercicios(prisma);
    await prisma.exercise.update({
      where: { id: 'ex-1' },
      data: {
        nombre: 'Barra press de banca',
        nombreNormalizado: normalizarNombre('Barra press de banca'),
      },
    });
    await prisma.exerciseAlias.create({
      data: {
        profesorId: 'prof-1',
        exerciseId: 'ex-1',
        nombre: 'Banca plana',
        nombreNormalizado: normalizarNombre('Banca plana'),
      },
    });
  });

  afterAll(async () => {
    await conexion.cerrar();
  });

  it('findByIds con el profesor dueño del alias devuelve el alias como nombre y el del catálogo en nombreCatalogo', async () => {
    const [resultado] = await repo.findByIds(['ex-1'], 'prof-1');

    expect(resultado.nombre).toBe('Banca plana');
    expect(resultado.nombreCatalogo).toBe('Barra press de banca');
  });

  it('findByIds sin profesor devuelve el nombre del catálogo y nombreCatalogo null', async () => {
    const [resultado] = await repo.findByIds(['ex-1']);

    expect(resultado.nombre).toBe('Barra press de banca');
    expect(resultado.nombreCatalogo).toBeNull();
  });

  it('findByIds de otro profesor no ve el alias ajeno', async () => {
    const [resultado] = await repo.findByIds(['ex-1'], 'prof-2');

    expect(resultado.nombre).toBe('Barra press de banca');
    expect(resultado.nombreCatalogo).toBeNull();
  });

  it('findByIds de un ejercicio sin alias devuelve nombreCatalogo null aunque se pida con profesor', async () => {
    const [resultado] = await repo.findByIds(['ex-2'], 'prof-1');

    expect(resultado.nombre).toBe('ex-2');
    expect(resultado.nombreCatalogo).toBeNull();
  });

  it('findById resuelve el alias del profesor y no el de otro', async () => {
    const propio = await repo.findById('ex-1', 'prof-1');
    const ajeno = await repo.findById('ex-1', 'prof-2');
    const puro = await repo.findById('ex-1');

    expect([propio?.nombre, propio?.nombreCatalogo]).toEqual([
      'Banca plana',
      'Barra press de banca',
    ]);
    expect([ajeno?.nombre, ajeno?.nombreCatalogo]).toEqual(['Barra press de banca', null]);
    expect([puro?.nombre, puro?.nombreCatalogo]).toEqual(['Barra press de banca', null]);
  });

  it('findMany con search por alias propio encuentra el ejercicio y lo devuelve con el alias', async () => {
    const { items, total } = await repo.findMany({
      search: 'banca plana',
      aliasDeProfesorId: 'prof-1',
      page: 1,
      limit: 10,
    });

    expect(total).toBe(1);
    expect(items.map((i) => [i.id, i.nombre, i.nombreCatalogo])).toEqual([
      ['ex-1', 'Banca plana', 'Barra press de banca'],
    ]);
  });

  it('findMany con search por alias no lo encuentra para otro profesor ni sin profesor', async () => {
    const deOtro = await repo.findMany({
      search: 'banca plana',
      aliasDeProfesorId: 'prof-2',
      page: 1,
      limit: 10,
    });
    const sinProfesor = await repo.findMany({ search: 'banca plana', page: 1, limit: 10 });

    expect(deOtro.total).toBe(0);
    expect(sinProfesor.total).toBe(0);
  });

  it('findMany con search por el nombre del catálogo sigue encontrándolo y lo devuelve con el alias', async () => {
    const { items } = await repo.findMany({
      search: 'barra press',
      aliasDeProfesorId: 'prof-1',
      page: 1,
      limit: 10,
    });

    expect(items.map((i) => i.nombre)).toEqual(['Banca plana']);
  });

  it('findMany normaliza mayúsculas y tildes al buscar por alias', async () => {
    const { total } = await repo.findMany({
      search: 'BANCA PLANÁ',
      aliasDeProfesorId: 'prof-1',
      page: 1,
      limit: 10,
    });

    expect(total).toBe(1);
  });
});
