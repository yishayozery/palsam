import "server-only";
import { prisma } from "./prisma";
import { buildTransferAttachments } from "./email-attachments";

/**
 * שליחת אימייל דרך Resend HTTP API.
 * דורש env var: RESEND_API_KEY + EMAIL_FROM (לדוגמה: "PALMY <noreply@palmy.co.il>")
 * עוקפת בשקט אם החסרים מוגדרים (לא שוברת פעולות עסקיות).
 */
export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  from?: string;
  replyTo?: string;
  attachments?: { filename: string; content: string }[];
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = opts.from || process.env.EMAIL_FROM || "PALMY <office@palmy.co.il>";
  if (!apiKey) return { ok: false, error: "missing RESEND_API_KEY" };

  const recipients = Array.isArray(opts.to) ? opts.to : [opts.to];
  if (recipients.length === 0) return { ok: true };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: recipients, subject: opts.subject,
        text: opts.text,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        ...(opts.html ? { html: opts.html } : {}),
        ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
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

/** רשימת אקשנים — מייל רק על תנועות מלאי (Transfer / Signature) */
const NOTIFY_ACTIONS = new Set([
  "CREATE", "UPDATE", "DELETE",
  "INTAKE", "ISSUE", "RETURN", "SIGNOUT", "CHECKIN", "CHECKIN_QTY",
  "SIGN", "CANCEL_SIGNATURE",
  "COMPANY_SIGN_OUT", "COMPANY_SIGN", "COMPANY_RETURN",
]);

const NOTIFY_ENTITIES = new Set([
  "Transfer", "TransferLine", "Signature",
]);

/**
 * בדיקה אם פעולה דורשת התראה במייל.
 * נקרא מ-audit() אוטומטית.
 */
export function shouldNotifyEmail(action: string, entity: string): boolean {
  return NOTIFY_ACTIONS.has(action) && NOTIFY_ENTITIES.has(entity);
}

/** פירוק שדה notificationEmails מופרד בפסיקים לרשימה */
function parseEmails(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((e) => e.trim()).filter((e) => e.includes("@"));
}

/** שליחת התראה מבצעית — למחסן/פלוגה הרלוונטיים + לגדוד אם מוגדר. */
export async function notifyTransactionEmail(params: {
  battalionId: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: unknown;
  holderId?: string | null;
}): Promise<void> {
  try {
    const battalion = await prisma.battalion.findUnique({
      where: { id: params.battalionId },
      select: { name: true, code: true, senderEmail: true, notificationEmail: true, emailToBattalion: true },
    });
    if (!battalion) return;

    const user = params.userId ? await prisma.appUser.findUnique({
      where: { id: params.userId }, select: { fullName: true, title: true },
    }) : null;

    const dateStr = new Date().toLocaleString("he-IL", { dateStyle: "short", timeStyle: "medium" });
    const subject = `[${battalion.code}] ${params.action} ${params.entity} — ${dateStr}`;
    const detailsJson = JSON.stringify(params.details ?? {}, null, 2);
    const text = [
      `📋 PALMY - ${battalion.name} (${battalion.code})`,
      ``,
      `פעולה: ${params.action}`,
      `ישות: ${params.entity}${params.entityId ? ` (${params.entityId})` : ""}`,
      `משתמש: ${user ? `${user.fullName}${user.title ? ` - ${user.title}` : ""}` : "מערכת"}`,
      `זמן: ${dateStr}`,
      ``,
      `--- פרטים ---`,
      detailsJson,
    ].join("\n");

    // אסוף את כל הנמענים
    const allRecipients = new Set<string>();

    // 1. מייל הגדוד (אם emailToBattalion פעיל)
    if (battalion.emailToBattalion && battalion.notificationEmail) {
      allRecipients.add(battalion.notificationEmail);
    }

    // 2. מיילים של המחסן/פלוגה המעורבים
    if (params.holderId) {
      const holder = await prisma.holder.findUnique({
        where: { id: params.holderId },
        select: { notificationEmails: true },
      });
      for (const email of parseEmails(holder?.notificationEmails)) {
        allRecipients.add(email);
      }
    }

    // 3. אם יש entityId שמצביע על Transfer — שלח גם ל-from/to holders
    if (params.entity === "Transfer" || params.entity === "Signature") {
      const holderIds = await resolveHolderIds(params.entity, params.entityId);
      if (holderIds.length > 0) {
        const holders = await prisma.holder.findMany({
          where: { id: { in: holderIds } },
          select: { notificationEmails: true },
        });
        for (const h of holders) {
          for (const email of parseEmails(h.notificationEmails)) {
            allRecipients.add(email);
          }
        }
      }
    }

    if (allRecipients.size === 0) return;

    const replyTo = battalion.notificationEmail || undefined;
    const senderFrom = battalion.senderEmail ? `${battalion.name} <${battalion.senderEmail}>` : undefined;

    const recipients = [...allRecipients];
    const logResult = (r: { ok: boolean; error?: string }) => {
      if (r.ok) console.log(`[email] ✅ נשלח ל-${recipients.join(", ")} (${params.action} ${params.entity})`);
      else console.error(`[email] ❌ כשל לשליחה ל-${recipients.join(", ")}: ${r.error}`);
    };

    const transferId = await resolveTransferId(params.entity, params.entityId);
    if (transferId) {
      const rich = await buildTransferAttachments(transferId).catch(() => null);
      if (rich) {
        logResult(await sendEmail({
          to: recipients, subject: rich.subject,
          text, from: senderFrom, replyTo,
          html: rich.html,
          attachments: rich.attachments,
        }));
        return;
      }
    }

    logResult(await sendEmail({ to: recipients, subject, text, from: senderFrom, replyTo }));
  } catch {
    // לא מפיל שום פעולה אם המייל נכשל
  }
}

async function resolveTransferId(entity: string, entityId: string | null | undefined): Promise<string | null> {
  if (!entityId) return null;
  if (entity === "Transfer") return entityId;
  if (entity === "Signature") {
    const sig = await prisma.signature.findUnique({ where: { id: entityId }, select: { transferId: true } });
    return sig?.transferId ?? null;
  }
  return null;
}

/** מצא holder IDs מתוך entity כדי לשלוח מייל למחסנים/פלוגות המעורבים */
async function resolveHolderIds(entity: string, entityId: string | null | undefined): Promise<string[]> {
  if (!entityId) return [];
  try {
    if (entity === "Transfer") {
      const t = await prisma.transfer.findUnique({
        where: { id: entityId },
        select: { fromHolderId: true, toHolderId: true, toSoldier: { select: { companyId: true } } },
      });
      if (!t) return [];
      const ids: string[] = [];
      if (t.fromHolderId) ids.push(t.fromHolderId);
      if (t.toHolderId) ids.push(t.toHolderId);
      if (t.toSoldier?.companyId) ids.push(t.toSoldier.companyId);
      return ids;
    }
    if (entity === "Signature") {
      const s = await prisma.signature.findUnique({
        where: { id: entityId },
        select: { transfer: { select: { fromHolderId: true, toHolderId: true } }, soldier: { select: { companyId: true } } },
      });
      if (!s) return [];
      const ids: string[] = [];
      if (s.transfer?.fromHolderId) ids.push(s.transfer.fromHolderId);
      if (s.transfer?.toHolderId) ids.push(s.transfer.toHolderId);
      if (s.soldier?.companyId) ids.push(s.soldier.companyId);
      return ids;
    }
  } catch { /* ignore */ }
  return [];
}
