"use client";

import { useRouter, useSearchParams } from "next/navigation";

/** בורר מחסן פעיל — למשתמש עם הרשאה ל-2+ מחסנים. משנה את המחסן שממנו מחתימים/מזכים/צופים.
 *  allowAll=true מוסיף אפשרות "כל המחסנים" (מסיר את פרמטר wh) — לתצוגות מלאי מאוחדות. */
export default function WarehouseSwitcher({ warehouses, activeId, allowAll = false, allLabel = "כל המחסנים", label = "מחסן פעיל" }: {
  warehouses: { id: string; name: string }[];
  activeId: string | null;
  allowAll?: boolean;
  allLabel?: string;
  label?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  if (warehouses.length < 2) return null;
  function pick(id: string) {
    const p = new URLSearchParams(params.toString());
    if (id) p.set("wh", id); else p.delete("wh");
    router.push(`?${p.toString()}`);
  }
  return (
    <label className="flex items-center gap-1.5 bg-white border-2 border-indigo-200 rounded-xl px-3 py-2 text-sm">
      <span className="text-indigo-700 font-medium whitespace-nowrap">🏬 {label}:</span>
      <select value={activeId ?? ""} onChange={(e) => pick(e.target.value)}
        className="font-bold text-indigo-800 bg-transparent focus:outline-none cursor-pointer">
        {allowAll && <option value="">{allLabel}</option>}
        {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
    </label>
  );
}
