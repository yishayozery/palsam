import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import type { RequestType } from "@/generated/prisma";
import { ensureRequestDefaults } from "@/lib/requestDefaults";
import RequestsClient from "./RequestsClient";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const user = await requireUser();
  const bId = user.battalionId!;
  const unit = await prisma.battalion.findUnique({
    where: { id: bId },
    select: { id: true, name: true, level: true, parentId: true, telegramBotUsername: true, parent: { select: { name: true } } },
  });
  const isBrigade = unit?.level === "BRIGADE";
  const isMalka = user.isAdmin || can(user, "battalion.profile");

  // מנוע השדות הדינמי — ההגדרות שמורות ברמת החטיבה (יחידת האב לגדוד).
  const defsUnitId = isBrigade ? bId : unit?.parentId ?? null;
  if (defsUnitId) await ensureRequestDefaults(defsUnitId).catch(() => {});
  const fieldDefs = defsUnitId
    ? await prisma.requestFieldDef.findMany({ where: { brigadeUnitId: defsUnitId, active: true }, orderBy: { sortOrder: "asc" }, select: { type: true, side: true, fieldKey: true, label: true, fieldType: true, options: true, required: true } })
    : [];
  type DF = { fieldKey: string; label: string; fieldType: string; options: string[]; required: boolean };
  const fieldsByType: Record<string, DF[]> = {};
  const handlerFieldsByType: Record<string, DF[]> = {};
  for (const f of fieldDefs) {
    const df: DF = { fieldKey: f.fieldKey, label: f.label, fieldType: f.fieldType, options: f.options, required: f.required };
    (f.side === "HANDLER" ? handlerFieldsByType : fieldsByType)[f.type] ??= [];
    (f.side === "HANDLER" ? handlerFieldsByType : fieldsByType)[f.type].push(df);
  }

  // בעל תפקיד בחטיבה — רואה רק את הסוגים שהוקצו לו. מלכ"א/גדוד — הכל.
  let myTypes: RequestType[] | null = null;
  if (isBrigade && !isMalka) {
    const handlers = await prisma.requestTypeHandler.findMany({ where: { brigadeUnitId: bId, userId: user.id }, select: { type: true } });
    myTypes = [...new Set(handlers.map((h) => h.type))];
  }

  const requests = await prisma.request.findMany({
    where: isBrigade ? { targetUnitId: bId, ...(myTypes ? { type: { in: myTypes } } : {}) } : { battalionId: bId },
    include: {
      battalion: { select: { name: true } },
      updates: { orderBy: { createdAt: "asc" }, select: { id: true, authorName: true, text: true, statusFrom: true, statusTo: true, createdAt: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 300,
  });

  const rows = requests.map((r) => ({
    id: r.id, type: r.type, title: r.title, description: r.description, priority: r.priority, status: r.status,
    openerName: r.battalion.name, openedByName: r.openedByName, assignedName: r.assignedName,
    data: (r.data as Record<string, string> | null) ?? null,
    createdAt: r.createdAt.toISOString(), escalatedAt: r.escalatedAt?.toISOString() ?? null,
    updates: r.updates.map((u) => ({ id: u.id, authorName: u.authorName, text: u.text, statusFrom: u.statusFrom, statusTo: u.statusTo, createdAt: u.createdAt.toISOString() })),
  }));

  const companies = isBrigade ? [] : await prisma.holder.findMany({
    where: { battalionId: bId, kind: "COMPANY", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" },
  });

  // הגדרות בעלי-תפקיד — רק למלכ"א בחטיבה
  const brigadeUsers = isBrigade && isMalka
    ? await prisma.appUser.findMany({ where: { battalionId: bId, active: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } })
    : [];
  const handlers = isBrigade && isMalka
    ? await prisma.requestTypeHandler.findMany({ where: { brigadeUnitId: bId }, select: { id: true, type: true, userId: true } })
    : [];
  // מנוע השדות — עריכה ע"י מלכ"א (שני הצדדים) + הגדרות סוג
  const settingsDefs = isBrigade && isMalka
    ? await prisma.requestFieldDef.findMany({ where: { brigadeUnitId: bId }, orderBy: [{ sortOrder: "asc" }], select: { id: true, type: true, side: true, label: true, fieldType: true, options: true, required: true } })
    : [];
  const typeConfigs = isBrigade && isMalka
    ? await prisma.requestTypeConfig.findMany({ where: { brigadeUnitId: bId }, select: { type: true, requiresApproval: true, requestDays: true, requestHours: true, supplyTiming: true } })
    : [];

  // אחראי-תחום ברמת הגדוד (צד המבקש) — נטענים בגדוד (עריכה למפקד בלבד)
  const responsibles = !isBrigade
    ? await prisma.requestResponsible.findMany({ where: { battalionId: bId }, select: { id: true, type: true, name: true, phone: true, userId: true, token: true, chatId: true }, orderBy: { createdAt: "asc" } })
    : [];
  const battalionUsers = !isBrigade && isMalka
    ? await prisma.appUser.findMany({ where: { battalionId: bId, active: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } })
    : [];

  return (
    <RequestsClient
      mode={isBrigade ? "brigade" : "battalion"}
      unitName={unit?.name ?? ""}
      parentName={unit?.parent?.name ?? null}
      isCommander={isMalka}
      isMalka={isBrigade && isMalka}
      myTypes={myTypes}
      companies={companies}
      requests={rows}
      fieldsByType={fieldsByType}
      handlerFieldsByType={handlerFieldsByType}
      brigadeUsers={brigadeUsers.map((u) => ({ id: u.id, name: u.fullName ?? "—" }))}
      handlers={handlers}
      settingsDefs={settingsDefs}
      typeConfigs={typeConfigs}
      responsibles={responsibles.map((r) => ({ id: r.id, type: r.type, name: r.name, phone: r.phone, hasAccount: !!r.userId, bound: !!r.chatId, token: r.token }))}
      battalionUsers={battalionUsers.map((u) => ({ id: u.id, name: u.fullName ?? "—" }))}
      botUsername={unit?.telegramBotUsername ?? null}
    />
  );
}
