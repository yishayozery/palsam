-- ItemAssociation enum
CREATE TYPE "ItemAssociation" AS ENUM ('MILITARY', 'DONATION_COMPANY', 'DONATION_BATTALION');
-- ItemType: sku optional + association
ALTER TABLE "ItemType" ALTER COLUMN "sku" DROP NOT NULL;
ALTER TABLE "ItemType" ADD COLUMN "association" "ItemAssociation" NOT NULL DEFAULT 'MILITARY';
-- backfill association from isDonated (existing donations -> battalion-level by default; company if ownerHolder is a company)
UPDATE "ItemType" SET "association" = 'DONATION_BATTALION' WHERE "isDonated" = true;
