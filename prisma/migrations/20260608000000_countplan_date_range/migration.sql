-- טווח תאריכים לתכנית ספירה (אופציונלי)
ALTER TABLE "CountPlan" ADD COLUMN "startDate" TIMESTAMP(3);
ALTER TABLE "CountPlan" ADD COLUMN "endDate" TIMESTAMP(3);
