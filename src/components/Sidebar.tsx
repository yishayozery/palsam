"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/nav";

export default function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  // קיבוץ לפי group תוך שמירה על הסדר
  const groups: { name: string; items: NavItem[] }[] = [];
  for (const item of items) {
    let g = groups.find((x) => x.name === item.group);
    if (!g) { g = { name: item.group, items: [] }; groups.push(g); }
    g.items.push(item);
  }

  return (
    <nav className="flex-1 overflow-y-auto py-3">
      {groups.map((g, gi) => (
        <div key={g.name} className={gi > 0 ? "mt-4" : ""}>
          <div className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {g.name}
          </div>
          <ul className="space-y-0.5 px-3">
            {g.items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                      active
                        ? "bg-slate-700 text-white font-medium"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <span className="text-lg leading-none">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
