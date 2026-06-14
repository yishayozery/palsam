-- AlterTable
ALTER TABLE "AppUser" ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpSecret" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "hash" TEXT,
ADD COLUMN     "prevHash" TEXT;
