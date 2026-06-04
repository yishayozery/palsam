CREATE TABLE "CustomRole" (
  "id" TEXT NOT NULL,
  "battalionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "template" "Role" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomRole_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomRole_battalionId_name_key" ON "CustomRole"("battalionId", "name");
ALTER TABLE "CustomRole" ADD CONSTRAINT "CustomRole_battalionId_fkey" FOREIGN KEY ("battalionId") REFERENCES "Battalion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppUser" ADD COLUMN "customRoleId" TEXT;
ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "CustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
