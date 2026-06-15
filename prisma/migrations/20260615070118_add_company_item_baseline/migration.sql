-- DropIndex
DROP INDEX "StockBalance_itemTypeId_holderId_statusId_key";

-- CreateTable
CREATE TABLE "CompanyItemBaseline" (
    "id" TEXT NOT NULL,
    "battalionId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "itemTypeId" TEXT NOT NULL,
    "permanentQuantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "CompanyItemBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyItemBaseline_battalionId_idx" ON "CompanyItemBaseline"("battalionId");

-- CreateIndex
CREATE INDEX "CompanyItemBaseline_companyId_idx" ON "CompanyItemBaseline"("companyId");

-- CreateIndex
CREATE INDEX "CompanyItemBaseline_itemTypeId_idx" ON "CompanyItemBaseline"("itemTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyItemBaseline_companyId_itemTypeId_key" ON "CompanyItemBaseline"("companyId", "itemTypeId");

-- AddForeignKey
ALTER TABLE "CompanyItemBaseline" ADD CONSTRAINT "CompanyItemBaseline_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyItemBaseline" ADD CONSTRAINT "CompanyItemBaseline_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Holder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyItemBaseline" ADD CONSTRAINT "CompanyItemBaseline_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "ItemType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "StockBalance_itemTypeId_holderId_statusId_equipmentLocationId_k" RENAME TO "StockBalance_itemTypeId_holderId_statusId_equipmentLocation_key";
