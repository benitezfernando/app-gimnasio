import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { SupabaseAdminAuthProvider } from '../src/identity/infrastructure/auth/supabase-admin-auth.provider';
import { PLATFORM_PSEUDO_GYM_ID } from '../src/identity/infrastructure/auth/synthetic-credentials';

const prisma = new PrismaClient();
const REGEX_USERNAME = /^[a-z0-9._-]+$/;

/**
 * Bootstrap del primer SUPER_ADMIN — mismo problema huevo-gallina que
 * seed-admin.ts para el primer ADMIN: `CreateAdminUseCase` (super-admin/)
 * exige ya estar autenticado como SUPER_ADMIN, así que el primero solo
 * puede nacer acá, fuera de la app.
 *
 * Uso:
 *   SEED_SUPER_ADMIN_USERNAME=root \
 *   SEED_SUPER_ADMIN_NOMBRE="Fernando Benitiz" \
 *   SEED_SUPER_ADMIN_PASSWORD="una-password-real-de-verdad" \
 *   pnpm seed:super-admin
 */
async function main() {
  const username = requireEnv('SEED_SUPER_ADMIN_USERNAME');
  const nombre = requireEnv('SEED_SUPER_ADMIN_NOMBRE');
  const password = requireEnv('SEED_SUPER_ADMIN_PASSWORD');

  if (!REGEX_USERNAME.test(username)) {
    throw new Error(
      `SEED_SUPER_ADMIN_USERNAME inválido: solo minúsculas, números, '.', '_' y '-' (recibido: "${username}")`,
    );
  }
  if (password.length < 6) {
    throw new Error('SEED_SUPER_ADMIN_PASSWORD debe tener al menos 6 caracteres');
  }

  const yaExiste = await prisma.user.findFirst({ where: { role: Role.SUPER_ADMIN, username } });
  if (yaExiste) {
    console.log(`Ya existe un SUPER_ADMIN con username="${username}" — no se crea otro.`);
    return;
  }

  const provider = new SupabaseAdminAuthProvider();
  const { authUserId } = await provider.createStaffUser(PLATFORM_PSEUDO_GYM_ID, username, password);

  try {
    await prisma.user.create({
      data: { gymId: null, authUserId, username, nombre, role: Role.SUPER_ADMIN },
    });
  } catch (error) {
    await provider.deleteAuthUser(authUserId).catch(() => {
      console.error(
        `Además falló la compensación: quedó un usuario huérfano en Supabase Auth (authUserId=${authUserId}) — borralo a mano.`,
      );
    });
    throw error;
  }

  console.log(`SUPER_ADMIN creado: username="${username}".`);
  console.log('Guardá el username y la password reales en un lugar seguro — no quedan acá.');
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name} (ver el encabezado de prisma/seed-super-admin.ts)`,
    );
  }
  return value;
}

main()
  .catch((error) => {
    console.error('Error corriendo el seed del SUPER_ADMIN:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
