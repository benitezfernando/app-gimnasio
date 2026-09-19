import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { buildSyntheticEmail } from '../src/identity/infrastructure/auth/synthetic-credentials';

const prisma = new PrismaClient();
const REGEX_USERNAME = /^[a-z0-9._-]+$/;

/**
 * One-off: renombra el username de un ADMIN existente. No es una
 * feature de la app (ningún caso de uso permite renombrar un usuario) —
 * el login resuelve por email sintético `username+gymId@gym.internal`
 * (ver synthetic-credentials.ts), así que renombrar exige tocar DOS
 * sistemas en el mismo momento: el email en Supabase Auth y el
 * `username` en Prisma. Si solo se tocara uno, el login quedaría roto.
 *
 * Uso:
 *   RENAME_ADMIN_OLD_USERNAME=fer \
 *   RENAME_ADMIN_NEW_USERNAME=admin \
 *   pnpm rename:admin -- --dry-run
 *
 *   (sin --dry-run para aplicar de verdad)
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const oldUsername = requireEnv('RENAME_ADMIN_OLD_USERNAME');
  const newUsername = requireEnv('RENAME_ADMIN_NEW_USERNAME');

  if (!REGEX_USERNAME.test(newUsername)) {
    throw new Error(
      `RENAME_ADMIN_NEW_USERNAME inválido: solo minúsculas, números, '.', '_' y '-' (recibido: "${newUsername}")`,
    );
  }

  const admin = await prisma.user.findFirst({
    where: { role: Role.ADMIN, username: oldUsername },
  });
  if (!admin) {
    throw new Error(`No se encontró ningún ADMIN con username="${oldUsername}"`);
  }

  const yaExisteElNuevo = await prisma.user.findFirst({
    where: { gymId: admin.gymId, username: newUsername },
  });
  if (yaExisteElNuevo) {
    throw new Error(
      `Ya existe un usuario con username="${newUsername}" en este gym (id=${yaExisteElNuevo.id})`,
    );
  }

  const nuevoEmail = buildSyntheticEmail(admin.gymId, newUsername);

  console.log(
    `Plan: ADMIN "${oldUsername}" (id=${admin.id}, authUserId=${admin.authUserId}) → username="${newUsername}" (email sintético en Supabase Auth → "${nuevoEmail}")`,
  );

  if (dryRun) {
    console.log('Dry-run: no se escribió nada.');
    return;
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno');
  }
  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: authError } = await supabase.auth.admin.updateUserById(admin.authUserId, {
    email: nuevoEmail,
  });
  if (authError) {
    throw new Error(`No se pudo actualizar el email en Supabase Auth: ${authError.message}`);
  }

  try {
    await prisma.user.update({ where: { id: admin.id }, data: { username: newUsername } });
  } catch (error) {
    // Compensación: si falla la fila en Prisma, revertir el email en
    // Supabase Auth para no dejar el username y el email desincronizados
    // (el login quedaría roto para ambos usernames).
    await supabase.auth.admin
      .updateUserById(admin.authUserId, { email: buildSyntheticEmail(admin.gymId, oldUsername) })
      .catch(() => {
        console.error(
          `Además falló la compensación: el email en Supabase Auth quedó en "${nuevoEmail}" pero el username en la base sigue siendo "${oldUsername}" — corregilo a mano.`,
        );
      });
    throw error;
  }

  console.log(`Listo. ADMIN renombrado: "${oldUsername}" → "${newUsername}".`);
  console.log('La password no cambió — seguís entrando con la misma.');
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name} (ver el encabezado de prisma/rename-admin-username.ts)`,
    );
  }
  return value;
}

main()
  .catch((error) => {
    console.error('Error corriendo el rename del ADMIN:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
