-- AlterTable: add callupClosedAt + squadId to Soldier (IF NOT EXISTS for idempotency after db push)
ALTER TABLE "Soldier" ADD COLUMN IF NOT EXISTS "callupClosedAt" TIMESTAMP(3);
ALTER TABLE "Soldier" ADD COLUMN IF NOT EXISTS "squadId" TEXT;

-- CreateTable: Squad
CREATE TABLE "Squad" (
    "id" TEXT NOT NULL,
    "battalionId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Squad_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AttendanceStatus
CREATE TABLE "AttendanceStatus" (
    "id" TEXT NOT NULL,
    "battalionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#10b981',
    "icon" TEXT,
    "isPresent" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AttendancePlan
CREATE TABLE "AttendancePlan" (
    "id" TEXT NOT NULL,
    "soldierId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "statusId" TEXT NOT NULL,
    "note" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendancePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AttendanceRecord
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "soldierId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "statusId" TEXT NOT NULL,
    "note" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Squad_companyId_name_key" ON "Squad"("companyId", "name");
CREATE INDEX "Squad_battalionId_idx" ON "Squad"("battalionId");
CREATE INDEX "Squad_companyId_idx" ON "Squad"("companyId");

CREATE UNIQUE INDEX "AttendanceStatus_battalionId_name_key" ON "AttendanceStatus"("battalionId", "name");
CREATE INDEX "AttendanceStatus_battalionId_idx" ON "AttendanceStatus"("battalionId");

CREATE UNIQUE INDEX "AttendancePlan_soldierId_date_key" ON "AttendancePlan"("soldierId", "date");
CREATE INDEX "AttendancePlan_soldierId_idx" ON "AttendancePlan"("soldierId");
CREATE INDEX "AttendancePlan_date_idx" ON "AttendancePlan"("date");

CREATE UNIQUE INDEX "AttendanceRecord_soldierId_date_key" ON "AttendanceRecord"("soldierId", "date");
CREATE INDEX "AttendanceRecord_soldierId_idx" ON "AttendanceRecord"("soldierId");
CREATE INDEX "AttendanceRecord_date_idx" ON "AttendanceRecord"("date");

CREATE INDEX "Soldier_squadId_idx" ON "Soldier"("squadId");

-- AddForeignKey
ALTER TABLE "Soldier" ADD CONSTRAINT "Soldier_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Squad" ADD CONSTRAINT "Squad_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Squad" ADD CONSTRAINT "Squad_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Holder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AttendanceStatus" ADD CONSTRAINT "AttendanceStatus_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AttendancePlan" ADD CONSTRAINT "AttendancePlan_soldierId_fkey" FOREIGN KEY ("soldierId") REFERENCES "Soldier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendancePlan" ADD CONSTRAINT "AttendancePlan_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "AttendanceStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_soldierId_fkey" FOREIGN KEY ("soldierId") REFERENCES "Soldier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "AttendanceStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
