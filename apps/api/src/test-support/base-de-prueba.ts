import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient } from '@prisma/client';

const DIR_MIGRACIONES = join(__dirname, '..', '..', 'prisma', 'migrations');

export function listarMigraciones(): string[] {
  return readdirSync(DIR_MIGRACIONES)
    .filter((nombre) => /^\d/.test(nombre))
    .sort();
}

export async function aplicarMigracion(db: PGlite, nombre: string): Promise<void> {
  await db.exec(readFileSync(join(DIR_MIGRACIONES, nombre, 'migration.sql'), 'utf8'));
}

/**
 * Postgres real en memoria con las migraciones del repo aplicadas en
 * orden. `_prisma_migrations` se crea vacía porque la migración de RLS la
 * referencia y en Supabase la crea Prisma, no una migración.
 */
export async function crearPGliteMigrado(opciones: { excluir?: string[] } = {}): Promise<PGlite> {
  const db = await PGlite.create();
  try {
    await db.exec('CREATE TABLE "_prisma_migrations" (id text PRIMARY KEY);');
    const excluir = new Set(opciones.excluir ?? []);
    for (const nombre of listarMigraciones()) {
      if (!excluir.has(nombre)) {
        await aplicarMigracion(db, nombre);
      }
    }
  } catch (err) {
    await db.close();
    throw err;
  }
  return db;
}

function puertoLibre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const servidor = createServer();
    servidor.once('error', reject);
    servidor.listen(0, '127.0.0.1', () => {
      const direccion = servidor.address();
      const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;
      servidor.close(() => resolve(puerto));
    });
  });
}

export interface ConexionPrisma {
  prisma: PrismaClient;
  cerrar(): Promise<void>;
}

/** PGlite atiende una sola conexión: `connection_limit=1` es obligatorio. */
export async function conectarPrisma(db: PGlite): Promise<ConexionPrisma> {
  const port = await puertoLibre();
  const servidor = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
  await servidor.start();

  let prisma: PrismaClient;
  try {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?connection_limit=1&sslmode=disable`,
        },
      },
    });
  } catch (err) {
    await servidor.stop();
    throw err;
  }

  return {
    prisma,
    async cerrar() {
      const errores: Error[] = [];

      try {
        await prisma.$disconnect();
      } catch (err) {
        errores.push(err instanceof Error ? err : new Error(String(err)));
      }

      try {
        await servidor.stop();
      } catch (err) {
        errores.push(err instanceof Error ? err : new Error(String(err)));
      }

      try {
        await db.close();
      } catch (err) {
        errores.push(err instanceof Error ? err : new Error(String(err)));
      }

      if (errores.length > 0) {
        const mensaje = errores.map((e) => e.message).join('; ');
        throw new Error(`Error(es) durante cerrar(): ${mensaje}`);
      }
    },
  };
}
