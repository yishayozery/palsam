-- SignableKit
CREATE TABLE "SignableKit" (
  "id" TEXT NOT NULL,
  "battalionId" TEXT NOT NULL,
  "holderId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SignableKit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SignableKit_holderId_name_key" ON "SignableKit"("holderId", "name");
ALTER TABLE "SignableKit" ADD CONSTRAINT "SignableKit_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "Holder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SignableKitLine" (
  "id" TEXT NOT NULL,
  "kitId" TEXT NOT NULL,
  "itemTypeId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "SignableKitLine_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SignableKitLine" ADD CONSTRAINT "SignableKitLine_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "SignableKit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SignableKitLine" ADD CONSTRAINT "SignableKitLine_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "ItemType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- vehicleId on SerialUnit
ALTER TABLE "SerialUnit" ADD COLUMN "vehicleId" TEXT;
ALTER TABLE "SerialUnit" ADD CONSTRAINT "SerialUnit_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "SerialUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
