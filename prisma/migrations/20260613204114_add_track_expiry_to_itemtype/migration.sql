-- DropForeignKey
ALTER TABLE "ItemType" DROP CONSTRAINT "ItemType_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "Signature" DROP CONSTRAINT "Signature_soldierId_fkey";

-- DropIndex
DROP INDEX "Soldier_secondaryHolderId_idx";

-- AlterTable
ALTER TABLE "ItemType" ADD COLUMN     "trackExpiry" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "ItemType" ADD CONSTRAINT "ItemType_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_soldierId_fkey" FOREIGN KEY ("soldierId") REFERENCES "Soldier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "SerialUnit_expiryDate_idx" RENAME TO "SerialUnit_battalionId_expiryDate_idx";
