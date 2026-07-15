import "server-only";
import { createHash } from "crypto";
import { prisma } from "./prisma";
import { shouldNotifyEmail, notifyTransactionEmail } from "./email";

function computeHash(prev: string | null, payload: object): string {
  const h = createHash("sha256");
  h.update(prev ?? "GENESIS");
  h.update("|");
  h.update(JSON.stringify(payload));
  return h.digest("hex");
}

/** רישום פעולה ביומן (Audit Log) — שרשרת hash למניעת זיוף + שליפת battalionId אוטו' */
export async function audit(
  userId: string | null,
  action: string,
  entity: string,
  entityId?: string | null,
  details?: unknown,
  holderId?: string | null,
): Promise<void> {
  try {
    let battalionId: string | undefined;
    if (userId) {
      const u = await prisma.appUser.findUnique({
        where: { id: userId }, select: { battalionId: true },
      });
      battalionId = u?.battalionId ?? undefined;
    }
    const last = await prisma.auditLog.findFirst({
      orderBy: { createdAt: "desc" }, select: { hash: true },
    });
    const prevHash = last?.hash ?? null;
    const payload = {
      userId: userId ?? null,
      battalionId: battalionId ?? null,
      action, entity,
      entityId: entityId ?? null,
      details: details ?? null,
      ts: new Date().toISOString(),
    };
    const hash = computeHash(prevHash, payload);
    await prisma.auditLog.create({
      data: {
        userId: userId ?? undefined,
        battalionId,
        action,
        entity,
        entityId: entityId ?? undefined,
        details: details === undefined ? undefined : (details as object),
        prevHash, hash,
      },
    });

    // 📧 התראה במייל לפעולות מבצעיות (אם מוגדר notificationEmail בגדוד)
    if (battalionId && shouldNotifyEmail(action, entity)) {
      void notifyTransactionEmail({ battalionId, userId, action, entity, entityId, details, holderId });
    }
  } catch (e) {
    // כשל ביומן לא יפיל פעולה עסקית — אך נרשם ללוג השרת לצורך חקירה
    console.error("[audit] failed to write audit log:", e);
  }
}
