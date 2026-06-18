"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { upsertAllocation } from "./actions";

type Item = { id: string; name: string; sku: string | null; trackingMethod: string; categoryId: string | null; category: { name: string; warehouseType: string } | null };
type Company = { id: string; name: string };
type CategoryInfo = { id: string; name: string; warehouseType: string };
type AllocationRow = { companyId: string; itemTypeId: string; quantity: number; blockOnExceed: boolean };
type SignedCount = { companyId: string; itemTypeId: string; count: number };
type StockEntry = { itemTypeId: string; available: number };
type CompanyStockEntry = { companyId: string; itemTypeId: string; count: number };

const WT_LABELS: Record<string, string> = {
  EQUIPMENT: "קל״ג", COMMS: "קשר״ג", AMMO: "בונקר", ARMORY: "ארמון",
  VEHICLES: "רכב", MEDICAL: "רפואה", GENERAL: "כללי",
};

export default function AllocationsClient({
  items, companies, categories, allocations, signedCounts, warehouseStock, companyStock,
}: {
  items: Item[];
  companies: Company[];
  categories: CategoryInfo[];
  allocations: AllocationRow[];
  signedCounts: SignedCount[];
  warehouseStock: StockEntry[];
  companyStock: CompanyStockEntry[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

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

  const allocatedItemIds = useMemo(() => {
    const s = new Set<string>();
    for (const a of allocations) {
      if (a.quantity > 0) s.add(a.itemTypeId);
    }
    return s;
  }, [allocations]);

  const allocatedItems = useMemo(() => {
    let list = items.filter((i) => allocatedItemIds.has(i.id));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        (i.sku && i.sku.toLowerCase().includes(q)) ||
        (i.category?.name && i.category.name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [items, allocatedItemIds, search]);

  const grouped = useMemo(() => {
    const groups: { category: string; items: Item[] }[] = [];
    let current: { category: string; items: Item[] } | null = null;
    for (const item of allocatedItems) {
      const cat = item.category?.name ?? "ללא קטגוריה";
      if (!current || current.category !== cat) {
        current = { category: cat, items: [] };
        groups.push(current);
      }
      current.items.push(item);
    }
    return groups;
  }, [allocatedItems]);

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

  async function addItem(itemId: string) {
    // Add with quantity=1 for first company to create the allocation row
    await saveAlloc(companies[0].id, itemId, 1, true);
    setShowAddModal(false);
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

  return (
    <>
      {/* Toolbar */}
      <Card className="p-3 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowAddModal(true)}
            className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            + הוסף פריט
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-[180px]">
            <span className="text-sm text-slate-500">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="סינון לפי שם / מק״ט..."
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            )}
          </div>
          <span className="text-sm text-slate-500">
            {allocatedItemIds.size} פריטים עם הקצאה
          </span>
        </div>
      </Card>

      {/* Main table */}
      <Card className="overflow-auto relative max-h-[75vh]">
        <table className="w-full text-sm border-collapse min-w-[600px]">
          <thead className="sticky top-0 z-20">
            <tr className="bg-slate-100 border-b-2 border-slate-300">
              <th className="text-right px-3 py-2.5 font-bold text-slate-700 sticky right-0 bg-slate-100 z-30 min-w-[180px] border-l border-slate-200">
                פריט
              </th>
              <th className="text-center px-2 py-2.5 font-semibold text-slate-500 min-w-[65px] border-l border-slate-200">
                <div className="text-[10px]">במחסנים</div>
              </th>
              {companies.map((c) => (
                <th key={c.id} className="text-center px-2 py-2.5 font-bold text-slate-700 min-w-[110px] border-l border-slate-200">
                  <div>{c.name}</div>
                  <div className="text-[9px] font-normal text-slate-400">הקצאה | חתום | בפלוגה</div>
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
                saving={saving}
                saveAlloc={saveAlloc}
                toggleBlock={toggleBlock}
              />
            ))}
          </tbody>
        </table>
        {allocatedItems.length === 0 && (
          <div className="p-8 text-center text-slate-400">
            {search ? `לא נמצאו פריטים ל-"${search}"` : 'אין הקצאות עדיין. לחץ "+ הוסף פריט" כדי להתחיל.'}
          </div>
        )}
      </Card>

      <Card className="p-3 mt-3 bg-blue-50 border-blue-200 text-xs text-blue-900">
        💡 לחץ <strong>+ הוסף פריט</strong> כדי להגדיר הקצאה חדשה. בכל תא: כמות מוקצית למעלה, מתחת — חתום ומלאי בפלוגה.
        &nbsp;🚫 חסום = לא ניתן להחתים מעבר למכסה &nbsp;⚠️ התרעה = אזהרה בלבד.
      </Card>

      {/* Add Item Modal */}
      {showAddModal && (
        <AddItemModal
          items={items}
          categories={categories}
          allocatedItemIds={allocatedItemIds}
          onAdd={addItem}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </>
  );
}

/* ── Add Item Modal ── */

function AddItemModal({
  items, categories, allocatedItemIds, onAdd, onClose,
}: {
  items: Item[];
  categories: CategoryInfo[];
  allocatedItemIds: Set<string>;
  onAdd: (itemId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterWt, setFilterWt] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  const available = useMemo(() => {
    let list = items.filter((i) => !allocatedItemIds.has(i.id));
    if (filterWt) {
      list = list.filter((i) => i.category?.warehouseType === filterWt);
    }
    if (filterCategory) {
      list = list.filter((i) => i.categoryId === filterCategory);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        (i.sku && i.sku.toLowerCase().includes(q))
      );
    }
    return list;
  }, [items, allocatedItemIds, search, filterCategory, filterWt]);

  const filteredCategories = useMemo(() => {
    if (!filterWt) return categories;
    return categories.filter((c) => c.warehouseType === filterWt);
  }, [categories, filterWt]);

  const wtOptions = useMemo(() => {
    const types = new Set(categories.map((c) => c.warehouseType));
    return Array.from(types).sort();
  }, [categories]);

  async function handleAdd(itemId: string) {
    setAdding(itemId);
    await onAdd(itemId);
    setAdding(null);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-[10vh]" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800">הוסף פריט להקצאה</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם / מק״ט..."
            autoFocus
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-200 mb-2"
          />
          <div className="flex gap-2">
            <select
              value={filterWt}
              onChange={(e) => { setFilterWt(e.target.value); setFilterCategory(""); }}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs flex-1"
            >
              <option value="">כל המחסנים</option>
              {wtOptions.map((wt) => (
                <option key={wt} value={wt}>{WT_LABELS[wt] || wt}</option>
              ))}
            </select>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs flex-1"
            >
              <option value="">כל הקטגוריות</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {available.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">
              {search || filterCategory || filterWt ? "לא נמצאו פריטים" : "כל הפריטים כבר עם הקצאה"}
            </div>
          ) : (
            <div className="space-y-1">
              {available.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleAdd(item.id)}
                  disabled={adding !== null}
                  className="w-full text-right rounded-lg px-3 py-2 hover:bg-blue-50 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-800">{item.name}</div>
                    <div className="text-[10px] text-slate-400">
                      {item.category?.name && <span>{item.category.name}</span>}
                      {item.sku && <span className="font-mono mr-2">{item.sku}</span>}
                    </div>
                  </div>
                  {adding === item.id ? (
                    <span className="text-xs text-slate-400">מוסיף...</span>
                  ) : (
                    <span className="text-emerald-600 text-lg">+</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="p-3 border-t border-slate-100 text-center text-xs text-slate-400">
          {available.length} פריטים זמינים להוספה
        </div>
      </div>
    </div>
  );
}

/* ── Item Group (category rows in table) ── */

function ItemGroup({
  category, items, companies, allocMap, signedMap, warehouseMap, companyStockMap, blockMap, saving, saveAlloc, toggleBlock,
}: {
  category: string;
  items: Item[];
  companies: Company[];
  allocMap: Map<string, { quantity: number; blockOnExceed: boolean }>;
  signedMap: Map<string, number>;
  warehouseMap: Map<string, number>;
  companyStockMap: Map<string, number>;
  blockMap: Map<string, boolean>;
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
              {(() => {
                const totalAlloc = companies.reduce((sum, c) => sum + (allocMap.get(`${c.id}:${item.id}`)?.quantity ?? 0), 0);
                const overAlloc = totalAlloc > 0 && totalAlloc > whAvail;
                return (
                  <div className="flex flex-col items-center">
                    <span className={`text-xs font-mono font-bold ${whAvail > 0 ? "text-blue-600" : "text-slate-300"}`}>
                      {whAvail}
                    </span>
                    {overAlloc && (
                      <span className="text-[9px] text-amber-600 font-medium" title={`סה״כ הוקצו ${totalAlloc} אבל זמין רק ${whAvail}`}>
                        ⚠️ הוקצו {totalAlloc}
                      </span>
                    )}
                  </div>
                );
              })()}
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
                    <div className="flex items-center gap-1 text-[10px] font-mono">
                      <span className={`font-bold ${exceeded ? "text-rose-600" : full ? "text-amber-600" : signed > 0 ? "text-emerald-600" : "text-slate-300"}`}>
                        חתום {signed}
                      </span>
                      {inCompany > 0 && (
                        <span className="text-slate-400">| פלוגה {inCompany}</span>
                      )}
                    </div>
                  </div>
                </td>
              );
            })}
            <td className="px-1 py-1.5 text-center">
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
            </td>
          </tr>
        );
      })}
    </>
  );
}
