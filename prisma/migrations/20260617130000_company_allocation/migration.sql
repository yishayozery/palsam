-- CreateTable
CREATE TABLE "CompanyAllocation" (
    "id" TEXT NOT NULL,
    "battalionId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "itemTypeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "blockOnExceed" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,

    CONSTRAINT "CompanyAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyAllocation_companyId_itemTypeId_key" ON "CompanyAllocation"("companyId", "itemTypeId");
CREATE INDEX "CompanyAllocation_battalionId_idx" ON "CompanyAllocation"("battalionId");
CREATE INDEX "CompanyAllocation_companyId_idx" ON "CompanyAllocation"("companyId");
CREATE INDEX "CompanyAllocation_itemTypeId_idx" ON "CompanyAllocation"("itemTypeId");

-- AddForeignKey
ALTER TABLE "CompanyAllocation" ADD CONSTRAINT "CompanyAllocation_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyAllocation" ADD CONSTRAINT "CompanyAllocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Holder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyAllocation" ADD CONSTRAINT "CompanyAllocation_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "ItemType"("id") ON DELETE CASCADE ON UPDATE CASCADE;