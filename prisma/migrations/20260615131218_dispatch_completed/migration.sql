-- AlterTable
ALTER TABLE "VehicleAssignment" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completedById" TEXT;

-- CreateIndex
CREATE INDEX "VehicleAssignment_battalionId_completedAt_idx" ON "VehicleAssignment"("battalionId", "completedAt");
