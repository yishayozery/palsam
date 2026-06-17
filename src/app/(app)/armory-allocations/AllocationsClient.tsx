"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { upsertAllocation } from "./actions";

type Item = { id: string; name: string; sku: string | null; trackingMethod: string; category: { name: string } | null };
type Company = { id: string; name: string };
type AllocationRow = { companyId: string; itemTypeId: string; quantity: number; blockOnExceed: boolean };
type SignedCount = { companyId: string; itemTypeId: string; count: number };

export default function AllocationsClient({
  items, companies, allocations, signedCounts,
}: {
  items: Item[];
  companies: Company[];
  allocations: AllocationRow[];
  signedCounts: SignedCount[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

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

  // blockOnExceed per item — take from first allocation found for that item
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
    if (showAll) return items;
    return items.filter((i) => hasAllocation(i.id));
  }, [items, showAll, hasAllocation]);

  // Group by category
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
    // Update blockOnExceed for all allocations of this item across all companies
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
          <span className="text-sm text-slate-600">
            {allocatedCount} פריטים עם הקצאה מתוך {items.length}
          </span>
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-sm text-blue-600 hover:text-blue-800 mr-auto"
          >
            {showAll ? "הצג רק מוקצים" : `הצג את כל ${items.length} הפריטים`}
          </button>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[600px]">
          <thead>
            <tr className="bg-slate-50 border-b-2 border-slate-200">
              <th className="text-right px-3 py-2.5 font-semibold text-slate-700 sticky right-0 bg-slate-50 z-10 min-w-[160px]">פריט</th>
              {companies.map((c) => (
                <th key={c.id} className="text-center px-2 py-2.5 font-semibold text-slate-700 min-w-[90px]">
                  {c.name}
                </th>
              ))}
              <th className="text-center px-2 py-2.5 font-semibold text-slate-700 min-w-[80px]">חריגה</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((g) => (
              <>
                <tr key={`cat-${g.category}`}>
                  <td colSpan={companies.length + 2} className="bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500 border-t border-slate-200">
                    {g.category}
                  </td>
                </tr>
                {g.items.map((item) => {
                  const block = blockMap.get(item.id) ?? true;
                  return (
                    <tr key={item.id} className="border-b border-slate-100 hover:bg-blue-50/30">
                      <td className="px-3 py-2 sticky right-0 bg-white z-10">
                        <div className="font-medium text-slate-800 text-xs">{item.name}</div>
                        {item.sku && <div className="text-[10px] font-mono text-slate-400">{item.sku}</div>}
                      </td>
                      {companies.map((c) => {
                        const cellKey = `${c.id}:${item.id}`;
                        const alloc = allocMap.get(cellKey);
                        const qty = alloc?.quantity ?? 0;
                        const signed = signedMap.get(cellKey) ?? 0;
                        const exceeded = qty > 0 && signed > qty;
                        const full = qty > 0 && signed === qty;
                        const isSaving = saving === cellKey;
                        return (
                          <td key={c.id} className="px-1 py-1.5 text-center">
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
                                className="w-14 rounded border border-slate-200 px-1 py-0.5 text-xs text-center font-mono disabled:opacity-50 focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
                              />
                              {(qty > 0 || signed > 0) && (
                                <span className={`text-[10px] font-mono font-bold ${exceeded ? "text-rose-600" : full ? "text-amber-600" : "text-emerald-600"}`}>
                                  {signed}/{qty}
                                </span>
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
            ))}
          </tbody>
        </table>
        {visibleItems.length === 0 && (
          <div className="p-8 text-center text-slate-400">
            אין הקצאות. לחץ &quot;הצג את כל הפריטים&quot; כדי להתחיל להגדיר.
          </div>
        )}
      </Card>
    </>
  );
}
