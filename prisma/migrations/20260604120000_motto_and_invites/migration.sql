-- Battalion motto
ALTER TABLE "Battalion" ADD COLUMN "motto" TEXT;
-- AppUser onboarding fields
ALTER TABLE "AppUser" ADD COLUMN "phone" TEXT;
ALTER TABLE "AppUser" ADD COLUMN "passwordSet" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AppUser" ADD COLUMN "inviteToken" TEXT;
CREATE UNIQUE INDEX "AppUser_inviteToken_key" ON "AppUser"("inviteToken");
