"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, Table, Th, Td, EmptyState } from "@/components/ui";
import { upsertAllocation } from "./actions";

type Item = { id: string; name: string; sku: string | null; trackingMethod: string };
type Company = { id: string; name: string };
type AllocationRow = { companyId: string; itemTypeId: string; quantity: number; blockOnExceed: boolean };
type SignedCount = { companyId: string; itemTypeId: string; count: number };

export default function AllocationsClient({
  items, companies, allocations, signedCounts, selectedCompanyId,
}: {
  items: Item[];
  companies: Company[];
  allocations: AllocationRow[];
  signedCounts: SignedCount[];
  selectedCompanyId: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ key: string; ok: boolean } | null>(null);

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

  const filtered = useMemo(() => {
    return items.filter((i) => {
      const alloc = allocMap.get(`${selectedCompanyId}:${i.id}`);
      const signed = signedMap.get(`${selectedCompanyId}:${i.id}`) ?? 0;
      return (alloc && alloc.quantity > 0) || signed > 0;
    });
  }, [items, allocMap, signedMap, selectedCompanyId]);

  const unallocated = useMemo(() => {
    return items.filter((i) => {
      const alloc = allocMap.get(`${selectedCompanyId}:${i.id}`);
      const signed = signedMap.get(`${selectedCompanyId}:${i.id}`) ?? 0;
      return (!alloc || alloc.quantity === 0) && signed === 0;
    });
  }, [items, allocMap, signedMap, selectedCompanyId]);

  const [showAdd, setShowAdd] = useState(false);
  const [addItemId, setAddItemId] = useState("");
  const [addQty, setAddQty] = useState(1);

  async function saveAlloc(companyId: string, itemTypeId: string, quantity: number, blockOnExceed?: boolean) {
    const key = `${companyId}:${itemTypeId}`;
    setSaving(key); setFeedback(null);
    try {
      const fd = new FormData();
      fd.append("companyId", companyId);
      fd.append("itemTypeId", itemTypeId);
      fd.append("quantity", String(quantity));
      if (blockOnExceed !== undefined) fd.append("blockOnExceed", String(blockOnExceed));
      const res = await upsertAllocation(fd);
      if (res?.error) setFeedback({ key, ok: false });
      else { setFeedback({ key, ok: true }); router.refresh(); }
    } finally {
      setSaving(null);
      setTimeout(() => setFeedback(null), 2000);
    }
  }

  async function addNew() {
    if (!addItemId || addQty < 1) return;
    await saveAlloc(selectedCompanyId, addItemId, addQty, true);
    setShowAdd(false);
    setAddItemId("");
    setAddQty(1);
  }

  const companyName = companies.find((c) => c.id === selectedCompanyId)?.name ?? "";
  const totalAlloc = filtered.reduce((s, i) => s + (allocMap.get(`${selectedCompanyId}:${i.id}`)?.quantity ?? 0), 0);
  const totalSigned = filtered.reduce((s, i) => s + (signedMap.get(`${selectedCompanyId}:${i.id}`) ?? 0), 0);

  return (
    <>
      <Card className="p-3 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm font-medium text-slate-700">פלוגה:</label>
          <form method="GET" className="flex items-center gap-2">
            <select name="companyId" defaultValue={selectedCompanyId}
              onChange={(e) => { (e.target.form as HTMLFormElement).submit(); }}
              className="rounded-lg border-2 border-slate-300 px-3 py-1.5 text-sm">
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </form>
          <div className="text-xs text-slate-500 mr-auto flex gap-4">
            <span>🔫 הקצאה: <b className="text-blue-700">{totalAlloc}</b></span>
            <span>✍️ חתום: <b className="text-emerald-700">{totalSigned}</b> / {totalAlloc}</span>
          </div>
        </div>
      </Card>

      <Card>
        {filtered.length === 0 && !showAdd ? (
          <EmptyState>אין הקצאות ל{companyName}. לחץ &quot;הוסף פריט&quot; להגדיר.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>פריט</Th><Th>חתום / הקצאה</Th><Th>חריגה</Th><Th>פעולות</Th></tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const key = `${selectedCompanyId}:${i.id}`;
                const alloc = allocMap.get(key);
                const qty = alloc?.quantity ?? 0;
                const block = alloc?.blockOnExceed ?? true;
                const signed = signedMap.get(key) ?? 0;
                const exceeded = qty > 0 && signed > qty;
                const full = qty > 0 && signed === qty;
                const fb = feedback?.key === key ? feedback : null;
                return (
                  <tr key={i.id}>
                    <Td>
                      <div className="font-medium">{i.name}</div>
                      {i.sku && <div className="text-[10px] font-mono text-slate-400">{i.sku}</div>}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <span className={`font-mono text-lg font-bold ${exceeded ? "text-rose-600" : full ? "text-amber-600" : "text-emerald-700"}`}>
                          {signed}
                        </span>
                        <span className="text-slate-400 font-mono text-lg">/</span>
                        <input type="number" min={0} defaultValue={qty}
                          disabled={saving === key}
                          onBlur={(e) => {
                            const v = parseInt(e.target.value, 10) || 0;
                            if (v !== qty) saveAlloc(selectedCompanyId, i.id, v, block);
                          }}
                          className="w-16 rounded border border-slate-300 px-2 py-1 text-sm text-center font-mono disabled:opacity-50"
                        />
                      </div>
                    </Td>
                    <Td>
                      <button
                        onClick={() => saveAlloc(selectedCompanyId, i.id, qty, !block)}
                        disabled={saving === key}
                        className={`text-xs rounded-full px-2.5 py-1 font-medium transition-colors ${
                          block
                            ? "bg-rose-100 text-rose-700 hover:bg-rose-200"
                            : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                        } disabled:opacity-50`}
                        title={block ? "חריגה תחסום החתמה" : "חריגה תציג התראה בלבד"}
                      >
                        {block ? "🚫 חסימה" : "⚠️ התראה"}
                      </button>
                    </Td>
                    <Td>
                      {saving === key && <span className="text-xs text-slate-500">...</span>}
                      {fb?.ok && <span className="text-xs text-emerald-600">✓</span>}
                      {fb && !fb.ok && <span className="text-xs text-rose-600">⚠️</span>}
                      {qty > 0 && (
                        <button onClick={() => saveAlloc(selectedCompanyId, i.id, 0)}
                          className="text-xs text-rose-600 hover:text-rose-800 mr-2">✕ הסר</button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}

        {/* הוספת פריט חדש */}
        <div className="p-3 border-t border-slate-200">
          {showAdd ? (
            <div className="flex items-end gap-2 flex-wrap">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">פריט</label>
                <select value={addItemId} onChange={(e) => setAddItemId(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">בחר פריט...</option>
                  {unallocated.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">כמות</label>
                <input type="number" min={1} value={addQty} onChange={(e) => setAddQty(parseInt(e.target.value, 10) || 1)}
                  className="w-20 rounded border border-slate-300 px-2 py-1.5 text-sm text-center font-mono" />
              </div>
              <button onClick={addNew} disabled={!addItemId || saving !== null}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5 text-sm disabled:opacity-50">
                שמור
              </button>
              <button onClick={() => setShowAdd(false)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm">ביטול</button>
            </div>
          ) : (
            <button onClick={() => setShowAdd(true)}
              className="text-sm text-blue-600 hover:text-blue-800">
              ＋ הוסף פריט להקצאת {companyName}
            </button>
          )}
        </div>
      </Card>
    </>
  );
}
