"use client";

import { useRouter, useSearchParams } from "next/navigation";

/** בורר מחסן פעיל — למשתמש עם הרשאה ל-2+ מחסנים. משנה את המחסן שממנו מחתימים/מזכים. */
export default function WarehouseSwitcher({ warehouses, activeId }: {
  warehouses: { id: string; name: string }[];
  activeId: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  if (warehouses.length < 2) return null;
  function pick(id: string) {
    const p = new URLSearchParams(params.toString());
    p.set("wh", id);
    router.push(`?${p.toString()}`);
  }
  return (
    <label className="flex items-center gap-1.5 bg-white border-2 border-indigo-200 rounded-xl px-3 py-2 text-sm">
      <span className="text-indigo-700 font-medium whitespace-nowrap">🏬 מחסן פעיל:</span>
      <select value={activeId ?? ""} onChange={(e) => pick(e.target.value)}
        className="font-bold text-indigo-800 bg-transparent focus:outline-none cursor-pointer">
        {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
    </label>
  );
}
