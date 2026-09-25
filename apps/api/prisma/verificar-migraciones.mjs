// Aplica prisma/migrations (SQL escrito a mano) sobre un Postgres en
// memoria y compara el resultado contra schema.prisma. Exit 0 = sin
// diferencias. Nunca toca Supabase.
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dirMigraciones = join(raiz, 'prisma', 'migrations');

const puerto = await new Promise((resolve, reject) => {
  const s = createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});

const db = await PGlite.create();
await db.exec('CREATE TABLE "_prisma_migrations" (id text PRIMARY KEY);');
for (const nombre of readdirSync(dirMigraciones)
  .filter((d) => /^\d/.test(d))
  .sort()) {
  await db.exec(readFileSync(join(dirMigraciones, nombre, 'migration.sql'), 'utf8'));
}

const servidor = new PGLiteSocketServer({ db, port: puerto, host: '127.0.0.1' });
await servidor.start();

const url = `postgresql://postgres:postgres@127.0.0.1:${puerto}/postgres?connection_limit=1&sslmode=disable`;
// spawn asíncrono (no spawnSync): el servidor PGlite corre en este mismo
// event loop y tiene que poder atender a Prisma mientras el hijo corre.
const codigo = await new Promise((resolve) => {
  const hijo = spawn(
    'npx',
    [
      'prisma',
      'migrate',
      'diff',
      '--from-url',
      url,
      '--to-schema-datamodel',
      'prisma/schema.prisma',
      '--exit-code',
    ],
    { cwd: raiz, stdio: 'inherit' },
  );
  hijo.on('close', (c) => resolve(c ?? 1));
});

await servidor.stop();
await db.close();
process.exit(codigo);
