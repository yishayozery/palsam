"use client";

import { useState, useMemo } from "react";
import { Card, Badge, Table, Th, Td } from "@/components/ui";

type Row = {
  itemId: string; itemName: string; sku: string | null; trackingMethod: string;
  categoryId: string | null; categoryName: string | null;
  holderId: string | null; holderName: string | null;
  soldierName: string | null; soldierPN: string | null;
  serialNumber: string | null;
  location: string | null; shelf: string | null;
  expiryDate: string | null;
  quantity: number;
  lastCounted: number | null;
};

type Holder = { id: string; name: string; kind: string };
type Category = { id: string; name: string };

export default function ReportView({
  rows,
  holders,
  categories,
  lastCountDate,
}: {
  rows: Row[];
  holders: Holder[];
  categories: Category[];
  lastCountDate: string | null;
}) {
  const [holderFilter, setHolderFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [groupBy, setGroupBy] = useState<"holder" | "item" | "flat">("holder");

  const filtered = useMemo(() => {
    let result = rows;
    if (holderFilter) result = result.filter((r) => r.holderId === holderFilter);
    if (categoryFilter) result = result.filter((r) => r.categoryId === categoryFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((r) =>
        r.itemName.toLowerCase().includes(q) ||
        r.sku?.toLowerCase().includes(q) ||
        r.soldierName?.toLowerCase().includes(q) ||
        r.soldierPN?.includes(q) ||
        r.serialNumber?.toLowerCase().includes(q)
      );
    }
    if (onlyGaps) result = result.filter((r) => r.lastCounted !== null && r.lastCounted !== r.quantity);
    return result;
  }, [rows, holderFilter, categoryFilter, search, onlyGaps]);

  const totalQty = filtered.reduce((s, r) => s + r.quantity, 0);
  const gapCount = filtered.filter((r) => r.lastCounted !== null && r.lastCounted !== r.quantity).length;
  const serialCount = filtered.filter((r) => r.serialNumber).length;

  const grouped = useMemo(() => {
    if (groupBy === "flat") return { "": filtered };
    const key = groupBy === "holder" ? "holderName" : "itemName";
    const groups: Record<string, Row[]> = {};
    for (const r of filtered) {
      const g = (r as Record<string, unknown>)[key] as string ?? "ללא שיוך";
      (groups[g] ||= []).push(r);
    }
    return groups;
  }, [filtered, groupBy]);

  return (
    <div className="space-y-4">
      {/* סיכום */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 text-center">
          <div className="text-xs text-slate-500">רשומות</div>
          <div className="text-2xl font-bold text-slate-800">{filtered.length}</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xs text-slate-500">סה״כ כמות</div>
          <div className="text-2xl font-bold text-blue-700">{totalQty.toLocaleString()}</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xs text-slate-500">סריאליים</div>
          <div className="text-2xl font-bold text-violet-700">{serialCount}</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xs text-slate-500">פערים מספירה אחרונה</div>
          <div className={`text-2xl font-bold ${gapCount > 0 ? "text-rose-600" : "text-emerald-600"}`}>{gapCount}</div>
        </Card>
      </div>

      {lastCountDate && (
        <div className="text-xs text-slate-500 text-center">
          ספירה אחרונה: {new Date(lastCountDate).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })}
        </div>
      )}

      {/* פילטרים */}
      <Card className="p-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-40">
            <label className="block text-xs text-slate-500 mb-1">חיפוש</label>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="פריט, מק״ט, חייל, סריאלי..."
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">פלוגה / מחסן</label>
            <select value={holderFilter} onChange={(e) => setHolderFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
              <option value="">הכל</option>
              {holders.map((h) => <option key={h.id} value={h.id}>{h.kind === "WAREHOUSE" ? "🏪" : "🪖"} {h.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">קטגוריה</label>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
              <option value="">הכל</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">קיבוץ</label>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as "holder" | "item" | "flat")}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
              <option value="holder">לפי מחזיק</option>
              <option value="item">לפי פריט</option>
              <option value="flat">רשימה שטוחה</option>
            </select>
          </div>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer pb-1">
            <input type="checkbox" checked={onlyGaps} onChange={(e) => setOnlyGaps(e.target.checked)} className="w-4 h-4" />
            <span className="text-rose-700">פערים בלבד</span>
          </label>
        </div>
      </Card>

      {/* טבלה */}
      {Object.entries(grouped).map(([group, items]) => (
        <Card key={group}>
          {group && (
            <div className="px-4 pt-3 pb-1 flex items-center justify-between">
              <h3 className="font-bold text-slate-700">{group}</h3>
              <Badge className="bg-slate-100 text-slate-600">{items.length} פריטים · {items.reduce((s, r) => s + r.quantity, 0)} יח׳</Badge>
            </div>
          )}
          <Table>
            <thead>
              <tr>
                <Th>פריט</Th>
                <Th>מק״ט</Th>
                {groupBy !== "holder" && <Th>מחזיק</Th>}
                <Th>חייל</Th>
                <Th>סריאלי</Th>
                <Th>מיקום</Th>
                <Th className="text-center">כמות</Th>
                <Th className="text-center">ספירה אחרונה</Th>
                <Th>תפוגה</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => {
                const isGap = r.lastCounted !== null && r.lastCounted !== r.quantity;
                const isExpired = r.expiryDate && new Date(r.expiryDate) < new Date();
                return (
                  <tr key={`${r.itemId}-${r.holderId}-${r.serialNumber}-${i}`}
                    className={isGap ? "bg-rose-50" : ""}>
                    <Td>
                      <span className="font-medium text-sm">{r.itemName}</span>
                      {r.categoryName && <div className="text-[10px] text-slate-400">{r.categoryName}</div>}
                    </Td>
                    <Td className="text-xs text-slate-500 font-mono">{r.sku || "—"}</Td>
                    {groupBy !== "holder" && (
                      <Td className="text-xs">{r.holderName || "—"}</Td>
                    )}
                    <Td className="text-xs">
                      {r.soldierName ? (
                        <span className="text-blue-700">{r.soldierName}</span>
                      ) : "—"}
                    </Td>
                    <Td className="text-xs font-mono text-slate-500">{r.serialNumber || "—"}</Td>
                    <Td className="text-xs">
                      {r.location && <span className="text-emerald-700">{r.location}</span>}
                      {r.shelf && <span className="text-violet-600 mr-1">· {r.shelf}</span>}
                      {!r.location && !r.shelf && "—"}
                    </Td>
                    <Td className="text-center font-bold">{r.quantity}</Td>
                    <Td className="text-center">
                      {r.lastCounted !== null ? (
                        <span className={isGap ? "text-rose-700 font-bold" : "text-emerald-700"}>
                          {r.lastCounted}
                          {isGap && <span className="text-xs mr-1">({r.lastCounted - r.quantity > 0 ? "+" : ""}{r.lastCounted - r.quantity})</span>}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </Td>
                    <Td className="text-xs">
                      {r.expiryDate ? (
                        <span className={isExpired ? "text-rose-600 font-medium" : "text-slate-500"}>
                          {new Date(r.expiryDate).toLocaleDateString("he-IL")}
                        </span>
                      ) : "—"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ))}

      {filtered.length === 0 && (
        <Card className="p-8 text-center text-slate-400">אין תוצאות לפילטרים שנבחרו</Card>
      )}
    </div>
  );
}
