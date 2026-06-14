import "server-only";
import { prisma } from "./prisma";

/** רישום פעולה ביומן (Audit Log) — שולף battalionId אוטומטית מהמשתמש */
export async function audit(
  userId: string | null,
  action: string,
  entity: string,
  entityId?: string | null,
  details?: unknown,
): Promise<void> {
  try {
    // 🆕 שליפת battalionId מהמשתמש כדי שהיומן יופיע לפי גדוד
    let battalionId: string | undefined;
    if (userId) {
      const u = await prisma.appUser.findUnique({
        where: { id: userId }, select: { battalionId: true },
      });
      battalionId = u?.battalionId ?? undefined;
    }
    await prisma.auditLog.create({
      data: {
        userId: userId ?? undefined,
        battalionId,
        action,
        entity,
        entityId: entityId ?? undefined,
        details: details === undefined ? undefined : (details as object),
      },
    });
  } catch {
    // לוג כשל ביומן לא יפיל פעולה עסקית
  }
}
