import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import SupportClient from "./SupportClient";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const user = await requireUser();
  const bId = user.battalionId!;
  const isAdmin = can(user, "battalion.profile") || user.isSuperAdmin;

  const [config, battalion, questions] = await Promise.all([
    prisma.appConfig.findUnique({ where: { id: "singleton" }, select: { supportWhatsappEnabled: true, supportWhatsappNumber: true, supportMessage: true } }),
    prisma.battalion.findUnique({ where: { id: bId }, select: { supportWhatsapp: true } }),
    prisma.supportQuestion.findMany({
      where: { battalionId: bId, ...(isAdmin ? {} : { askedById: user.id }) },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
      select: { id: true, category: true, question: true, status: true, answer: true, askedByName: true, createdAt: true },
    }),
  ]);

  // רק לפי מספר הגדוד. wa.me דורש בינ"ל — ממירים 05X→9725X.
  const rawWa = battalion?.supportWhatsapp || null;
  const waNumber = rawWa ? (rawWa.startsWith("0") ? "972" + rawWa.slice(1) : rawWa) : null;
  const waLink = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(config?.supportMessage || "שלום, אני צריך עזרה במערכת PALMY")}`
    : null;

  return (
    <div>
      <PageHeader title="🆘 עזרה ותמיכה" subtitle="שאלות, תקלות וצרכים — כאן מעלים ואנחנו עונים" />
      <SupportClient
        isAdmin={isAdmin}
        isSuperAdmin={user.isSuperAdmin}
        waLink={waLink}
        config={{ enabled: config?.supportWhatsappEnabled ?? false, number: config?.supportWhatsappNumber ?? "", message: config?.supportMessage ?? "" }}
        questions={questions.map((q) => ({ ...q, createdAt: q.createdAt.toISOString() }))}
      />
      {!isAdmin && (
        <Card className="p-4 mt-4 bg-slate-50 text-xs text-slate-500">
          💡 השאלות שלך נשלחות למפ״מ/מנהל המערכת. תקבל תשובה כאן.
        </Card>
      )}
    </div>
  );
}
