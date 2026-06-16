-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'MAGAD';
ALTER TYPE "Role" ADD VALUE 'SAMAGAD';

-- AlterTable
ALTER TABLE "Battalion" ADD COLUMN     "armoryTestUrl" TEXT;

-- AlterTable
ALTER TABLE "Soldier" ADD COLUMN     "armoryTestProofAt" TIMESTAMP(3),
ADD COLUMN     "armoryTestProofImage" TEXT,
ADD COLUMN     "weaponsAgreementSignature" TEXT,
ADD COLUMN     "weaponsAgreementSignedAt" TIMESTAMP(3),
ADD COLUMN     "weaponsApprovedAt" TIMESTAMP(3),
ADD COLUMN     "weaponsApprovedById" TEXT;
