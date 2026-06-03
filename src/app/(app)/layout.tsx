import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { ROLE_LABELS } from "@/lib/rbac";
import { NAV } from "@/lib/nav";
import Sidebar from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const items = NAV.filter((n) => !n.cap || can(user.role, n.cap));
  const unitName = process.env.UNIT_NAME || "גדוד";

  return (
    <div className="flex h-screen overflow-hidden">
      {/* סרגל צד */}
      <aside className="w-60 bg-slate-900 text-white flex flex-col shrink-0 print:hidden">
        <div className="px-4 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛡️</span>
            <div>
              <div className="font-bold text-sm">ניהול מלאי גדודי</div>
              <div className="text-xs text-slate-400">{unitName}</div>
            </div>
          </div>
        </div>
        <Sidebar items={items} />
        <div className="px-4 py-3 border-t border-slate-700">
          <div className="text-sm font-medium">{user.fullName}</div>
          <div className="text-xs text-slate-400 mb-2">
            {ROLE_LABELS[user.role]}
          </div>
          <form action="/logout" method="post">
            <button className="w-full text-xs bg-slate-800 hover:bg-slate-700 rounded-md py-1.5 transition">
              התנתקות
            </button>
          </form>
        </div>
      </aside>

      {/* תוכן */}
      <main className="flex-1 overflow-y-auto bg-slate-100">
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
