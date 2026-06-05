-- אחראי ספירה לתכנית — רואה סטטוס כל המשימות ומייצא דוח
ALTER TABLE "CountPlan" ADD COLUMN "responsibleUserId" TEXT;
ALTER TABLE "CountPlan" ADD CONSTRAINT "CountPlan_responsibleUserId_fkey"
  FOREIGN KEY ("responsibleUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
