import { put } from "@vercel/blob";

// שרת בלבד — דורש BLOB_READ_WRITE_TOKEN (Vercel → Storage → Blob).
// אחסון תמונות דיווחי-תאונה מחוץ ל-DB (ה-DB המשותף נשאר קל).
if (typeof window !== "undefined") throw new Error("blob.ts is server-only");

/** האם אחסון ה-Blob מוגדר (יש token). מאפשר כשל ידידותי אם ה-Store לא נוצר עדיין. */
export function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/**
 * מעלה תמונת דיווח-תאונה ל-Vercel Blob ומחזיר URL ציבורי (עם suffix אקראי — לא נחיז).
 * @param reportId מזהה הדיווח (לתיקיית ארגון)
 * @param kind סוג התמונה (ל-שם הקובץ)
 * @param body תוכן הקובץ (Buffer / Uint8Array / Blob)
 * @param contentType MIME (ברירת מחדל image/jpeg)
 */
export async function uploadAccidentPhoto(
  reportId: string,
  kind: string,
  body: Buffer | Blob,
  contentType = "image/jpeg",
): Promise<string> {
  if (!isBlobConfigured()) throw new Error("BLOB_READ_WRITE_TOKEN לא מוגדר — צור Blob Store ב-Vercel → Storage");
  const ext = contentType.includes("png") ? "png" : "jpg";
  const { url } = await put(`accidents/${reportId}/${kind}.${ext}`, body, {
    access: "public",
    contentType,
    addRandomSuffix: true, // URL בלתי-נחיז — הגנה בסיסית על מסמכים רגישים (רישיונות)
  });
  return url;
}
