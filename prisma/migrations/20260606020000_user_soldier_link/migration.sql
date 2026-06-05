-- קישור משתמש למערכת ↔ חייל ברוסטר
ALTER TABLE "AppUser" ADD COLUMN "soldierId" TEXT;
CREATE UNIQUE INDEX "AppUser_soldierId_key" ON "AppUser"("soldierId");
ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_soldierId_fkey"
  FOREIGN KEY ("soldierId") REFERENCES "Soldier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
