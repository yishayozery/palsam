-- AlterTable
ALTER TABLE "StockBalance" ADD COLUMN     "equipmentLocationId" TEXT;

-- CreateTable
CREATE TABLE "SoldierItemLocation" (
    "id" TEXT NOT NULL,
    "battalionId" TEXT NOT NULL,
    "soldierId" TEXT NOT NULL,
    "itemTypeId" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "equipmentLocationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SoldierItemLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SoldierItemLocation_battalionId_idx" ON "SoldierItemLocation"("battalionId");

-- CreateIndex
CREATE INDEX "SoldierItemLocation_soldierId_idx" ON "SoldierItemLocation"("soldierId");

-- CreateIndex
CREATE INDEX "SoldierItemLocation_equipmentLocationId_idx" ON "SoldierItemLocation"("equipmentLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "SoldierItemLocation_soldierId_itemTypeId_statusId_equipment_key" ON "SoldierItemLocation"("soldierId", "itemTypeId", "statusId", "equipmentLocationId");

-- CreateIndex
CREATE INDEX "StockBalance_equipmentLocationId_idx" ON "StockBalance"("equipmentLocationId");

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_equipmentLocationId_fkey" FOREIGN KEY ("equipmentLocationId") REFERENCES "EquipmentLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoldierItemLocation" ADD CONSTRAINT "SoldierItemLocation_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoldierItemLocation" ADD CONSTRAINT "SoldierItemLocation_soldierId_fkey" FOREIGN KEY ("soldierId") REFERENCES "Soldier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoldierItemLocation" ADD CONSTRAINT "SoldierItemLocation_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "ItemType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoldierItemLocation" ADD CONSTRAINT "SoldierItemLocation_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "ItemStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoldierItemLocation" ADD CONSTRAINT "SoldierItemLocation_equipmentLocationId_fkey" FOREIGN KEY ("equipmentLocationId") REFERENCES "EquipmentLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
