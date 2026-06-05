-- AppUser.title: תואר חופשי
ALTER TABLE "AppUser" ADD COLUMN "title" TEXT;

-- Soldier.secondaryHolderId: שיוך משני (מחסן בנוסף לפלוגה)
ALTER TABLE "Soldier" ADD COLUMN "secondaryHolderId" TEXT;
CREATE INDEX "Soldier_secondaryHolderId_idx" ON "Soldier"("secondaryHolderId");
ALTER TABLE "Soldier" ADD CONSTRAINT "Soldier_secondaryHolderId_fkey"
  FOREIGN KEY ("secondaryHolderId") REFERENCES "Holder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
