-- Drop old unique constraint
ALTER TABLE "StockBalance" DROP CONSTRAINT IF EXISTS "StockBalance_itemTypeId_holderId_statusId_key";

-- Add new unique with equipmentLocationId, NULLS NOT DISTINCT (Postgres 15+)
-- כדי שלא יוכלו להיות שתי שורות עם NULL location לאותה צמצמדת (item, holder, status)
ALTER TABLE "StockBalance"
  ADD CONSTRAINT "StockBalance_itemTypeId_holderId_statusId_equipmentLocationId_key"
  UNIQUE NULLS NOT DISTINCT ("itemTypeId", "holderId", "statusId", "equipmentLocationId");
