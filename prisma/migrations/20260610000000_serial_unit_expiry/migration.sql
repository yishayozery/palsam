-- AlterTable
ALTER TABLE "SerialUnit" ADD COLUMN "expiryDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SerialUnit_expiryDate_idx" ON "SerialUnit"("battalionId", "expiryDate");
