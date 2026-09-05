-- DropIndex
DROP INDEX "User_gymId_email_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "email",
ADD COLUMN     "username" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_gymId_username_key" ON "User"("gymId", "username");
