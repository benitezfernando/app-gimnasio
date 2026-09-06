import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { SupabaseAdminAuthProvider } from '../src/identity/infrastructure/auth/supabase-admin-auth.provider';

const prisma = new PrismaClient();

const REGEX_USERNAME = /^[a-z0-9._-]+$/;

/**
 * Bootstrap del primer ADMIN de un gimnasio — resuelve el problema
 * huevo-gallina de `CreateUserUseCase`: ese caso de uso NUNCA permite
 * crear un ADMIN vía la API (la jerarquía de creación siempre arranca
 * desde un ADMIN ya existente — ver su comentario "nunca ADMIN, no es
 * una capacidad de esta app"). Este script es la ÚNICA vía para que
 * exista un ADMIN.
 *
 * Corre fuera de la app, con el service_role key, y reusa
 * `SupabaseAdminAuthProvider.createStaffUser` (el mismo código de
 * producción que usa `CreateUserUseCase` para dar de alta un PROFESOR) —
 * así no se duplica la lógica de email sintético fuera de
 * `identity/infrastructure/auth/`.
 *
 * Idempotente: si ya existe un ADMIN para el `gymId` dado, no hace nada
 * y termina en 0 — se puede correr de nuevo sin duplicar ni romper nada.
 *
 * Uso:
 *   SEED_ADMIN_GYM_ID=gym-fer \
 *   SEED_ADMIN_USERNAME=fer \
 *   SEED_ADMIN_NOMBRE="Fernando Benitez" \
 *   SEED_ADMIN_PASSWORD="una-password-real-de-verdad" \
 *   pnpm seed:admin
 */
async function main() {
  const gymId = requireEnv('SEED_ADMIN_GYM_ID');
  const username = requireEnv('SEED_ADMIN_USERNAME');
  const nombre = requireEnv('SEED_ADMIN_NOMBRE');
  const password = requireEnv('SEED_ADMIN_PASSWORD');

  // Mismas restricciones que CreateProfesorDto — este script bypasea esa
  // capa de validación a propósito (no hay sesión todavía), así que las
  // reimplementa acá para no romper el invariante de synthetic-credentials.ts
  // (el username no puede contener @/+/: ) ni bajar el piso de seguridad.
  if (!REGEX_USERNAME.test(username)) {
    throw new Error(
      `SEED_ADMIN_USERNAME inválido: solo se permiten minúsculas, números, '.', '_' y '-' (recibido: "${username}")`,
    );
  }
  if (password.length < 6) {
    throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 6 caracteres');
  }
  if (nombre.length < 2) {
    throw new Error('SEED_ADMIN_NOMBRE debe tener al menos 2 caracteres');
  }

  const adminExistente = await prisma.user.findFirst({ where: { gymId, role: Role.ADMIN } });
  if (adminExistente) {
    console.log(
      `Ya existe un ADMIN para gymId="${gymId}" (username="${adminExistente.username}") — no se crea otro. Nada que hacer.`,
    );
    return;
  }

  const provider = new SupabaseAdminAuthProvider();
  const { authUserId } = await provider.createStaffUser(gymId, username, password);

  try {
    await prisma.user.create({
      data: { gymId, authUserId, username, nombre, role: Role.ADMIN },
    });
  } catch (error) {
    // Compensación: si falla la fila en Prisma (p.ej. username duplicado
    // en ese gym), no dejar un usuario huérfano en Supabase Auth — mismo
    // patrón que ya usa CreateUserUseCase para PROFESOR/ALUMNO.
    await provider.deleteAuthUser(authUserId).catch(() => {
      console.error(
        `Además falló la compensación: quedó un usuario huérfano en Supabase Auth (authUserId=${authUserId}) — borralo a mano desde el dashboard de Supabase.`,
      );
    });
    throw error;
  }

  console.log(`ADMIN creado: gymId="${gymId}" username="${username}".`);
  console.log('Guardá el username y la password reales en un lugar seguro — no quedan acá.');
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name} (ver el encabezado de prisma/seed-admin.ts)`,
    );
  }
  return value;
}

main()
  .catch((error) => {
    console.error('Error corriendo el seed del ADMIN:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
