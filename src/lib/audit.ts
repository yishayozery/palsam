import "server-only";
import { prisma } from "./prisma";

/** רישום פעולה ביומן (Audit Log) */
export async function audit(
  userId: string | null,
  action: string,
  entity: string,
  entityId?: string | null,
  details?: unknown,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId ?? undefined,
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
