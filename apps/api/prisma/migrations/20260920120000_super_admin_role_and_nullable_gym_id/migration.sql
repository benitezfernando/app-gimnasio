-- SUPER_ADMIN: rol nuevo, sin gymId (por eso User.gymId pasa a nullable).
-- ALTER TYPE ... ADD VALUE no puede usarse en la misma transacción en la
-- que ese valor nuevo se INSERTA/lee — acá solo se agrega, no se usa,
-- así que corre sin problema dentro de la transacción que Prisma ya abre
-- por archivo de migración.
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';

ALTER TABLE "User" ALTER COLUMN "gymId" DROP NOT NULL;
