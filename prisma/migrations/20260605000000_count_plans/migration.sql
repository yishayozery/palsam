-- Enum חדש
DO $$ BEGIN
  CREATE TYPE "CountTaskStatus" AS ENUM ('SCHEDULED', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CountPlan
CREATE TABLE "CountPlan" (
  "id" TEXT NOT NULL,
  "battalionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "scopeHolderIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "scopeCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "scopeItemTypeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "trackingMethods" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "frequencyDays" INTEGER NOT NULL DEFAULT 1,
  "scheduledTimes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  "graceMinutes" INTEGER NOT NULL DEFAULT 60,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CountPlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CountPlan_battalionId_idx" ON "CountPlan"("battalionId");
ALTER TABLE "CountPlan" ADD CONSTRAINT "CountPlan_battalionId_fkey"
  FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CountPlan" ADD CONSTRAINT "CountPlan_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CountTask
CREATE TABLE "CountTask" (
  "id" TEXT NOT NULL,
  "battalionId" TEXT NOT NULL,
  "planId" TEXT,
  "holderId" TEXT NOT NULL,
  "assignedUserId" TEXT,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "status" "CountTaskStatus" NOT NULL DEFAULT 'PENDING',
  "shareToken" TEXT NOT NULL,
  "sessionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CountTask_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CountTask_shareToken_key" ON "CountTask"("shareToken");
CREATE UNIQUE INDEX "CountTask_sessionId_key" ON "CountTask"("sessionId");
CREATE INDEX "CountTask_battalionId_status_idx" ON "CountTask"("battalionId", "status");
CREATE INDEX "CountTask_assignedUserId_status_idx" ON "CountTask"("assignedUserId", "status");
ALTER TABLE "CountTask" ADD CONSTRAINT "CountTask_battalionId_fkey"
  FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CountTask" ADD CONSTRAINT "CountTask_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "CountPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CountTask" ADD CONSTRAINT "CountTask_holderId_fkey"
  FOREIGN KEY ("holderId") REFERENCES "Holder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CountTask" ADD CONSTRAINT "CountTask_assignedUserId_fkey"
  FOREIGN KEY ("assignedUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CountTask" ADD CONSTRAINT "CountTask_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "CountSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
