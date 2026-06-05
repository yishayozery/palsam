import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { NAV, GROUP_ROLES } from "@/lib/nav";
import { prisma } from "@/lib/prisma";
import Sidebar from "@/components/Sidebar";
import MobileShell from "@/components/MobileShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  const filtered = NAV.filter((n) => {
    if (n.roles && !n.roles.includes(user.role)) return false;
    if (user.role === "SUPER_ADMIN") return n.roles?.includes("SUPER_ADMIN") ?? false;
    if (n.cap && !can(user.role, n.cap)) return false;
    const groupRoles = GROUP_ROLES[n.group];
    if (groupRoles && !groupRoles.includes(user.role)) return false;
    return true;
  });
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

  const sidebar = (
    <>
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
            <div className="text-xs text-slate-400 tracking-wide">PALSAM · ניהול מלאי</div>
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
    </>
  );

  const headerBrand = (
    <div className="flex items-center gap-2 min-w-0">
      {battalion?.logoData ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={battalion.logoData} alt="" className="w-7 h-7 object-contain rounded shrink-0" />
      ) : (
        <span className="text-xl shrink-0">🛡️</span>
      )}
      <span className="font-bold text-sm truncate">{unitName}</span>
    </div>
  );

  return (
    <MobileShell sidebar={sidebar} headerBrand={headerBrand}>
      {children}
    </MobileShell>
  );
}
