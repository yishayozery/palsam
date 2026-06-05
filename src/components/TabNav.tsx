import Link from "next/link";

export type Tab = { key: string; label: string; href: string };

export default function TabNav({ tabs, active }: { tabs: Tab[]; active: string }) {
  return (
    <div className="flex gap-1 border-b border-slate-200 mb-4 md:mb-5 overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0 scrollbar-thin">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`px-3 md:px-4 py-2 text-xs md:text-sm rounded-t-lg whitespace-nowrap shrink-0 ${
            active === t.key
              ? "bg-white border border-b-0 border-slate-200 font-semibold text-slate-800 -mb-px"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
