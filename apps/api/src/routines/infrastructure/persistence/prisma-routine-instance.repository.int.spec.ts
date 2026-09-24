import { PrismaClient } from '@prisma/client';
import {
  ConexionPrisma,
  conectarPrisma,
  crearPGliteMigrado,
} from '../../../test-support/base-de-prueba';
import { GYM, sembrarUsuariosYEjercicios } from '../../../test-support/semillas';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import { EjercicioItem } from '../../application/ports/routine-template-repository.port';
import { PrismaRoutineInstanceRepository } from './prisma-routine-instance.repository';

jest.setTimeout(60_000);

function ej(exerciseId: string, orden: number): EjercicioItem {
  return { exerciseId, orden, series: 3, repeticiones: 10, peso: null, notas: null };
}

describe('PrismaRoutineInstanceRepository (PGlite)', () => {
  let conexion: ConexionPrisma;
  let prisma: PrismaClient;
  let repo: PrismaRoutineInstanceRepository;
  let diaPlantillaId: string;

  beforeAll(async () => {
    conexion = await conectarPrisma(await crearPGliteMigrado());
    prisma = conexion.prisma;
    repo = new PrismaRoutineInstanceRepository(prisma as unknown as PrismaService);
    await sembrarUsuariosYEjercicios(prisma);
    const plantilla = await prisma.routineTemplate.create({
      data: {
        gymId: GYM,
        profesorId: 'prof-1',
        nombre: 'T',
        dias: {
          create: {
            numero: 1,
            ejercicios: { create: { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10 } },
          },
        },
      },
      include: { dias: true },
    });
    diaPlantillaId = plantilla.dias[0].id;
  });

  afterAll(async () => {
    await conexion.cerrar();
  });

  it('crear archiva la vigente anterior y crea la nueva con días y vínculos', async () => {
    const primera = await repo.crear({
      gymId: GYM,
      profesorId: 'prof-1',
      alumnoId: 'alum-1',
      nombre: 'Primera',
      dias: [{ vinculadoADiaId: null, ejercicios: [ej('ex-2', 1)] }],
    });
    const segunda = await repo.crear({
      gymId: GYM,
      profesorId: 'prof-1',
      alumnoId: 'alum-1',
      nombre: 'Segunda',
      dias: [
        { vinculadoADiaId: diaPlantillaId, ejercicios: [ej('ex-1', 1)] },
        { vinculadoADiaId: null, ejercicios: [ej('ex-1', 1), ej('ex-3', 2)] },
      ],
    });

    expect((await repo.findById(primera.id))?.activa).toBe(false);
    expect(segunda.dias.map((d) => [d.numero, d.vinculadoADiaId, d.ejercicios.length])).toEqual([
      [1, diaPlantillaId, 1],
      [2, null, 2],
    ]);
    expect((await repo.findVigentePorAlumno('alum-1'))?.id).toBe(segunda.id);
  });

  it('guardarDias reordena conservando ids y vínculos, y borra los días omitidos', async () => {
    const instancia = await repo.crear({
      gymId: GYM,
      profesorId: 'prof-1',
      alumnoId: 'alum-2',
      nombre: 'R',
      dias: [
        { vinculadoADiaId: diaPlantillaId, ejercicios: [ej('ex-1', 1)] },
        { vinculadoADiaId: null, ejercicios: [ej('ex-2', 1)] },
        { vinculadoADiaId: null, ejercicios: [ej('ex-3', 1)] },
      ],
    });
    const [d1, d2] = instancia.dias;

    await repo.guardarDias(instancia.id, [
      { id: d2.id, vinculadoADiaId: null, ejercicios: [ej('ex-2', 1), ej('ex-4', 2)] },
      { id: d1.id, vinculadoADiaId: diaPlantillaId, ejercicios: d1.ejercicios },
    ]);

    const dias = (await repo.findById(instancia.id))!.dias;
    expect(
      dias.map((d) => [d.numero, d.id, d.vinculadoADiaId, d.ejercicios.map((e) => e.exerciseId)]),
    ).toEqual([
      [1, d2.id, null, ['ex-2', 'ex-4']],
      [2, d1.id, diaPlantillaId, ['ex-1']],
    ]);
  });

  it('findActivasConDiasVinculadosA trae solo activas y con todos sus días', async () => {
    const resultado = await repo.findActivasConDiasVinculadosA([diaPlantillaId]);
    expect(resultado.every((i) => i.activa)).toBe(true);
    expect(resultado.map((i) => i.alumnoId).sort()).toEqual(['alum-1', 'alum-2']);
    const deAlum1 = resultado.find((i) => i.alumnoId === 'alum-1')!;
    expect(deAlum1.dias).toHaveLength(2);
    expect(await repo.findActivasConDiasVinculadosA([])).toEqual([]);
  });

  it('update cambia el nombre y devuelve los días', async () => {
    const vigente = (await repo.findVigentePorAlumno('alum-2'))!;
    const actualizada = await repo.update(vigente.id, { nombre: 'Nuevo nombre' });
    expect(actualizada.nombre).toBe('Nuevo nombre');
    expect(actualizada.dias).toHaveLength(2);
  });
});
