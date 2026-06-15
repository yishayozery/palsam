-- CreateTable
CREATE TABLE "VehicleAssignment" (
    "id" TEXT NOT NULL,
    "battalionId" TEXT NOT NULL,
    "companyId" TEXT,
    "vehicleSerialUnitId" TEXT NOT NULL,
    "missionDate" TIMESTAMP(3) NOT NULL,
    "departureTime" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "VehicleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleAssignmentSoldier" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "soldierId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleAssignmentSoldier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehicleAssignment_battalionId_missionDate_idx" ON "VehicleAssignment"("battalionId", "missionDate");

-- CreateIndex
CREATE INDEX "VehicleAssignment_vehicleSerialUnitId_idx" ON "VehicleAssignment"("vehicleSerialUnitId");

-- CreateIndex
CREATE INDEX "VehicleAssignmentSoldier_soldierId_idx" ON "VehicleAssignmentSoldier"("soldierId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleAssignmentSoldier_assignmentId_soldierId_key" ON "VehicleAssignmentSoldier"("assignmentId", "soldierId");

-- AddForeignKey
ALTER TABLE "VehicleAssignment" ADD CONSTRAINT "VehicleAssignment_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleAssignment" ADD CONSTRAINT "VehicleAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Holder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleAssignment" ADD CONSTRAINT "VehicleAssignment_vehicleSerialUnitId_fkey" FOREIGN KEY ("vehicleSerialUnitId") REFERENCES "SerialUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleAssignment" ADD CONSTRAINT "VehicleAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleAssignmentSoldier" ADD CONSTRAINT "VehicleAssignmentSoldier_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "VehicleAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleAssignmentSoldier" ADD CONSTRAINT "VehicleAssignmentSoldier_soldierId_fkey" FOREIGN KEY ("soldierId") REFERENCES "Soldier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
