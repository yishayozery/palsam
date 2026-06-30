import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { NAV, GROUP_CONTEXT } from "@/lib/nav";
import { prisma } from "@/lib/prisma";
import Sidebar from "@/components/Sidebar";
import MobileShell from "@/components/MobileShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  // טוען title טרי מ-DB כדי שלא תידרש התנתקות לאחר עדכון תפקיד
  const fresh = await prisma.appUser.findUnique({ where: { id: user.id }, select: { title: true } });
  const displayTitle = fresh?.title || user.title || user.roleLabel;

  const holderKind = user.holderId
    ? (await prisma.holder.findUnique({ where: { id: user.holderId }, select: { kind: true } }))?.kind
    : null;
  const isCompanyHolder = holderKind === "COMPANY";
  const isWarehouseHolder = holderKind === "WAREHOUSE";

  const filtered = NAV.filter((n) => {
    if (n.superAdminOnly) return user.isSuperAdmin;
    if (user.isSuperAdmin) return n.superAdminOnly;
    if (n.adminOnly && !user.isAdmin) return false;
    if (n.screen && !can(user, n.screen)) return false;
    if (n.cap && !can(user, n.cap)) return false;
    const ctx = GROUP_CONTEXT[n.group];
    if (ctx === "company" && !isCompanyHolder) return false;
    if (ctx === "warehouse" && !isWarehouseHolder) return false;
    if (ctx === "admin" && !user.isAdmin) return false;
    return true;
  });
  const seen = new Set<string>();
  const items = filtered.filter((n) => {
    if (seen.has(n.href)) return false;
    seen.add(n.href);
    return true;
  });

  // הזרקה דינמית: רס"פ של פלוגת הטנא רואה /maintenance גם בלי הרשאה מטריצה
  if (user.role === "COMPANY_REP" && user.holderId) {
    const holder = await prisma.holder.findUnique({ where: { id: user.holderId }, select: { name: true } });
    if (holder?.name?.includes("טנא") && !items.some((n) => n.href === "/maintenance")) {
      items.push({ href: "/maintenance", label: "סטטוס רכבים (טנא)", icon: "🔧", group: "מבצעי" });
    }
  }
  // הזרקה דינמית: קצין רכב (מנהל מחסן רכב) רואה /maintenance כ-"סטטוס רכבים"
  if (user.role === "WAREHOUSE_MANAGER" && user.holderIds.length > 0) {
    const myHolders = await prisma.holder.findMany({
      where: { id: { in: user.holderIds } },
      select: { warehouseType: true },
    });
    const isVehicleOfficer = myHolders.some((h) => h.warehouseType === "VEHICLES");
    if (isVehicleOfficer && !items.some((n) => n.href === "/maintenance")) {
      items.push({ href: "/maintenance", label: "סטטוס רכבים", icon: "🚙", group: "מבצעי" });
    }
  }

  const battalion = user.battalionId
    ? await prisma.battalion.findUnique({ where: { id: user.battalionId }, select: { name: true, logoData: true, motto: true } })
    : null;
  // סמל הפלוגה / מחסן של המשתמש (אם יש)
  const userHolder = user.holderId
    ? await prisma.holder.findUnique({ where: { id: user.holderId }, select: { name: true, logoData: true, kind: true } })
    : null;
  const unitName = user.isSuperAdmin ? "ניהול-על" : battalion?.name || "גדוד";

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
          {/* סמל פלוגה / מחסן — לצד סמל הגדוד */}
          {userHolder?.logoData && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={userHolder.logoData} alt={userHolder.name} title={userHolder.name}
              className="w-9 h-9 object-contain rounded shrink-0 border border-slate-600" />
          )}
          <div className="min-w-0">
            <div className="font-bold text-base leading-tight truncate">{unitName}</div>
            {userHolder?.name && (
              <div className="text-[11px] text-blue-200 truncate">
                {userHolder.kind === "COMPANY" ? "🪖" : "🏪"} {userHolder.name}
              </div>
            )}
            <div className="text-xs text-slate-400 tracking-wide">PALMY · ניהול מלאי</div>
            {battalion?.motto && (
              <div className="text-[11px] text-amber-300/80 italic truncate mt-0.5">״{battalion.motto}״</div>
            )}
          </div>
        </div>
      </div>
      <Sidebar items={items} />
      <div className="px-4 py-3 border-t border-slate-700">
        <div className="text-sm font-medium">{user.fullName}</div>
        <div className="text-xs text-slate-400 mb-2">{displayTitle}</div>
        <form action="/logout" method="post">
          <button className="w-full text-xs bg-slate-800 hover:bg-slate-700 rounded-md py-1.5 transition">
            התנתקות
          </button>
        </form>
        <div
          className="mt-2 text-[10px] text-slate-500 font-mono text-center select-text"
          title={`גרסה: ${process.env.NEXT_PUBLIC_BUILD_VERSION ?? "dev"} · נבנה: ${process.env.NEXT_PUBLIC_BUILD_DATE ?? ""}`}
        >
          v.{process.env.NEXT_PUBLIC_BUILD_VERSION ?? "dev"}
          {process.env.NEXT_PUBLIC_BUILD_DATE && (
            <span className="text-slate-600 mr-1">· {process.env.NEXT_PUBLIC_BUILD_DATE.slice(5, 10)} {process.env.NEXT_PUBLIC_BUILD_DATE.slice(11, 16)}</span>
          )}
        </div>
      </div>
    </>
  );

  const holderLabel = userHolder ? `${userHolder.kind === "COMPANY" ? "🪖" : "🏪"} ${userHolder.name}` : null;
  const headerBrand = (
    <div className="flex items-center gap-2 min-w-0">
      {battalion?.logoData ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={battalion.logoData} alt="" className="w-7 h-7 object-contain rounded shrink-0" />
      ) : (
        <span className="text-xl shrink-0">🛡️</span>
      )}
      <div className="min-w-0">
        <div className="font-bold text-sm truncate leading-tight">{unitName}</div>
        <div className="text-[10px] text-slate-300 truncate leading-tight">
          {user.fullName}{holderLabel ? ` · ${holderLabel}` : ""}
        </div>
      </div>
    </div>
  );

  return (
    <MobileShell sidebar={sidebar} headerBrand={headerBrand}>
      {children}
    </MobileShell>
  );
}
