-- Soldier roster: enlisted approval flow + first/last name
ALTER TABLE "Soldier" ADD COLUMN "firstName" TEXT;
ALTER TABLE "Soldier" ADD COLUMN "lastName" TEXT;
ALTER TABLE "Soldier" ADD COLUMN "enlisted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Soldier" ADD COLUMN "enlistedAt" TIMESTAMP(3);
ALTER TABLE "Soldier" ADD COLUMN "enlistedById" TEXT;

-- חיילים קיימים → enlisted=true כברירת מחדל (תאימות לאחור)
UPDATE "Soldier" SET "enlisted" = true WHERE "active" = true;
