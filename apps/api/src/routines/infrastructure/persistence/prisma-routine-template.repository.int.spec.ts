import { PrismaClient } from '@prisma/client';
import {
  ConexionPrisma,
  conectarPrisma,
  crearPGliteMigrado,
} from '../../../test-support/base-de-prueba';
import { GYM, sembrarUsuariosYEjercicios } from '../../../test-support/semillas';
import { PrismaService } from '../../../shared-kernel/prisma.service';
import { EjercicioItem } from '../../application/ports/routine-template-repository.port';
import { PrismaRoutineTemplateRepository } from './prisma-routine-template.repository';

jest.setTimeout(60_000);

function ej(exerciseId: string, orden: number, series = 3): EjercicioItem {
  return { exerciseId, orden, series, repeticiones: 10, peso: 12.5, notas: null };
}

describe('PrismaRoutineTemplateRepository (PGlite)', () => {
  let conexion: ConexionPrisma;
  let prisma: PrismaClient;
  let repo: PrismaRoutineTemplateRepository;

  beforeAll(async () => {
    conexion = await conectarPrisma(await crearPGliteMigrado());
    prisma = conexion.prisma;
    repo = new PrismaRoutineTemplateRepository(prisma as unknown as PrismaService);
    await sembrarUsuariosYEjercicios(prisma);
  });

  afterAll(async () => {
    await conexion.cerrar();
  });

  async function nuevaPlantilla(nombre: string): Promise<string> {
    const { id } = await repo.create({
      gymId: GYM,
      profesorId: 'prof-1',
      nombre,
      descripcion: null,
    });
    return id;
  }

  it('guardarDias crea días numerados por posición y findById los devuelve ordenados', async () => {
    const id = await nuevaPlantilla('A');
    await repo.guardarDias(
      id,
      [{ ejercicios: [ej('ex-1', 1), ej('ex-2', 2)] }, { ejercicios: [ej('ex-1', 1)] }],
      [],
    );

    const detalle = await repo.findById(id);
    expect(detalle?.dias.map((d) => [d.numero, d.ejercicios.map((e) => e.exerciseId)])).toEqual([
      [1, ['ex-1', 'ex-2']],
      [2, ['ex-1']],
    ]);
    expect(detalle?.dias[0].ejercicios[0].peso).toBe(12.5);
  });

  it('reordenar días conserva sus ids (dos pasadas, sin violar el unique de numero)', async () => {
    const id = await nuevaPlantilla('B');
    await repo.guardarDias(
      id,
      [{ ejercicios: [ej('ex-1', 1)] }, { ejercicios: [ej('ex-2', 1)] }],
      [],
    );
    const [dia1, dia2] = (await repo.findById(id))!.dias;

    await repo.guardarDias(
      id,
      [
        { id: dia2.id, ejercicios: dia2.ejercicios },
        { id: dia1.id, ejercicios: dia1.ejercicios },
      ],
      [],
    );

    const dias = (await repo.findById(id))!.dias;
    expect(dias.map((d) => [d.numero, d.id])).toEqual([
      [1, dia2.id],
      [2, dia1.id],
    ]);
  });

  it('un día omitido se borra y el día de instancia vinculado queda independiente e intacto', async () => {
    const id = await nuevaPlantilla('C');
    await repo.guardarDias(
      id,
      [{ ejercicios: [ej('ex-1', 1)] }, { ejercicios: [ej('ex-3', 1)] }],
      [],
    );
    const [dia1, dia2] = (await repo.findById(id))!.dias;
    const instancia = await prisma.routineInstance.create({
      data: {
        gymId: GYM,
        profesorId: 'prof-1',
        alumnoId: 'alum-1',
        nombre: 'R',
        dias: {
          create: {
            numero: 1,
            vinculadoADiaId: dia2.id,
            ejercicios: { create: { exerciseId: 'ex-3', orden: 1, series: 5, repeticiones: 5 } },
          },
        },
      },
      include: { dias: { include: { ejercicios: true } } },
    });

    await repo.guardarDias(id, [{ id: dia1.id, ejercicios: dia1.ejercicios }], []);

    const diaInstancia = await prisma.routineInstanceDay.findUniqueOrThrow({
      where: { id: instancia.dias[0].id },
      include: { ejercicios: true },
    });
    expect(diaInstancia.vinculadoADiaId).toBeNull();
    expect(diaInstancia.ejercicios.map((e) => [e.exerciseId, e.series])).toEqual([['ex-3', 5]]);
    expect((await repo.findById(id))!.dias.map((d) => d.id)).toEqual([dia1.id]);
  });

  it('la propagación reemplaza los ejercicios del día de instancia en la misma transacción', async () => {
    const id = await nuevaPlantilla('D');
    await repo.guardarDias(id, [{ ejercicios: [ej('ex-1', 1)] }], []);
    const [dia] = (await repo.findById(id))!.dias;
    const instancia = await prisma.routineInstance.create({
      data: {
        gymId: GYM,
        profesorId: 'prof-1',
        alumnoId: 'alum-2',
        nombre: 'R',
        dias: {
          create: {
            numero: 1,
            vinculadoADiaId: dia.id,
            ejercicios: { create: { exerciseId: 'ex-1', orden: 1, series: 3, repeticiones: 10 } },
          },
        },
      },
      include: { dias: true },
    });

    await repo.guardarDias(
      id,
      [{ id: dia.id, ejercicios: [ej('ex-1', 1), ej('ex-4', 2)] }],
      [{ diaInstanciaId: instancia.dias[0].id, ejercicios: [ej('ex-1', 1, 9), ej('ex-4', 2)] }],
    );

    const ejercicios = await prisma.routineInstanceExercise.findMany({
      where: { dayId: instancia.dias[0].id },
      orderBy: { orden: 'asc' },
    });
    expect(ejercicios.map((e) => [e.exerciseId, e.series])).toEqual([
      ['ex-1', 9],
      ['ex-4', 3],
    ]);
  });

  it('findDiasByIds devuelve plantilla, dueño y exerciseIds de cada día', async () => {
    const id = await nuevaPlantilla('Piernas');
    await repo.guardarDias(id, [{ ejercicios: [ej('ex-2', 1), ej('ex-5', 2)] }], []);
    const [dia] = (await repo.findById(id))!.dias;

    expect(await repo.findDiasByIds([dia.id, 'no-existe'])).toEqual([
      {
        id: dia.id,
        numero: 1,
        templateId: id,
        templateNombre: 'Piernas',
        profesorId: 'prof-1',
        gymId: GYM,
        exerciseIds: ['ex-2', 'ex-5'],
      },
    ]);
    expect(await repo.findDiasByIds([])).toEqual([]);
  });

  it('borrar la plantilla borra sus días y desvincula instancias', async () => {
    const id = await nuevaPlantilla('E');
    await repo.guardarDias(id, [{ ejercicios: [ej('ex-1', 1)] }], []);
    await repo.delete(id);
    expect(await prisma.routineTemplateDay.count({ where: { templateId: id } })).toBe(0);
  });
});
