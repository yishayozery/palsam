CREATE TYPE "SignMode" AS ENUM ('COMPANY', 'SOLDIER');
ALTER TABLE "ItemType" ADD COLUMN "signMode" "SignMode" NOT NULL DEFAULT 'COMPANY';
-- ברירת מחדל הגיונית: נשק/תקשוב רגישים → חייל ישיר
UPDATE "ItemType" SET "signMode" = 'SOLDIER' WHERE "isSensitive" = true;
