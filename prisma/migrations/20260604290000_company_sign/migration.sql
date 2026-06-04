-- Transfer: toUserId
ALTER TABLE "Transfer" ADD COLUMN "toUserId" TEXT;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Signature: soldier becomes optional, add signerUserId
ALTER TABLE "Signature" ALTER COLUMN "soldierId" DROP NOT NULL;
ALTER TABLE "Signature" ADD COLUMN "signerUserId" TEXT;
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_signerUserId_fkey" FOREIGN KEY ("signerUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
