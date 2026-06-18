"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { upsertAllocation } from "./actions";

type Item = { id: string; name: string; sku: string | null; trackingMethod: string; category: { name: string } | null };
type Company = { id: string; name: string };
type AllocationRow = { companyId: string; itemTypeId: string; quantity: number; blockOnExceed: boolean };
type SignedCount = { companyId: string; itemTypeId: string; count: number };
type StockEntry = { itemTypeId: string; available: number };
type CompanyStockEntry = { companyId: string; itemTypeId: string; count: number };

export default function AllocationsClient({
  items, companies, allocations, signedCounts, warehouseStock, companyStock,
}: {
  items: Item[];
  companies: Company[];
  allocations: AllocationRow[];
  signedCounts: SignedCount[];
  warehouseStock: StockEntry[];
  companyStock: CompanyStockEntry[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");

  const allocMap = useMemo(() => {
    const m = new Map<string, { quantity: number; blockOnExceed: boolean }>();
    for (const a of allocations) m.set(`${a.companyId}:${a.itemTypeId}`, { quantity: a.quantity, blockOnExceed: a.blockOnExceed });
    return m;
  }, [allocations]);

  const signedMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of signedCounts) m.set(`${s.companyId}:${s.itemTypeId}`, s.count);
    return m;
  }, [signedCounts]);

  const warehouseMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of warehouseStock) m.set(s.itemTypeId, s.available);
    return m;
  }, [warehouseStock]);

  const companyStockMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of companyStock) m.set(`${s.companyId}:${s.itemTypeId}`, s.count);
    return m;
  }, [companyStock]);

  const blockMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const a of allocations) {
      if (!m.has(a.itemTypeId)) m.set(a.itemTypeId, a.blockOnExceed);
    }
    return m;
  }, [allocations]);

  const hasAllocation = useCallback((itemId: string) => {
    return companies.some((c) => {
      const a = allocMap.get(`${c.id}:${itemId}`);
      return a && a.quantity > 0;
    });
  }, [companies, allocMap]);

  const visibleItems = useMemo(() => {
    let list = showAll ? items : items.filter((i) => hasAllocation(i.id));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        (i.sku && i.sku.toLowerCase().includes(q)) ||
        (i.category?.name && i.category.name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [items, showAll, hasAllocation, search]);

  const grouped = useMemo(() => {
    const groups: { category: string; items: Item[] }[] = [];
    let current: { category: string; items: Item[] } | null = null;
    for (const item of visibleItems) {
      const cat = item.category?.name ?? "ללא קטגוריה";
      if (!current || current.category !== cat) {
        current = { category: cat, items: [] };
        groups.push(current);
      }
      current.items.push(item);
    }
    return groups;
  }, [visibleItems]);

  async function saveAlloc(companyId: string, itemTypeId: string, quantity: number, blockOnExceed: boolean) {
    const key = `${companyId}:${itemTypeId}`;
    setSaving(key);
    try {
      const fd = new FormData();
      fd.append("companyId", companyId);
      fd.append("itemTypeId", itemTypeId);
      fd.append("quantity", String(quantity));
      fd.append("blockOnExceed", String(blockOnExceed));
      await upsertAllocation(fd);
      router.refresh();
    } finally {
      setSaving(null);
    }
  }

  async function toggleBlock(itemId: string, newBlock: boolean) {
    const promises = companies
      .map((c) => {
        const a = allocMap.get(`${c.id}:${itemId}`);
        if (a && a.quantity > 0) return saveAlloc(c.id, itemId, a.quantity, newBlock);
        return null;
      })
      .filter(Boolean);
    await Promise.all(promises);
  }

  const allocatedCount = items.filter((i) => hasAllocation(i.id)).length;

  return (
    <>
      <Card className="p-3 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <span className="text-sm text-slate-500">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם פריט, מק״ט, קטגוריה..."
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            )}
          </div>
          <span className="text-sm text-slate-600">
            {allocatedCount} פריטים עם הקצאה מתוך {items.length}
          </span>
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            {showAll ? "🔽 הצג רק מוקצים" : `📋 הצג את כל ${items.length} הפריטים`}
          </button>
        </div>
      </Card>

      <Card className="overflow-x-auto relative">
        <table className="w-full text-sm border-collapse min-w-[600px]">
          <thead className="sticky top-0 z-20">
            <tr className="bg-slate-100 border-b-2 border-slate-300">
              <th className="text-right px-3 py-2.5 font-bold text-slate-700 sticky right-0 bg-slate-100 z-30 min-w-[180px] border-l border-slate-200">
                פריט
              </th>
              <th className="text-center px-2 py-2.5 font-semibold text-slate-500 min-w-[70px] border-l border-slate-200">
                <div className="text-[10px]">במחסנים</div>
                <div className="text-[9px] text-slate-400">(זמין)</div>
              </th>
              {companies.map((c) => (
                <th key={c.id} className="text-center px-2 py-2.5 font-bold text-slate-700 min-w-[100px] border-l border-slate-200">
                  {c.name}
                </th>
              ))}
              <th className="text-center px-2 py-2.5 font-bold text-slate-700 min-w-[80px]">
                חריגה
              </th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((g) => (
              <ItemGroup
                key={g.category}
                category={g.category}
                items={g.items}
                companies={companies}
                allocMap={allocMap}
                signedMap={signedMap}
                warehouseMap={warehouseMap}
                companyStockMap={companyStockMap}
                blockMap={blockMap}
                hasAllocation={hasAllocation}
                saving={saving}
                saveAlloc={saveAlloc}
                toggleBlock={toggleBlock}
              />
            ))}
          </tbody>
        </table>
        {visibleItems.length === 0 && (
          <div className="p-8 text-center text-slate-400">
            {search ? `לא נמצאו פריטים ל-"${search}"` : 'אין הקצאות. לחץ "הצג את כל הפריטים" כדי להתחיל להגדיר.'}
          </div>
        )}
      </Card>

      <Card className="p-3 mt-3 bg-blue-50 border-blue-200 text-xs text-blue-900">
        💡 הזן כמות מוקצית לכל פלוגה. המספר שמתחת מראה <strong>חתום/מוקצה</strong>.
        &nbsp;🚫 = חסום (לא ניתן להחתים מעבר) &nbsp;⚠️ = התרעה (מציג אזהרה אבל מאפשר).
        &nbsp;הכמות &quot;בפלוגה&quot; כוללת מלאי שבפלוגה שלא חתום על חייל.
      </Card>
    </>
  );
}

function ItemGroup({
  category, items, companies, allocMap, signedMap, warehouseMap, companyStockMap, blockMap, hasAllocation, saving, saveAlloc, toggleBlock,
}: {
  category: string;
  items: Item[];
  companies: Company[];
  allocMap: Map<string, { quantity: number; blockOnExceed: boolean }>;
  signedMap: Map<string, number>;
  warehouseMap: Map<string, number>;
  companyStockMap: Map<string, number>;
  blockMap: Map<string, boolean>;
  hasAllocation: (id: string) => boolean;
  saving: string | null;
  saveAlloc: (companyId: string, itemTypeId: string, quantity: number, blockOnExceed: boolean) => Promise<void>;
  toggleBlock: (itemId: string, newBlock: boolean) => Promise<void>;
}) {
  return (
    <>
      <tr>
        <td colSpan={companies.length + 3} className="bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 border-t-2 border-slate-200">
          📁 {category}
        </td>
      </tr>
      {items.map((item) => {
        const block = blockMap.get(item.id) ?? true;
        const whAvail = warehouseMap.get(item.id) ?? 0;
        return (
          <tr key={item.id} className="border-b border-slate-100 hover:bg-blue-50/30">
            <td className="px-3 py-2 sticky right-0 bg-white z-10 border-l border-slate-100">
              <div className="font-medium text-slate-800 text-xs">{item.name}</div>
              {item.sku && <div className="text-[10px] font-mono text-slate-400">{item.sku}</div>}
            </td>
            <td className="px-1 py-1.5 text-center border-l border-slate-100">
              <span className={`text-xs font-mono font-bold ${whAvail > 0 ? "text-blue-600" : "text-slate-300"}`}>
                {whAvail}
              </span>
            </td>
            {companies.map((c) => {
              const cellKey = `${c.id}:${item.id}`;
              const alloc = allocMap.get(cellKey);
              const qty = alloc?.quantity ?? 0;
              const signed = signedMap.get(cellKey) ?? 0;
              const inCompany = companyStockMap.get(cellKey) ?? 0;
              const exceeded = qty > 0 && signed > qty;
              const full = qty > 0 && signed === qty;
              const isSaving = saving === cellKey;
              return (
                <td key={c.id} className="px-1 py-1.5 text-center border-l border-slate-100">
                  <div className="flex flex-col items-center gap-0.5">
                    <input
                      type="number"
                      min={0}
                      defaultValue={qty}
                      disabled={isSaving}
                      onBlur={(e) => {
                        const v = parseInt(e.target.value, 10) || 0;
                        if (v !== qty) saveAlloc(c.id, item.id, v, block);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      className={`w-16 rounded border px-1 py-0.5 text-xs text-center font-mono disabled:opacity-50 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 ${
                        exceeded ? "border-rose-300 bg-rose-50" : full ? "border-amber-300 bg-amber-50" : "border-slate-200"
                      }`}
                    />
                    {(qty > 0 || signed > 0 || inCompany > 0) && (
                      <div className="flex flex-col items-center">
                        <span className={`text-[10px] font-mono font-bold ${exceeded ? "text-rose-600" : full ? "text-amber-600" : "text-emerald-600"}`}>
                          {signed}/{qty || "—"}
                        </span>
                        {inCompany > 0 && (
                          <span className="text-[9px] text-slate-400">בפלוגה: {inCompany}</span>
                        )}
                      </div>
                    )}
                  </div>
                </td>
              );
            })}
            <td className="px-1 py-1.5 text-center">
              {hasAllocation(item.id) && (
                <button
                  onClick={() => toggleBlock(item.id, !block)}
                  disabled={saving !== null}
                  className={`text-[10px] rounded-full px-2 py-0.5 font-medium transition-colors ${
                    block
                      ? "bg-rose-100 text-rose-700 hover:bg-rose-200"
                      : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                  } disabled:opacity-50`}
                  title={block ? "חריגה תחסום החתמה" : "חריגה תציג התראה בלבד"}
                >
                  {block ? "🚫 חסום" : "⚠️ התראה"}
                </button>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}
