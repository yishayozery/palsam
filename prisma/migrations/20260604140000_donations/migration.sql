-- ItemType: category optional + donation fields
ALTER TABLE "ItemType" ALTER COLUMN "categoryId" DROP NOT NULL;
ALTER TABLE "ItemType" ADD COLUMN "isDonated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ItemType" ADD COLUMN "signable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ItemType" ADD COLUMN "ownerHolderId" TEXT;
ALTER TABLE "ItemType" ADD CONSTRAINT "ItemType_ownerHolderId_fkey" FOREIGN KEY ("ownerHolderId") REFERENCES "Holder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
