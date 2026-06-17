-- AlterTable: add notificationEmails to Holder
ALTER TABLE "Holder" ADD COLUMN IF NOT EXISTS "notificationEmails" TEXT;

-- AlterTable: add emailToBattalion to Battalion
ALTER TABLE "Battalion" ADD COLUMN IF NOT EXISTS "emailToBattalion" BOOLEAN NOT NULL DEFAULT true;
