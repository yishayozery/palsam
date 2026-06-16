import "server-only";
import { prisma } from "./prisma";

/**
 * שליחת אימייל דרך Resend HTTP API.
 * דורש env var: RESEND_API_KEY + EMAIL_FROM (לדוגמה: "PALSAM <noreply@palsam.app>")
 * עוקפת בשקט אם החסרים מוגדרים (לא שוברת פעולות עסקיות).
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "PALSAM <onboarding@resend.dev>";
  if (!apiKey) return { ok: false, error: "missing RESEND_API_KEY" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: opts.to, subject: opts.subject,
        text: opts.text,
        ...(opts.html ? { html: opts.html } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch error" };
  }
}

/** רשימת אקשנים מבצעיים שמעניינים גיבוי-מייל (לא login וכו') */
const NOTIFY_ACTIONS = new Set([
  "CREATE", "UPDATE", "DELETE",
  "INTAKE", "ISSUE", "RETURN", "SIGNOUT", "CHECKIN",
  "COMPANY_SIGN_OUT", "COMPANY_SIGN", "COMPANY_RETURN",
  "SEND_TO_TANA", "RETURN_FROM_TANA",
  "MISSION_COMPLETE", "MISSION_REOPEN",
  "SET_BASELINE", "SET_BASELINES_BULK",
  "MOVE_STOCK_LOCATION", "UPDATE_LOCATION",
]);

const NOTIFY_ENTITIES = new Set([
  "Transfer", "TransferLine", "Signature", "SerialUnit",
  "VehicleAssignment", "CompanyItemBaseline", "StockBalance",
  "SoldierItemLocation",
]);

/**
 * בדיקה אם פעולה דורשת התראה במייל.
 * נקרא מ-audit() אוטומטית.
 */
export function shouldNotifyEmail(action: string, entity: string): boolean {
  return NOTIFY_ACTIONS.has(action) && NOTIFY_ENTITIES.has(entity);
}

/** שליחת התראה מבצעית למייל הגדוד - לא חוסמת אם נכשלת. */
export async function notifyTransactionEmail(params: {
  battalionId: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: unknown;
}): Promise<void> {
  try {
    const battalion = await prisma.battalion.findUnique({
      where: { id: params.battalionId },
      select: { name: true, code: true, notificationEmail: true },
    });
    if (!battalion?.notificationEmail) return;

    const user = params.userId ? await prisma.appUser.findUnique({
      where: { id: params.userId }, select: { fullName: true, title: true },
    }) : null;

    const ts = new Date().toISOString();
    const dateStr = new Date().toLocaleString("he-IL", { dateStyle: "short", timeStyle: "medium" });
    const subject = `[${battalion.code}] ${params.action} ${params.entity} — ${dateStr}`;
    const detailsJson = JSON.stringify(params.details ?? {}, null, 2);
    const text = [
      `📋 PALSAM - ${battalion.name} (${battalion.code})`,
      ``,
      `פעולה: ${params.action}`,
      `ישות: ${params.entity}${params.entityId ? ` (${params.entityId})` : ""}`,
      `משתמש: ${user ? `${user.fullName}${user.title ? ` - ${user.title}` : ""}` : "מערכת"}`,
      `זמן: ${dateStr}`,
      ``,
      `--- פרטים ---`,
      detailsJson,
      ``,
      `--- meta ---`,
      `timestamp: ${ts}`,
      `entityId: ${params.entityId ?? "n/a"}`,
    ].join("\n");

    // לא ממתינים - לא חוסם פעולה עסקית
    void sendEmail({ to: battalion.notificationEmail, subject, text });
  } catch {
    // לא מפיל שום פעולה אם המייל נכשל
  }
}
