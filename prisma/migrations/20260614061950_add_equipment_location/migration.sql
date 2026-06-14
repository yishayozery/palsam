-- AlterTable
ALTER TABLE "SerialUnit" ADD COLUMN     "equipmentLocationId" TEXT;

-- CreateTable
CREATE TABLE "EquipmentLocation" (
    "id" TEXT NOT NULL,
    "battalionId" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vehicleSerialUnitId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquipmentLocation_battalionId_idx" ON "EquipmentLocation"("battalionId");

-- CreateIndex
CREATE INDEX "EquipmentLocation_holderId_idx" ON "EquipmentLocation"("holderId");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentLocation_holderId_name_key" ON "EquipmentLocation"("holderId", "name");

-- AddForeignKey
ALTER TABLE "EquipmentLocation" ADD CONSTRAINT "EquipmentLocation_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLocation" ADD CONSTRAINT "EquipmentLocation_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "Holder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLocation" ADD CONSTRAINT "EquipmentLocation_vehicleSerialUnitId_fkey" FOREIGN KEY ("vehicleSerialUnitId") REFERENCES "SerialUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialUnit" ADD CONSTRAINT "SerialUnit_equipmentLocationId_fkey" FOREIGN KEY ("equipmentLocationId") REFERENCES "EquipmentLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
