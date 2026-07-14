import { prisma } from "@/lib/prisma";
import type { RequestType, RequestFieldType } from "@/generated/prisma";

type FieldDef = { fieldKey: string; label: string; fieldType: RequestFieldType; options?: string[]; required?: boolean };
type TypeSpec = { requiresApproval: boolean; requester: FieldDef[]; handler: FieldDef[] };

/** מפרט ברירת-מחדל פר-סוג (מהמפרט של המשתמש). SELECT ניתן לעריכה בהגדרות המלכ"א. */
export const DEFAULT_REQUEST_SPEC: Partial<Record<RequestType, TypeSpec>> = {
  FUEL: {
    requiresApproval: false,
    requester: [
      { fieldKey: "liters", label: "כמות ליטרים", fieldType: "NUMBER", required: true },
      { fieldKey: "vehicle", label: "רכב", fieldType: "SELECT", options: [] },
      { fieldKey: "location", label: "מיקום", fieldType: "TEXT" },
      { fieldKey: "contact", label: "איש קשר", fieldType: "CONTACT" },
    ],
    handler: [
      { fieldKey: "approved", label: "אישור", fieldType: "SELECT", options: ["מאושר", "לא מאושר"] },
      { fieldKey: "fuelLocation", label: "מיקום תדלוק", fieldType: "TEXT" },
      { fieldKey: "time", label: "שעה", fieldType: "TIME" },
      { fieldKey: "contact", label: "איש קשר", fieldType: "CONTACT" },
    ],
  },
  CONSTRUCTION: {
    requiresApproval: true,
    requester: [
      { fieldKey: "faultType", label: "סוג תקלה", fieldType: "SELECT", options: ["חשמל", "אינסטלציה", "מבנה", "מיזוג", "אחר"], required: true },
      { fieldKey: "location", label: "מיקום", fieldType: "TEXT", required: true },
      { fieldKey: "urgency", label: "דחיפות", fieldType: "SELECT", options: ["רגיל", "דחוף", "מבצעי"] },
      { fieldKey: "contacts", label: "אנשי קשר", fieldType: "TEXT" },
    ],
    handler: [
      { fieldKey: "approved", label: "אישור", fieldType: "SELECT", options: ["מאושר", "לא מאושר"] },
      { fieldKey: "handlingEntity", label: "גורם מטפל", fieldType: "SELECT", options: ["קבלן", "משיכת ציוד + טיפול עצמאי", "אחר"] },
    ],
  },
  TRANSPORT: {
    requiresApproval: false,
    requester: [
      { fieldKey: "transportType", label: "סוג הובלה", fieldType: "SELECT", options: ["משאית", "אוטובוס", "מוביל רכב", "מוביל מכולה"], required: true },
      { fieldKey: "vehicleCount", label: "כמות רכבים", fieldType: "NUMBER" },
      { fieldKey: "vehicleType", label: "סוג הרכב", fieldType: "TEXT" },
      { fieldKey: "date", label: "תאריך", fieldType: "DATE" },
      { fieldKey: "from", label: "ממקום", fieldType: "TEXT" },
      { fieldKey: "to", label: "למקום", fieldType: "TEXT" },
      { fieldKey: "contact", label: "איש קשר", fieldType: "CONTACT" },
      { fieldKey: "loaderContact", label: "איש קשר מעמיס", fieldType: "CONTACT" },
      { fieldKey: "unloaderContact", label: "איש קשר פורק", fieldType: "CONTACT" },
    ],
    handler: [
      { fieldKey: "date", label: "תאריך", fieldType: "DATE" },
      { fieldKey: "time", label: "שעה", fieldType: "TIME" },
      { fieldKey: "driverName", label: "שם נהג", fieldType: "TEXT" },
      { fieldKey: "driverPhone", label: "טלפון נהג", fieldType: "TEXT" },
      { fieldKey: "reference", label: "אסמכתא", fieldType: "TEXT" },
      { fieldKey: "transportType", label: "עדכון סוג הובלה", fieldType: "SELECT", options: ["משאית", "אוטובוס", "מוביל רכב", "מוביל מכולה"] },
    ],
  },
  SUPPLY: {
    requiresApproval: true,
    requester: [
      { fieldKey: "equipmentType", label: "סוג ציוד", fieldType: "SELECT", options: ["ציוד אישי", "ציוד קשר", "ציוד מטבח", "אחר"], required: true },
      { fieldKey: "requestKind", label: "סוג בקשה", fieldType: "SELECT", options: ["החלפה", "אספקה"] },
      { fieldKey: "quantity", label: "כמות", fieldType: "NUMBER" },
      { fieldKey: "product", label: "מוצר", fieldType: "TEXT" },
    ],
    handler: [
      { fieldKey: "approved", label: "אישור", fieldType: "SELECT", options: ["מאושר", "לא מאושר", "בטיפול"] },
      { fieldKey: "status", label: "סטטוס", fieldType: "TEXT" },
      { fieldKey: "eta", label: "צפי אספקה", fieldType: "TEXT" },
      { fieldKey: "pickupLocation", label: "מיקום איסוף", fieldType: "TEXT" },
      { fieldKey: "contact", label: "איש קשר", fieldType: "CONTACT" },
    ],
  },
};
// רפואה — זהה להספקה (בנפרד)
DEFAULT_REQUEST_SPEC.MEDICAL = DEFAULT_REQUEST_SPEC.SUPPLY;

/** זריעת הגדרות ברירת-מחדל (שדות + דגלי אישור) לחטיבה אם עדיין ריקות. idempotent. */
export async function ensureRequestDefaults(brigadeUnitId: string): Promise<void> {
  const existing = await prisma.requestFieldDef.count({ where: { brigadeUnitId } });
  if (existing > 0) return;
  for (const [type, spec] of Object.entries(DEFAULT_REQUEST_SPEC) as [RequestType, TypeSpec][]) {
    await prisma.requestTypeConfig.upsert({
      where: { brigadeUnitId_type: { brigadeUnitId, type } },
      update: {}, create: { brigadeUnitId, type, requiresApproval: spec.requiresApproval },
    });
    const rows = [
      ...spec.requester.map((f, i) => ({ ...f, side: "REQUESTER" as const, sortOrder: i })),
      ...spec.handler.map((f, i) => ({ ...f, side: "HANDLER" as const, sortOrder: i })),
    ];
    await prisma.requestFieldDef.createMany({
      data: rows.map((f) => ({ brigadeUnitId, type, side: f.side, fieldKey: f.fieldKey, label: f.label, fieldType: f.fieldType, options: f.options ?? [], required: f.required ?? false, sortOrder: f.sortOrder })),
    });
  }
}
