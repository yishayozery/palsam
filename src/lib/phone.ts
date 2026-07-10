/**
 * נורמליזציה של מספר טלפון ישראלי ל-9 ספרות אחרונות (הצורה 5XXXXXXXX),
 * כדי להשוות בין פורמטים שונים: "054-9164421", "0549164421", "972549164421", "+972...".
 * מחזיר null אם לא ניתן לנרמל.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (d.startsWith("972")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return d.length >= 9 ? d.slice(-9) : (d.length === 8 ? d : null);
}

/** האם שני מספרים תואמים (אחרי נורמליזציה). */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePhone(a), nb = normalizePhone(b);
  return !!na && !!nb && na === nb;
}
