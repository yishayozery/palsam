"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { WAREHOUSE_TYPE_SHORT } from "@/lib/rbac";

const WH_OPTS = ["EQUIPMENT","COMMS","AMMO","ARMORY","VEHICLES","MEDICAL","GENERAL"] as const;

export default function CategoriesFilters({
  initialQ, initialWarehouse,
}: { initialQ: string; initialWarehouse: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(initialQ);
  const [wh, setWh] = useState(initialWarehouse);

  const apply = (nextQ: string, nextWh: string) => {
    const params = new URLSearchParams(sp.toString());
    params.set("tab", "categories");
    if (nextQ) params.set("catQ", nextQ); else params.delete("catQ");
    if (nextWh) params.set("catWh", nextWh); else params.delete("catWh");
    router.push(`/items?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-3 mb-4">
      <div className="flex-1 min-w-48">
        <label className="block text-xs text-slate-500 mb-1">חיפוש קטגוריה</label>
        <input value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") apply(q, wh); }}
          placeholder="שם קטגוריה..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">מחסן</label>
        <select value={wh} onChange={(e) => { setWh(e.target.value); apply(q, e.target.value); }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">כל המחסנים</option>
          {WH_OPTS.map((v) => <option key={v} value={v}>{WAREHOUSE_TYPE_SHORT[v]}</option>)}
        </select>
      </div>
      <button onClick={() => apply(q, wh)}
        className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-900">חיפוש</button>
      {(q || wh) && (
        <button onClick={() => { setQ(""); setWh(""); apply("", ""); }}
          className="text-sm text-slate-500 hover:text-slate-800">נקה</button>
      )}
    </div>
  );
}
