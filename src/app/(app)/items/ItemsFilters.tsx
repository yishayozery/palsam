"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function ItemsFilters({
  initialQ,
  initialCategory,
  categories,
}: {
  initialQ: string;
  initialCategory: string;
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(initialQ);
  const [cat, setCat] = useState(initialCategory);

  const apply = (nextQ: string, nextCat: string) => {
    const params = new URLSearchParams(sp.toString());
    params.set("tab", "items");
    if (nextQ) params.set("q", nextQ); else params.delete("q");
    if (nextCat) params.set("category", nextCat); else params.delete("category");
    router.push(`/items?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-3 mb-4">
      <div className="flex-1 min-w-48">
        <label className="block text-xs text-slate-500 mb-1">חיפוש (שם / מק״ט)</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") apply(q, cat); }}
          placeholder="הקלד שם או מק״ט..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">קטגוריה</label>
        <select
          value={cat}
          onChange={(e) => { setCat(e.target.value); apply(q, e.target.value); }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">כל הקטגוריות</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <button
        onClick={() => apply(q, cat)}
        className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-900"
      >חיפוש</button>
      {(q || cat) && (
        <button onClick={() => { setQ(""); setCat(""); apply("", ""); }}
          className="text-sm text-slate-500 hover:text-slate-800">נקה</button>
      )}
    </div>
  );
}
