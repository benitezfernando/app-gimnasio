import { PGlite } from '@electric-sql/pglite';
import { aplicarMigracion, crearPGliteMigrado } from '../../../test-support/base-de-prueba';

jest.setTimeout(60_000);

const MIGRACION = '20260924120000_rutina_por_dias';

const DATOS_PREVIOS = `
INSERT INTO "User" ("id","authUserId","gymId","username","nombre","role","updatedAt") VALUES
  ('prof-1','auth-prof','gym-1','profe','Profe','PROFESOR',now()),
  ('alum-1','auth-a1','gym-1','a1','A1','ALUMNO',now()),
  ('alum-2','auth-a2','gym-1','a2','A2','ALUMNO',now()),
  ('alum-3','auth-a3','gym-1','a3','A3','ALUMNO',now()),
  ('alum-4','auth-a4','gym-1','a4','A4','ALUMNO',now());
INSERT INTO "Exercise" ("id","nombre","parteCuerpo","grupoMuscular","updatedAt") VALUES
  ('ex-1','Sentadilla','piernas','cuadriceps',now()),
  ('ex-2','Remo','espalda','dorsal',now());
INSERT INTO "RoutineTemplate" ("id","gymId","profesorId","nombre","updatedAt") VALUES
  ('tpl-a','gym-1','prof-1','Full body',now()),
  ('tpl-vacia','gym-1','prof-1','Vacía',now());
INSERT INTO "RoutineTemplateExercise" ("id","templateId","exerciseId","orden","series","repeticiones") VALUES
  ('te-1','tpl-a','ex-1',1,4,12),
  ('te-2','tpl-a','ex-2',2,3,10);
INSERT INTO "RoutineInstance" ("id","gymId","profesorId","alumnoId","nombre","origenTemplateId","vinculada","updatedAt") VALUES
  ('inst-vinc','gym-1','prof-1','alum-1','Vinculada','tpl-a',true,now()),
  ('inst-libre','gym-1','prof-1','alum-2','Libre','tpl-a',false,now()),
  ('inst-huerfana','gym-1','prof-1','alum-3','Huérfana',NULL,true,now()),
  ('inst-vacia','gym-1','prof-1','alum-4','Vacía',NULL,false,now());
INSERT INTO "RoutineInstanceExercise" ("id","instanceId","exerciseId","orden","series","repeticiones","peso") VALUES
  ('ie-1','inst-vinc','ex-1',1,3,8,20),
  ('ie-2','inst-vinc','ex-2',2,3,8,NULL),
  ('ie-3','inst-libre','ex-1',1,5,5,60),
  ('ie-4','inst-huerfana','ex-2',1,4,10,NULL);
`;

describe(`migración ${MIGRACION}`, () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await crearPGliteMigrado({ excluir: [MIGRACION] });
    await db.exec(DATOS_PREVIOS);
    await aplicarMigracion(db, MIGRACION);
  });

  afterAll(async () => {
    await db.close();
  });

  async function filas<T>(sql: string): Promise<T[]> {
    return (await db.query<T>(sql)).rows;
  }

  it('cada plantilla con ejercicios recibe un Día 1 con todos sus ejercicios, en el mismo orden', async () => {
    const dias = await filas<{ templateId: string; numero: number; id: string }>(
      `SELECT "templateId","numero","id" FROM "RoutineTemplateDay" ORDER BY "templateId"`,
    );
    expect(dias.map((d) => [d.templateId, d.numero])).toEqual([['tpl-a', 1]]);

    const ejercicios = await filas<{ id: string; dayId: string; orden: number }>(
      `SELECT "id","dayId","orden" FROM "RoutineTemplateExercise" ORDER BY "orden"`,
    );
    expect(ejercicios).toEqual([
      { id: 'te-1', dayId: dias[0].id, orden: 1 },
      { id: 'te-2', dayId: dias[0].id, orden: 2 },
    ]);
  });

  it('una instancia vinculada queda con su Día 1 vinculado al Día 1 de su plantilla', async () => {
    const [diaPlantilla] = await filas<{ id: string }>(
      `SELECT "id" FROM "RoutineTemplateDay" WHERE "templateId" = 'tpl-a'`,
    );
    const dias = await filas<{
      instanceId: string;
      numero: number;
      vinculadoADiaId: string | null;
    }>(
      `SELECT "instanceId","numero","vinculadoADiaId" FROM "RoutineInstanceDay" ORDER BY "instanceId"`,
    );
    expect(dias).toEqual([
      { instanceId: 'inst-huerfana', numero: 1, vinculadoADiaId: null },
      { instanceId: 'inst-libre', numero: 1, vinculadoADiaId: null },
      { instanceId: 'inst-vinc', numero: 1, vinculadoADiaId: diaPlantilla.id },
    ]);
  });

  it('no se pierde ningún ejercicio de instancia y cada uno cuelga del día de su instancia', async () => {
    const filasEjercicios = await filas<{ id: string; instanceId: string }>(
      `SELECT e."id", d."instanceId" FROM "RoutineInstanceExercise" e
       JOIN "RoutineInstanceDay" d ON d."id" = e."dayId" ORDER BY e."id"`,
    );
    expect(filasEjercicios).toEqual([
      { id: 'ie-1', instanceId: 'inst-vinc' },
      { id: 'ie-2', instanceId: 'inst-vinc' },
      { id: 'ie-3', instanceId: 'inst-libre' },
      { id: 'ie-4', instanceId: 'inst-huerfana' },
    ]);
  });

  it('se eliminan las columnas viejas', async () => {
    const columnas = await filas<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE (table_name = 'RoutineInstance' AND column_name IN ('vinculada','origenTemplateId'))
          OR (table_name = 'RoutineTemplateExercise' AND column_name = 'templateId')
          OR (table_name = 'RoutineInstanceExercise' AND column_name = 'instanceId')`,
    );
    expect(columnas).toEqual([]);
  });

  it('las tablas nuevas tienen RLS habilitado', async () => {
    const tablas = await filas<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class
       WHERE relname IN ('RoutineTemplateDay','RoutineInstanceDay') ORDER BY relname`,
    );
    expect(tablas).toEqual([
      { relname: 'RoutineInstanceDay', relrowsecurity: true },
      { relname: 'RoutineTemplateDay', relrowsecurity: true },
    ]);
  });

  it('borrar un día de plantilla desvincula el día de instancia sin borrarlo', async () => {
    await db.exec(`DELETE FROM "RoutineTemplate" WHERE "id" = 'tpl-a'`);
    const [dia] = await filas<{ vinculadoADiaId: string | null }>(
      `SELECT "vinculadoADiaId" FROM "RoutineInstanceDay" WHERE "instanceId" = 'inst-vinc'`,
    );
    expect(dia.vinculadoADiaId).toBeNull();
  });
});
