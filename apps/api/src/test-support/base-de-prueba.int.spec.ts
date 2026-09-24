import { ConexionPrisma, conectarPrisma, crearPGliteMigrado } from './base-de-prueba';

jest.setTimeout(60_000);

describe('base de prueba PGlite', () => {
  let conexion: ConexionPrisma;

  beforeAll(async () => {
    conexion = await conectarPrisma(await crearPGliteMigrado());
  });

  afterAll(async () => {
    await conexion.cerrar();
  });

  it('aplica todas las migraciones y Prisma consulta dentro de una transacción interactiva', async () => {
    const cantidad = await conexion.prisma.$transaction(async (tx) => tx.routineTemplate.count());
    expect(cantidad).toBe(0);
  });
});
