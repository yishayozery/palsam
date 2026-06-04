CREATE TABLE "UserHolder" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "holderId" TEXT NOT NULL,
  CONSTRAINT "UserHolder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserHolder_userId_holderId_key" ON "UserHolder"("userId", "holderId");
ALTER TABLE "UserHolder" ADD CONSTRAINT "UserHolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserHolder" ADD CONSTRAINT "UserHolder_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "Holder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
