import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { NAV, GROUP_ROLES } from "@/lib/nav";
import { prisma } from "@/lib/prisma";
import Sidebar from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  const filtered = NAV.filter((n) => {
    if (n.roles && !n.roles.includes(user.role)) return false;
    // אדמין-על: רק פריטים שמיועדים לו (ניהול גדודים)
    if (user.role === "SUPER_ADMIN") return n.roles?.includes("SUPER_ADMIN") ?? false;
    if (n.cap && !can(user.role, n.cap)) return false;
    // סינון לפי קבוצה: כל קבוצה שייכת לתפקיד ספציפי (מונע "דלף" בין תפקידים)
    const groupRoles = GROUP_ROLES[n.group];
    if (groupRoles && !groupRoles.includes(user.role)) return false;
    return true;
  });
  // דה-דופ לפי href — אם פריט מופיע בכמה קבוצות, מציגים רק את הראשונה.
  // הסדר בקובץ nav.ts קובע איזו קבוצה "מנצחת" (לכן הצבנו את "הפלוגה שלי" לפני "המחסנים שלי" לרס"פ).
  const seen = new Set<string>();
  const items = filtered.filter((n) => {
    if (seen.has(n.href)) return false;
    seen.add(n.href);
    return true;
  });

  const battalion = user.battalionId
    ? await prisma.battalion.findUnique({ where: { id: user.battalionId }, select: { name: true, logoData: true, motto: true } })
    : null;
  const unitName = user.role === "SUPER_ADMIN" ? "ניהול-על" : battalion?.name || "גדוד";

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-60 bg-slate-900 text-white flex flex-col shrink-0 print:hidden">
        <div className="px-4 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2.5">
            {battalion?.logoData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={battalion.logoData} alt="סמל הגדוד" className="w-10 h-10 object-contain rounded shrink-0" />
            ) : (
              <span className="text-2xl shrink-0">🛡️</span>
            )}
            <div className="min-w-0">
              <div className="font-bold text-base leading-tight truncate">{unitName}</div>
              <div className="text-xs text-slate-400 tracking-wide">KALAG · ניהול מלאי</div>
              {battalion?.motto && (
                <div className="text-[11px] text-amber-300/80 italic truncate mt-0.5">״{battalion.motto}״</div>
              )}
            </div>
          </div>
        </div>
        <Sidebar items={items} />
        <div className="px-4 py-3 border-t border-slate-700">
          <div className="text-sm font-medium">{user.fullName}</div>
          <div className="text-xs text-slate-400 mb-2">{user.roleLabel}</div>
          <form action="/logout" method="post">
            <button className="w-full text-xs bg-slate-800 hover:bg-slate-700 rounded-md py-1.5 transition">
              התנתקות
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-slate-100">
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
