-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'BATTALION_ADMIN', 'WAREHOUSE_MANAGER', 'COMPANY_REP', 'VIEWER');

-- CreateEnum
CREATE TYPE "HolderKind" AS ENUM ('WAREHOUSE', 'COMPANY');

-- CreateEnum
CREATE TYPE "WarehouseType" AS ENUM ('EQUIPMENT', 'COMMS', 'AMMO', 'ARMORY');

-- CreateEnum
CREATE TYPE "TrackingMethod" AS ENUM ('QUANTITY', 'SERIAL', 'LOT', 'KIT');

-- CreateEnum
CREATE TYPE "TransferType" AS ENUM ('INTAKE', 'WRITE_OFF', 'ISSUE', 'RETURN', 'SIGNOUT', 'CHECKIN');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SignatureMethod" AS ENUM ('LINK', 'QR', 'ONSITE');

-- CreateEnum
CREATE TYPE "SignatureStatus" AS ENUM ('PENDING', 'SIGNED', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "CountType" AS ENUM ('WAREHOUSE', 'COMPANY', 'GLOBAL');

-- CreateEnum
CREATE TYPE "CountSessionStatus" AS ENUM ('DRAFT', 'FROZEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "DiscrepancyKind" AS ENUM ('LOSS', 'SURPLUS', 'STATUS_MISMATCH');

-- CreateEnum
CREATE TYPE "DiscrepancyStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "Battalion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "commander" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Battalion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "battalionId" TEXT,
    "holderId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holder" (
    "id" TEXT NOT NULL,
    "battalionId" TEXT NOT NULL,
    "kind" "HolderKind" NOT NULL,
    "warehouseType" "WarehouseType",
    "name" TEXT NOT NULL,
    "code" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseCompany" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "repUserId" TEXT,

    CONSTRAINT "WarehouseCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageLocation" (
    "id" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "column" TEXT NOT NULL,
    "row" TEXT NOT NULL,
    "label" TEXT,

    CONSTRAINT "StorageLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Soldier" (
    "id" TEXT NOT NULL,
    "battalionId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "personalNumber" TEXT NOT NULL,
    "phone" TEXT,
    "companyId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Soldier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "battalionId" TEXT NOT NULL,
    "warehouseType" "WarehouseType" NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemStatus" (
    "id" TEXT NOT NULL,
    "battalionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isLoss" BOOLEAN NOT NULL DEFAULT false,
    "isWear" BOOLEAN NOT NULL DEFAULT false,
    "isConsumed" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ItemStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountFrequency" (
    "id" TEXT NOT NULL,
    "battalionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "intervalDays" INTEGER NOT NULL DEFAULT 7,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CountFrequency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemType" (
    "id" TEXT NOT NULL,
    "battalionId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "trackingMethod" "TrackingMethod" NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'יח''',
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "trackLocation" BOOLEAN NOT NULL DEFAULT false,
    "imageData" TEXT,
    "homeLocationId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitComponent" (
    "id" TEXT NOT NULL,
    "kitItemTypeId" TEXT NOT NULL,
    "componentTypeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "KitComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBalance" (
    "id" TEXT NOT NULL,
    "battalionId" TEXT NOT NULL,
    "itemTypeId" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "locationId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerialUnit" (
    "id" TEXT NOT NULL,
    "battalionId" TEXT NOT NULL,
    "itemTypeId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "lotQuantity" INTEGER,
    "statusId" TEXT NOT NULL,
    "currentHolderId" TEXT,
    "signedSoldierId" TEXT,
    "physicalLocation" TEXT,
    "locationId" TEXT,
    "kitInstanceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SerialUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitInstance" (
    "id" TEXT NOT NULL,
    "battalionId" TEXT NOT NULL,
    "kitItemTypeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "currentHolderId" TEXT,
    "signedSoldierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KitInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitQtyLine" (
    "id" TEXT NOT NULL,
    "kitInstanceId" TEXT NOT NULL,
    "itemTypeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "present" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "KitQtyLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "battalionId" TEXT NOT NULL,
    "type" "TransferType" NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "fromHolderId" TEXT,
    "toHolderId" TEXT,
    "toSoldierId" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "pdfPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferLine" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "itemTypeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "serialUnitId" TEXT,
    "kitInstanceId" TEXT,
    "statusId" TEXT,

    CONSTRAINT "TransferLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signature" (
    "id" TEXT NOT NULL,
    "battalionId" TEXT NOT NULL,
    "soldierId" TEXT NOT NULL,
    "transferId" TEXT,
    "method" "SignatureMethod" NOT NULL,
    "status" "SignatureStatus" NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "tokenExpires" TIMESTAMP(3),
    "signatureData" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountDefinition" (
    "id" TEXT NOT NULL,
    "battalionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CountType" NOT NULL,
    "frequencyId" TEXT,
    "scopeHolderId" TEXT,
    "categoryIds" TEXT[],
    "daysOfWeek" INTEGER[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CountDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountSession" (
    "id" TEXT NOT NULL,
    "battalionId" TEXT NOT NULL,
    "definitionId" TEXT,
    "type" "CountType" NOT NULL,
    "status" "CountSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "startedById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CountSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountLine" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "itemTypeId" TEXT NOT NULL,
    "holderId" TEXT,
    "serialUnitId" TEXT,
    "expectedQty" INTEGER NOT NULL DEFAULT 0,
    "countedQty" INTEGER,
    "note" TEXT,

    CONSTRAINT "CountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discrepancy" (
    "id" TEXT NOT NULL,
    "battalionId" TEXT NOT NULL,
    "sessionId" TEXT,
    "itemTypeId" TEXT NOT NULL,
    "holderId" TEXT,
    "expectedQty" INTEGER NOT NULL,
    "countedQty" INTEGER NOT NULL,
    "diff" INTEGER NOT NULL,
    "kind" "DiscrepancyKind" NOT NULL,
    "status" "DiscrepancyStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Discrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "battalionId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Battalion_code_key" ON "Battalion"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_username_key" ON "AppUser"("username");

-- CreateIndex
CREATE INDEX "Holder_battalionId_idx" ON "Holder"("battalionId");

-- CreateIndex
CREATE INDEX "Holder_kind_idx" ON "Holder"("kind");

-- CreateIndex
CREATE INDEX "Holder_warehouseType_idx" ON "Holder"("warehouseType");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseCompany_warehouseId_companyId_key" ON "WarehouseCompany"("warehouseId", "companyId");

-- CreateIndex
CREATE INDEX "StorageLocation_holderId_idx" ON "StorageLocation"("holderId");

-- CreateIndex
CREATE UNIQUE INDEX "StorageLocation_holderId_column_row_key" ON "StorageLocation"("holderId", "column", "row");

-- CreateIndex
CREATE INDEX "Soldier_companyId_idx" ON "Soldier"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Soldier_battalionId_personalNumber_key" ON "Soldier"("battalionId", "personalNumber");

-- CreateIndex
CREATE INDEX "Category_battalionId_warehouseType_idx" ON "Category"("battalionId", "warehouseType");

-- CreateIndex
CREATE UNIQUE INDEX "Category_battalionId_name_key" ON "Category"("battalionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ItemStatus_battalionId_name_key" ON "ItemStatus"("battalionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CountFrequency_battalionId_name_key" ON "CountFrequency"("battalionId", "name");

-- CreateIndex
CREATE INDEX "ItemType_categoryId_idx" ON "ItemType"("categoryId");

-- CreateIndex
CREATE INDEX "ItemType_trackingMethod_idx" ON "ItemType"("trackingMethod");

-- CreateIndex
CREATE UNIQUE INDEX "ItemType_battalionId_sku_key" ON "ItemType"("battalionId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "KitComponent_kitItemTypeId_componentTypeId_key" ON "KitComponent"("kitItemTypeId", "componentTypeId");

-- CreateIndex
CREATE INDEX "StockBalance_battalionId_idx" ON "StockBalance"("battalionId");

-- CreateIndex
CREATE INDEX "StockBalance_holderId_idx" ON "StockBalance"("holderId");

-- CreateIndex
CREATE UNIQUE INDEX "StockBalance_itemTypeId_holderId_statusId_key" ON "StockBalance"("itemTypeId", "holderId", "statusId");

-- CreateIndex
CREATE INDEX "SerialUnit_battalionId_idx" ON "SerialUnit"("battalionId");

-- CreateIndex
CREATE INDEX "SerialUnit_currentHolderId_idx" ON "SerialUnit"("currentHolderId");

-- CreateIndex
CREATE INDEX "SerialUnit_signedSoldierId_idx" ON "SerialUnit"("signedSoldierId");

-- CreateIndex
CREATE UNIQUE INDEX "SerialUnit_itemTypeId_serialNumber_key" ON "SerialUnit"("itemTypeId", "serialNumber");

-- CreateIndex
CREATE INDEX "KitInstance_battalionId_idx" ON "KitInstance"("battalionId");

-- CreateIndex
CREATE INDEX "KitInstance_currentHolderId_idx" ON "KitInstance"("currentHolderId");

-- CreateIndex
CREATE INDEX "Transfer_battalionId_idx" ON "Transfer"("battalionId");

-- CreateIndex
CREATE INDEX "Transfer_status_idx" ON "Transfer"("status");

-- CreateIndex
CREATE INDEX "TransferLine_transferId_idx" ON "TransferLine"("transferId");

-- CreateIndex
CREATE UNIQUE INDEX "Signature_token_key" ON "Signature"("token");

-- CreateIndex
CREATE INDEX "Signature_battalionId_idx" ON "Signature"("battalionId");

-- CreateIndex
CREATE INDEX "Signature_status_idx" ON "Signature"("status");

-- CreateIndex
CREATE INDEX "CountSession_battalionId_idx" ON "CountSession"("battalionId");

-- CreateIndex
CREATE INDEX "CountLine_sessionId_idx" ON "CountLine"("sessionId");

-- CreateIndex
CREATE INDEX "Discrepancy_battalionId_idx" ON "Discrepancy"("battalionId");

-- CreateIndex
CREATE INDEX "Discrepancy_status_idx" ON "Discrepancy"("status");

-- CreateIndex
CREATE INDEX "AuditLog_battalionId_idx" ON "AuditLog"("battalionId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "Holder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holder" ADD CONSTRAINT "Holder_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseCompany" ADD CONSTRAINT "WarehouseCompany_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Holder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseCompany" ADD CONSTRAINT "WarehouseCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Holder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseCompany" ADD CONSTRAINT "WarehouseCompany_repUserId_fkey" FOREIGN KEY ("repUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageLocation" ADD CONSTRAINT "StorageLocation_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "Holder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Soldier" ADD CONSTRAINT "Soldier_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Soldier" ADD CONSTRAINT "Soldier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Holder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemStatus" ADD CONSTRAINT "ItemStatus_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountFrequency" ADD CONSTRAINT "CountFrequency_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemType" ADD CONSTRAINT "ItemType_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemType" ADD CONSTRAINT "ItemType_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemType" ADD CONSTRAINT "ItemType_homeLocationId_fkey" FOREIGN KEY ("homeLocationId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitComponent" ADD CONSTRAINT "KitComponent_kitItemTypeId_fkey" FOREIGN KEY ("kitItemTypeId") REFERENCES "ItemType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitComponent" ADD CONSTRAINT "KitComponent_componentTypeId_fkey" FOREIGN KEY ("componentTypeId") REFERENCES "ItemType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "ItemType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "Holder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "ItemStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialUnit" ADD CONSTRAINT "SerialUnit_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialUnit" ADD CONSTRAINT "SerialUnit_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "ItemType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialUnit" ADD CONSTRAINT "SerialUnit_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "ItemStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialUnit" ADD CONSTRAINT "SerialUnit_currentHolderId_fkey" FOREIGN KEY ("currentHolderId") REFERENCES "Holder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialUnit" ADD CONSTRAINT "SerialUnit_signedSoldierId_fkey" FOREIGN KEY ("signedSoldierId") REFERENCES "Soldier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialUnit" ADD CONSTRAINT "SerialUnit_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerialUnit" ADD CONSTRAINT "SerialUnit_kitInstanceId_fkey" FOREIGN KEY ("kitInstanceId") REFERENCES "KitInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitInstance" ADD CONSTRAINT "KitInstance_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitInstance" ADD CONSTRAINT "KitInstance_kitItemTypeId_fkey" FOREIGN KEY ("kitItemTypeId") REFERENCES "ItemType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitInstance" ADD CONSTRAINT "KitInstance_currentHolderId_fkey" FOREIGN KEY ("currentHolderId") REFERENCES "Holder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitInstance" ADD CONSTRAINT "KitInstance_signedSoldierId_fkey" FOREIGN KEY ("signedSoldierId") REFERENCES "Soldier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitQtyLine" ADD CONSTRAINT "KitQtyLine_kitInstanceId_fkey" FOREIGN KEY ("kitInstanceId") REFERENCES "KitInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromHolderId_fkey" FOREIGN KEY ("fromHolderId") REFERENCES "Holder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toHolderId_fkey" FOREIGN KEY ("toHolderId") REFERENCES "Holder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toSoldierId_fkey" FOREIGN KEY ("toSoldierId") REFERENCES "Soldier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLine" ADD CONSTRAINT "TransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLine" ADD CONSTRAINT "TransferLine_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "ItemType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLine" ADD CONSTRAINT "TransferLine_serialUnitId_fkey" FOREIGN KEY ("serialUnitId") REFERENCES "SerialUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLine" ADD CONSTRAINT "TransferLine_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "ItemStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_soldierId_fkey" FOREIGN KEY ("soldierId") REFERENCES "Soldier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountDefinition" ADD CONSTRAINT "CountDefinition_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountDefinition" ADD CONSTRAINT "CountDefinition_frequencyId_fkey" FOREIGN KEY ("frequencyId") REFERENCES "CountFrequency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountDefinition" ADD CONSTRAINT "CountDefinition_scopeHolderId_fkey" FOREIGN KEY ("scopeHolderId") REFERENCES "Holder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountSession" ADD CONSTRAINT "CountSession_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountSession" ADD CONSTRAINT "CountSession_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CountDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountSession" ADD CONSTRAINT "CountSession_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountLine" ADD CONSTRAINT "CountLine_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CountSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountLine" ADD CONSTRAINT "CountLine_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "ItemType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountLine" ADD CONSTRAINT "CountLine_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "Holder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountLine" ADD CONSTRAINT "CountLine_serialUnitId_fkey" FOREIGN KEY ("serialUnitId") REFERENCES "SerialUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CountSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "ItemType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "Holder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
