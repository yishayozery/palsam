"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { WAREHOUSE_TYPE_SHORT } from "@/lib/rbac";

const WH_OPTS = ["EQUIPMENT","COMMS","AMMO","ARMORY","VEHICLES","MEDICAL","GENERAL"] as const;

export default function ItemsFilters({
  initialQ, initialCategory, initialWarehouse, initialStatus, categories,
}: {
  initialQ: string; initialCategory: string; initialWarehouse: string; initialStatus: string;
  categories: { id: string; name: string; warehouseType?: string }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(initialQ);
  const [cat, setCat] = useState(initialCategory);
  const [wh, setWh] = useState(initialWarehouse);
  const [status, setStatus] = useState(initialStatus);

  const apply = (nextQ: string, nextCat: string, nextWh: string, nextStatus: string) => {
    const params = new URLSearchParams(sp.toString());
    params.set("tab", "items");
    if (nextQ) params.set("q", nextQ); else params.delete("q");
    if (nextCat) params.set("category", nextCat); else params.delete("category");
    if (nextWh) params.set("warehouse", nextWh); else params.delete("warehouse");
    if (nextStatus) params.set("status", nextStatus); else params.delete("status");
    router.push(`/items?${params.toString()}`);
  };

  const visibleCats = wh ? categories.filter((c) => c.warehouseType === wh) : categories;

  return (
    <div className="flex flex-wrap items-end gap-3 mb-4">
      <div className="flex-1 min-w-48">
        <label className="block text-xs text-slate-500 mb-1">חיפוש (שם / מק״ט)</label>
        <input value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") apply(q, cat, wh, status); }}
          placeholder="הקלד..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">מחסן</label>
        <select value={wh} onChange={(e) => { setWh(e.target.value); apply(q, "", e.target.value, status); }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">כל המחסנים</option>
          {WH_OPTS.map((v) => <option key={v} value={v}>{WAREHOUSE_TYPE_SHORT[v]}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">קטגוריה</label>
        <select value={cat} onChange={(e) => { setCat(e.target.value); apply(q, e.target.value, wh, status); }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">הכל</option>
          {visibleCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">סטטוס</label>
        <select value={status} onChange={(e) => { setStatus(e.target.value); apply(q, cat, wh, e.target.value); }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">זמין</option>
          <option value="archived">ארכיון</option>
          <option value="all">הכל</option>
        </select>
      </div>
      <button onClick={() => apply(q, cat, wh, status)}
        className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-900">חיפוש</button>
      {(q || cat || wh || status) && (
        <button onClick={() => { setQ(""); setCat(""); setWh(""); setStatus(""); apply("", "", "", ""); }}
          className="text-sm text-slate-500 hover:text-slate-800">נקה</button>
      )}
    </div>
  );
}
