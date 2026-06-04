-- Battalion: לחיוב מספר אישי במסירה
ALTER TABLE "Battalion" ADD COLUMN "requirePersonalIdOnHandover" BOOLEAN NOT NULL DEFAULT false;

-- Transfer: מספר אישי של מקבל המסירה
ALTER TABLE "Transfer" ADD COLUMN "recipientPersonalId" TEXT;

-- Signature: מספר אישי של החותם
ALTER TABLE "Signature" ADD COLUMN "signerPersonalId" TEXT;
