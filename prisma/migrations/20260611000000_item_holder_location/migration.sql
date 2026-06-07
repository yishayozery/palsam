-- CreateTable: מיקום פריט במידוף של holder ספציפי (מאפשר אותו פריט במיקומים שונים בכל מחסן/פלוגה)
CREATE TABLE "ItemHolderLocation" (
    "id" TEXT NOT NULL,
    "itemTypeId" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemHolderLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemHolderLocation_itemTypeId_holderId_key" ON "ItemHolderLocation"("itemTypeId", "holderId");
CREATE INDEX "ItemHolderLocation_itemTypeId_idx" ON "ItemHolderLocation"("itemTypeId");
CREATE INDEX "ItemHolderLocation_holderId_idx" ON "ItemHolderLocation"("holderId");
CREATE INDEX "ItemHolderLocation_locationId_idx" ON "ItemHolderLocation"("locationId");

-- AddForeignKey
ALTER TABLE "ItemHolderLocation" ADD CONSTRAINT "ItemHolderLocation_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "ItemType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemHolderLocation" ADD CONSTRAINT "ItemHolderLocation_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "Holder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemHolderLocation" ADD CONSTRAINT "ItemHolderLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StorageLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
