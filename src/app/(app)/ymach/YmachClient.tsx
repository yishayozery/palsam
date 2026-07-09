"use client";

import { useState, useTransition } from "react";
import { Card, Badge, EmptyState } from "@/components/ui";
import {
  saveWarehouse, deleteWarehouse,
  saveShelf, deleteShelf,
  assignItemToShelf, removeItemFromShelf,
  saveOperationalKit, deleteOperationalKit, updateKitItems,
  returnKit, duplicateKit,
} from "./actions";

type Shelf = {
  id: string; column: string; row: string; label: string | null;
  itemCount: number; kitCount: number;
  items: { itemTypeId: string; itemName: string; sku: string | null; quantity: number; notes: string | null }[];
  kits: { id: string; name: string; status: string }[];
};
type Warehouse = { id: string; name: string; notes: string | null; shelves: Shelf[] };
type EquipLocOption = { id: string; name: string };
type OpKit = {
  id: string; kitNumber: string | null; name: string; status: string; notes: string | null;
  shelfId: string | null; shelfLabel: string | null;
  equipmentLocationId: string | null; equipmentLocationName: string | null;
  assignedSoldierId: string | null; assignedSoldierName: string | null;
  items: { itemTypeId: string; itemName: string; sku: string | null; quantity: number }[];
};
type Baseline = { itemTypeId: string; itemName: string; sku: string | null; permanentQuantity: number };
type StockItem = { itemTypeId: string; itemName: string; sku: string | null; stockQuantity: number };
type ItemOption = { id: string; name: string; sku: string | null; trackingMethod: string };
type SoldierOption = { id: string; fullName: string; personalNumber: string | null };

type Props = {
  tab: string;
  holderId: string;
  companyName: string;
  companyLogo: string | null;
  battalionName: string;
  battalionLogo: string | null;
  warehouses: Warehouse[];
  operationalKits: OpKit[];
  baselines: Baseline[];
  stockItems: StockItem[];
  allItems: ItemOption[];
  soldiers: SoldierOption[];
  equipmentLocations: EquipLocOption[];
};

export default function YmachClient({
  tab, holderId, companyName, companyLogo, battalionName, battalionLogo,
  warehouses, operationalKits, baselines, stockItems, allItems, soldiers, equipmentLocations,
}: Props) {
  return (
    <div className="mt-4">
      {tab === "warehouses" && (
        <WarehousesTab warehouses={warehouses} holderId={holderId} />
      )}
      {tab === "items" && (
        <ItemsTab warehouses={warehouses} stockItems={stockItems} allItems={allItems} />
      )}
      {tab === "kits" && (
        <KitsTab
          holderId={holderId}
          kits={operationalKits}
          warehouses={warehouses}
          allItems={allItems}
          soldiers={soldiers}
          equipmentLocations={equipmentLocations}
        />
      )}
      {tab === "count" && (
        <CountTab warehouses={warehouses} baselines={baselines} />
      )}
      {tab === "reports" && (
        <ReportsTab
          companyName={companyName} companyLogo={companyLogo}
          battalionName={battalionName} battalionLogo={battalionLogo}
          warehouses={warehouses} operationalKits={operationalKits}
          baselines={baselines}
        />
      )}
    </div>
  );
}

// ===================== בחירת חייל עם חיפוש =====================
function SoldierSearch({
  name, soldiers, defaultValue, className,
}: {
  name: string;
  soldiers: SoldierOption[];
  defaultValue?: string;
  className?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(defaultValue ?? "");
  const selectedSoldier = soldiers.find((s) => s.id === selected);

  const filtered = q
    ? soldiers.filter((s) =>
        s.fullName.includes(q) || s.personalNumber?.includes(q)
      )
    : soldiers;

  return (
    <div className={`relative ${className ?? ""}`}>
      <input type="hidden" name={name} value={selected} />
      <input
        type="text"
        value={open ? q : selectedSoldier ? `${selectedSoldier.fullName}${selectedSoldier.personalNumber ? ` (${selectedSoldier.personalNumber})` : ""}` : ""}
        placeholder="חפש חייל..."
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); setQ(""); }}
        className="border rounded px-2 py-1.5 text-sm w-full"
      />
      {selected && !open && (
        <button
          type="button"
          onClick={() => { setSelected(""); setQ(""); }}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 text-xs"
        >
          ✕
        </button>
      )}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 bg-white border rounded shadow-lg max-h-40 overflow-y-auto mt-0.5">
          <button
            type="button"
            onClick={() => { setSelected(""); setOpen(false); setQ(""); }}
            className="block w-full text-right px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-50 border-b"
          >
            ללא שיוך
          </button>
          {filtered.slice(0, 20).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { setSelected(s.id); setOpen(false); setQ(""); }}
              className="block w-full text-right px-2 py-1.5 text-xs hover:bg-blue-50 border-b last:border-0"
            >
              {s.fullName} {s.personalNumber ? <span className="text-slate-400">({s.personalNumber})</span> : ""}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-2 py-2 text-xs text-slate-400 text-center">אין תוצאות</div>
          )}
        </div>
      )}
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
    </div>
  );
}

// ===================== טאב מחסנים ומדפים =====================
function WarehousesTab({ warehouses, holderId }: { warehouses: Warehouse[]; holderId: string }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [addShelfFor, setAddShelfFor] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-800">מחסנים ומדפים</h2>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-blue-700 hover:bg-blue-800 text-white rounded-lg px-3 py-2 text-xs font-bold"
        >
          + מחסן חדש
        </button>
      </div>

      {showAdd && (
        <Card className="p-4 bg-blue-50 border-blue-200">
          <form action={(fd) => { startTransition(async () => { await saveWarehouse(null, fd); setShowAdd(false); }); }}>
            <input type="hidden" name="holderId" value={holderId} />
            <div className="flex gap-2 items-end flex-wrap">
              <div>
                <label className="text-xs text-slate-600 block mb-1">שם מחסן</label>
                <input name="name" className="border rounded px-2 py-1.5 text-sm w-48" placeholder='מחסן ציוד ראשי' autoFocus />
              </div>
              <div>
                <label className="text-xs text-slate-600 block mb-1">הערה</label>
                <input name="notes" className="border rounded px-2 py-1.5 text-sm w-48" placeholder="אופציונלי" />
              </div>
              <button type="submit" disabled={pending} className="bg-blue-700 text-white px-3 py-1.5 rounded text-sm">
                {pending ? "שומר..." : "שמור"}
              </button>
              <button type="button" onClick={() => setShowAdd(false)} className="text-slate-500 text-sm px-2 py-1.5">
                ביטול
              </button>
            </div>
          </form>
        </Card>
      )}

      {warehouses.length === 0 && !showAdd && (
        <Card className="p-6">
          <EmptyState>
            <p>אין מחסני ימ״ח. צור מחסן ראשון כדי להתחיל.</p>
          </EmptyState>
        </Card>
      )}

      {warehouses.map((wh) => (
        <Card key={wh.id} className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                🏗️ {wh.name}
                <Badge className="bg-slate-100 text-slate-600">{wh.shelves.length} מדפים</Badge>
              </h3>
              {wh.notes && <p className="text-xs text-slate-500 mt-0.5">{wh.notes}</p>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setAddShelfFor(addShelfFor === wh.id ? null : wh.id)}
                className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded hover:bg-emerald-200"
              >
                + מדף
              </button>
              <button
                onClick={() => { if (confirm("למחוק מחסן?")) startTransition(async () => { await deleteWarehouse(wh.id); }); }}
                className="text-xs text-red-500 hover:text-red-700"
              >
                🗑️
              </button>
            </div>
          </div>

          {addShelfFor === wh.id && (
            <form
              className="mb-3 flex gap-2 items-end flex-wrap bg-emerald-50 rounded-lg p-3"
              action={(fd) => {
                fd.set("warehouseId", wh.id);
                startTransition(async () => { await saveShelf(null, fd); setAddShelfFor(null); });
              }}
            >
              <div>
                <label className="text-xs text-slate-600 block mb-1">עמודה</label>
                <input name="column" className="border rounded px-2 py-1.5 text-sm w-20" placeholder="A" autoFocus />
              </div>
              <div>
                <label className="text-xs text-slate-600 block mb-1">שורה</label>
                <input name="row" className="border rounded px-2 py-1.5 text-sm w-20" placeholder="1" />
              </div>
              <div>
                <label className="text-xs text-slate-600 block mb-1">תווית</label>
                <input name="label" className="border rounded px-2 py-1.5 text-sm w-36" placeholder="אופציונלי" />
              </div>
              <button type="submit" disabled={pending} className="bg-emerald-700 text-white px-3 py-1.5 rounded text-sm">
                שמור
              </button>
            </form>
          )}

          {wh.shelves.length === 0 ? (
            <p className="text-xs text-slate-400">אין מדפים. הוסף מדף ראשון.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {wh.shelves.map((sh) => {
                const totalItems = sh.items.reduce((s, i) => s + i.quantity, 0);
                return (
                  <div
                    key={sh.id}
                    className={`border-2 rounded-lg p-2 text-center cursor-help relative group ${
                      totalItems > 0 || sh.kitCount > 0
                        ? "border-blue-300 bg-blue-50"
                        : "border-slate-200 bg-slate-50"
                    }`}
                    title={sh.items.map((i) => `${i.itemName}: ${i.quantity}`).join("\n") || "ריק"}
                  >
                    <div className="font-mono text-xs text-slate-500">{sh.column}-{sh.row}</div>
                    {sh.label && <div className="text-[10px] text-slate-400 truncate">{sh.label}</div>}
                    <div className="text-xl font-bold text-slate-800 mt-1">{totalItems}</div>
                    <div className="text-[10px] text-slate-500">פריטים</div>
                    {sh.kitCount > 0 && (
                      <Badge className="absolute top-1 left-1 bg-amber-100 text-amber-700 text-[9px]">
                        {sh.kitCount} 🎒
                      </Badge>
                    )}
                    <button
                      onClick={() => { if (confirm(`למחוק מדף ${sh.column}-${sh.row}?`)) startTransition(async () => { await deleteShelf(sh.id); }); }}
                      className="absolute top-1 right-1 text-red-400 opacity-0 group-hover:opacity-100 text-[10px]"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ===================== טאב פריטים על מדפים =====================
function ItemsTab({
  warehouses, stockItems, allItems,
}: {
  warehouses: Warehouse[];
  stockItems: StockItem[];
  allItems: ItemOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [addFor, setAddFor] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState("");
  const [qty, setQty] = useState(1);
  const [q, setQ] = useState("");

  const allShelves = warehouses.flatMap((wh) =>
    wh.shelves.map((sh) => ({ ...sh, warehouseName: wh.name }))
  );

  // כל הפריטים שכבר על מדפים
  const onShelfMap = new Map<string, number>();
  for (const sh of allShelves) {
    for (const it of sh.items) {
      onShelfMap.set(it.itemTypeId, (onShelfMap.get(it.itemTypeId) ?? 0) + it.quantity);
    }
  }

  // השוואה למלאי (StockBalance)
  const comparison = stockItems.map((s) => ({
    ...s,
    onShelf: onShelfMap.get(s.itemTypeId) ?? 0,
    gap: s.stockQuantity - (onShelfMap.get(s.itemTypeId) ?? 0),
  }));

  const filtered = q
    ? comparison.filter((c) => c.itemName.includes(q) || c.sku?.includes(q))
    : comparison;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-slate-800">פריטים על מדפים (מול מלאי)</h2>
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש פריט..."
          className="border rounded px-2 py-1.5 text-sm w-48"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs">
            <tr>
              <th className="text-right p-2">פריט</th>
              <th className="text-right p-2">מק״ט</th>
              <th className="text-center p-2">מלאי</th>
              <th className="text-center p-2">על מדפים</th>
              <th className="text-center p-2">פער</th>
              <th className="text-center p-2">מיקום</th>
              <th className="text-center p-2">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.itemTypeId} className="border-b hover:bg-slate-50">
                <td className="p-2 font-medium">{row.itemName}</td>
                <td className="p-2 text-slate-500 font-mono text-xs">{row.sku ?? "—"}</td>
                <td className="p-2 text-center">{row.stockQuantity}</td>
                <td className="p-2 text-center font-bold">{row.onShelf}</td>
                <td className="p-2 text-center">
                  {row.gap > 0 ? (
                    <Badge className="bg-red-100 text-red-700">-{row.gap}</Badge>
                  ) : row.gap === 0 ? (
                    <Badge className="bg-emerald-100 text-emerald-700">✓</Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-700">+{Math.abs(row.gap)}</Badge>
                  )}
                </td>
                <td className="p-2 text-center text-xs text-slate-500">
                  {allShelves
                    .filter((sh) => sh.items.some((i) => i.itemTypeId === row.itemTypeId))
                    .map((sh) => `${sh.warehouseName} ${sh.column}-${sh.row}`)
                    .join(", ") || "—"}
                </td>
                <td className="p-2 text-center">
                  <button
                    onClick={() => setAddFor(addFor === row.itemTypeId ? null : row.itemTypeId)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    📌 שייך למדף
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-400">
                  {stockItems.length === 0 ? "אין מלאי בפלוגה." : "אין תוצאות."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {addFor && (
        <Card className="p-4 bg-blue-50 border-blue-200">
          <h3 className="text-sm font-bold mb-2">
            שייך "{stockItems.find((s) => s.itemTypeId === addFor)?.itemName}" למדף
          </h3>
          <div className="flex gap-2 items-end flex-wrap">
            <div>
              <label className="text-xs block mb-1">מדף</label>
              <select
                className="border rounded px-2 py-1.5 text-sm"
                defaultValue=""
                onChange={(e) => setSelectedItem(e.target.value)}
              >
                <option value="">בחר מדף</option>
                {allShelves.map((sh) => (
                  <option key={sh.id} value={sh.id}>
                    {sh.warehouseName} — {sh.column}-{sh.row} {sh.label ? `(${sh.label})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs block mb-1">כמות</label>
              <input
                type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))}
                className="border rounded px-2 py-1.5 text-sm w-20"
              />
            </div>
            <button
              disabled={pending || !selectedItem}
              onClick={() => {
                startTransition(async () => {
                  await assignItemToShelf(selectedItem, addFor!, qty);
                  setAddFor(null);
                });
              }}
              className="bg-blue-700 text-white px-3 py-1.5 rounded text-sm"
            >
              שייך
            </button>
            <button onClick={() => setAddFor(null)} className="text-sm text-slate-500 px-2">ביטול</button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ===================== טאב ארגזים מבצעיים =====================
function KitsTab({
  holderId, kits, warehouses, allItems, soldiers, equipmentLocations,
}: {
  holderId: string;
  kits: OpKit[];
  warehouses: Warehouse[];
  allItems: ItemOption[];
  soldiers: SoldierOption[];
  equipmentLocations: EquipLocOption[];
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingKit, setEditingKit] = useState<string | null>(null);
  const [editingDetails, setEditingDetails] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const allShelves = warehouses.flatMap((wh) =>
    wh.shelves.map((sh) => ({ id: sh.id, label: `${wh.name} — ${sh.column}-${sh.row}` }))
  );

  function printKit(kit: OpKit) {
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    const rows = kit.items.map((i) =>
      `<tr><td style="padding:4px 8px;border:1px solid #ccc">${i.itemName}${i.sku ? ` <small style="color:#888">(${i.sku})</small>` : ""}</td><td style="padding:4px 8px;border:1px solid #ccc;text-align:center">${i.quantity}</td></tr>`
    ).join("");
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>מארז ${kit.kitNumber ?? ""} — ${kit.name}</title>
<style>body{font-family:Arial,sans-serif;padding:20px}table{border-collapse:collapse;width:100%}th{background:#f1f5f9;padding:6px 8px;border:1px solid #ccc;text-align:right}h1{font-size:18px}h2{font-size:14px;color:#475569}.meta{font-size:13px;color:#64748b;margin:4px 0}@media print{button{display:none}}</style></head>
<body>
<h1>🎒 מארז: ${kit.name}</h1>
${kit.kitNumber ? `<p class="meta"><b>מספר מארז:</b> ${kit.kitNumber}</p>` : ""}
${kit.assignedSoldierName ? `<p class="meta"><b>חייל:</b> ${kit.assignedSoldierName}</p>` : `<p class="meta"><b>חייל:</b> לא משובץ</p>`}
${kit.shelfLabel ? `<p class="meta"><b>מדף:</b> ${kit.shelfLabel}</p>` : ""}
${kit.equipmentLocationName ? `<p class="meta"><b>מיקום תעסוקתי:</b> ${kit.equipmentLocationName}</p>` : ""}
<p class="meta"><b>סטטוס:</b> ${kit.status === "ISSUED" ? "אצל חייל" : "על המדף"}</p>
${kit.notes ? `<p class="meta"><b>הערה:</b> ${kit.notes}</p>` : ""}
<hr style="margin:12px 0">
<h2>תכולת המארז (${kit.items.length} פריטים)</h2>
<table><thead><tr><th>פריט</th><th style="width:60px">כמות</th></tr></thead><tbody>${rows}</tbody></table>
<p style="margin-top:16px;font-size:11px;color:#94a3b8">הודפס: ${new Date().toLocaleDateString("he-IL")} ${new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</p>
<button onclick="window.print()" style="margin-top:12px;padding:8px 20px;background:#0f172a;color:white;border:none;border-radius:6px;cursor:pointer">🖨️ הדפס</button>
</body></html>`);
    w.document.close();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-800">ארגזים מבצעיים</h2>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-3 py-2 text-xs font-bold"
        >
          + ארגז חדש
        </button>
      </div>

      {showAdd && (
        <Card className="p-4 bg-amber-50 border-amber-200">
          <form action={(fd) => { setFormError(null); startTransition(async () => { const r = await saveOperationalKit(null, fd); if (r?.error) { setFormError(r.error); return; } setShowAdd(false); }); }}>
            <input type="hidden" name="holderId" value={holderId} />
            {formError && <p className="text-red-600 text-sm mb-2">{formError}</p>}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs block mb-1">מספר מארז</label>
                <input name="kitNumber" className="border rounded px-2 py-1.5 text-sm w-full" placeholder="אוטומטי אם ריק" />
              </div>
              <div>
                <label className="text-xs block mb-1">שם מארז</label>
                <input name="name" className="border rounded px-2 py-1.5 text-sm w-full" placeholder="ארגז לוחם" autoFocus />
              </div>
              <div>
                <label className="text-xs block mb-1">מדף</label>
                <select name="shelfId" className="border rounded px-2 py-1.5 text-sm w-full">
                  <option value="">ללא מדף</option>
                  {allShelves.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs block mb-1">מיקום תעסוקתי</label>
                <select name="equipmentLocationId" className="border rounded px-2 py-1.5 text-sm w-full">
                  <option value="">ללא</option>
                  {equipmentLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs block mb-1">חייל</label>
                <SoldierSearch name="assignedSoldierId" soldiers={soldiers} />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="text-xs block mb-1">תיאור</label>
                <textarea name="notes" rows={2} className="border rounded px-2 py-1.5 text-sm w-full" placeholder="תיאור חופשי של תכולת / ייעוד הארגז" />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button type="submit" disabled={pending} className="bg-amber-600 text-white px-4 py-1.5 rounded text-sm">שמור</button>
              <button type="button" onClick={() => setShowAdd(false)} className="text-slate-500 text-sm">ביטול</button>
            </div>
          </form>
        </Card>
      )}

      {kits.length === 0 && !showAdd && (
        <Card className="p-6">
          <EmptyState><p>אין ארגזים מבצעיים. צור ארגז ראשון.</p></EmptyState>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {kits.map((kit) => (
          <Card key={kit.id} className={`p-4 ${kit.status === "ISSUED" ? "bg-amber-50 border-amber-200" : ""}`}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  🎒 {kit.kitNumber && <span className="text-amber-700 font-mono text-sm">#{kit.kitNumber}</span>}
                  {kit.name}
                  <Badge className={kit.status === "ISSUED" ? "bg-amber-200 text-amber-800" : "bg-emerald-100 text-emerald-700"}>
                    {kit.status === "ISSUED" ? "אצל חייל" : "על המדף"}
                  </Badge>
                </h3>
                {kit.assignedSoldierName && (
                  <p className="text-xs text-slate-500">👤 {kit.assignedSoldierName}</p>
                )}
                {kit.shelfLabel && (
                  <p className="text-xs text-slate-500">📍 {kit.shelfLabel}</p>
                )}
                {kit.equipmentLocationName && (
                  <p className="text-xs text-slate-500">🏕️ {kit.equipmentLocationName}</p>
                )}
                {kit.notes && <p className="text-[11px] text-slate-400 mt-1 whitespace-pre-line">{kit.notes}</p>}
              </div>
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => { setEditingDetails(editingDetails === kit.id ? null : kit.id); setEditingKit(null); }}
                  className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
                >
                  ✏️ עריכה
                </button>
                <button
                  onClick={() => { setEditingKit(editingKit === kit.id ? null : kit.id); setEditingDetails(null); }}
                  className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-200"
                >
                  📦 תכולה
                </button>
                {kit.status === "ISSUED" && (
                  <button
                    onClick={() => startTransition(async () => { await returnKit(kit.id); })}
                    className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded hover:bg-emerald-200"
                    disabled={pending}
                  >
                    📥 החזר
                  </button>
                )}
                <button
                  onClick={() => startTransition(async () => { const r = await duplicateKit(kit.id); if (r?.error) alert(r.error); })}
                  className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded hover:bg-slate-200"
                  disabled={pending}
                >
                  📋 שכפל
                </button>
                <button
                  onClick={() => printKit(kit)}
                  className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded hover:bg-slate-200"
                >
                  🖨️ הדפס
                </button>
                <button
                  onClick={() => { if (confirm("למחוק ארגז?")) startTransition(async () => { await deleteOperationalKit(kit.id); }); }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  🗑️
                </button>
              </div>
            </div>

            {/* עריכת פרטי מארז */}
            {editingDetails === kit.id && (
              <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="text-xs font-bold text-blue-800 mb-2">עריכת פרטי מארז</h4>
                <form action={(fd) => {
                  fd.append("id", kit.id);
                  setFormError(null);
                  startTransition(async () => { const r = await saveOperationalKit(null, fd); if (r?.error) { setFormError(r.error); return; } setEditingDetails(null); });
                }}>
                  <input type="hidden" name="holderId" value={holderId} />
                  {formError && <p className="text-red-600 text-sm mb-2">{formError}</p>}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] block mb-0.5">מספר</label>
                      <input name="kitNumber" defaultValue={kit.kitNumber ?? ""} className="border rounded px-2 py-1 text-xs w-full" />
                    </div>
                    <div>
                      <label className="text-[10px] block mb-0.5">שם</label>
                      <input name="name" defaultValue={kit.name} className="border rounded px-2 py-1 text-xs w-full" required />
                    </div>
                    <div>
                      <label className="text-[10px] block mb-0.5">מדף</label>
                      <select name="shelfId" defaultValue={kit.shelfId ?? ""} className="border rounded px-2 py-1 text-xs w-full">
                        <option value="">ללא</option>
                        {allShelves.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] block mb-0.5">מיקום תעסוקתי</label>
                      <select name="equipmentLocationId" defaultValue={kit.equipmentLocationId ?? ""} className="border rounded px-2 py-1 text-xs w-full">
                        <option value="">ללא</option>
                        {equipmentLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] block mb-0.5">חייל {kit.status === "ISSUED" && <span className="text-amber-600">(מארז אצל חייל — העברה תחזיר למדף)</span>}</label>
                      <SoldierSearch name="assignedSoldierId" soldiers={soldiers} defaultValue={kit.assignedSoldierId ?? ""} className="text-xs" />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <label className="text-[10px] block mb-0.5">תיאור</label>
                      <textarea name="notes" rows={2} defaultValue={kit.notes ?? ""} className="border rounded px-2 py-1 text-xs w-full" placeholder="תיאור חופשי" />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2 justify-end">
                    <button type="button" onClick={() => setEditingDetails(null)} className="text-xs text-slate-500">ביטול</button>
                    <button type="submit" disabled={pending} className="text-xs bg-blue-700 text-white px-3 py-1 rounded">
                      {pending ? "שומר..." : "✓ שמור"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* רשימת פריטים */}
            {kit.items.length > 0 ? (
              <div className="space-y-1">
                {kit.items.map((i) => (
                  <div key={i.itemTypeId} className="flex items-center justify-between text-xs bg-white rounded px-2 py-1 border">
                    <span>{i.itemName} {i.sku ? <span className="text-slate-400 font-mono">({i.sku})</span> : ""}</span>
                    <span className="font-bold">×{i.quantity}</span>
                  </div>
                ))}
                <div className="text-[10px] text-slate-400 text-left mt-1">
                  סה״כ {kit.items.reduce((s, i) => s + i.quantity, 0)} פריטים
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">ארגז ריק — לחץ "✏️ פריטים" להוספה</p>
            )}

            {/* עריכת פריטים בארגז */}
            {editingKit === kit.id && (
              <KitItemsEditor
                kitId={kit.id}
                currentItems={kit.items}
                allItems={allItems}
                onClose={() => setEditingKit(null)}
              />
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// עורך פריטים בארגז מבצעי
function KitItemsEditor({
  kitId, currentItems, allItems, onClose,
}: {
  kitId: string;
  currentItems: { itemTypeId: string; itemName: string; quantity: number }[];
  allItems: ItemOption[];
  onClose: () => void;
}) {
  const [items, setItems] = useState(
    currentItems.map((i) => ({ itemTypeId: i.itemTypeId, quantity: i.quantity }))
  );
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");

  const usedIds = new Set(items.map((i) => i.itemTypeId));
  const available = allItems.filter(
    (i) => !usedIds.has(i.id) && (q === "" || i.name.includes(q) || i.sku?.includes(q))
  );

  function addItem(itemTypeId: string) {
    setItems((prev) => [...prev, { itemTypeId, quantity: 1 }]);
    setQ("");
  }

  function removeItem(itemTypeId: string) {
    setItems((prev) => prev.filter((i) => i.itemTypeId !== itemTypeId));
  }

  function setQty(itemTypeId: string, qty: number) {
    setItems((prev) => prev.map((i) => i.itemTypeId === itemTypeId ? { ...i, quantity: qty } : i));
  }

  return (
    <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
      <h4 className="text-xs font-bold text-blue-800 mb-2">עריכת תכולת ארגז</h4>

      {/* פריטים קיימים */}
      <div className="space-y-1 mb-2">
        {items.map((item) => {
          const info = allItems.find((a) => a.id === item.itemTypeId);
          return (
            <div key={item.itemTypeId} className="flex items-center gap-2 text-xs bg-white rounded px-2 py-1 border">
              <span className="flex-1">{info?.name ?? item.itemTypeId}</span>
              <input
                type="number" min={1} value={item.quantity}
                onChange={(e) => setQty(item.itemTypeId, Number(e.target.value) || 1)}
                className="border rounded px-1 py-0.5 w-14 text-center text-xs"
              />
              <button onClick={() => removeItem(item.itemTypeId)} className="text-red-500 text-xs">✕</button>
            </div>
          );
        })}
      </div>

      {/* הוספת פריט */}
      <div className="flex gap-2 items-center mb-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="חפש פריט להוספה..."
          className="border rounded px-2 py-1 text-xs flex-1"
        />
      </div>
      {q && available.length > 0 && (
        <div className="bg-white border rounded max-h-32 overflow-y-auto mb-2">
          {available.slice(0, 10).map((item) => (
            <button
              key={item.id}
              onClick={() => addItem(item.id)}
              className="block w-full text-right px-2 py-1 text-xs hover:bg-blue-50 border-b last:border-0"
            >
              {item.name} {item.sku ? <span className="text-slate-400 font-mono">({item.sku})</span> : ""}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="text-xs text-slate-500">ביטול</button>
        <button
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              await updateKitItems(kitId, items);
              onClose();
            });
          }}
          className="text-xs bg-blue-700 text-white px-3 py-1 rounded"
        >
          {pending ? "שומר..." : "✓ שמור תכולה"}
        </button>
      </div>
    </div>
  );
}



// ===================== טאב ספירת ימ"ח =====================
function CountTab({
  warehouses, baselines,
}: {
  warehouses: Warehouse[];
  baselines: Baseline[];
}) {
  const allShelves = warehouses.flatMap((wh) =>
    wh.shelves.map((sh) => ({ ...sh, warehouseName: wh.name }))
  );

  // בנה טבלת ספירה: לכל פריט על מדף, צריך לספור
  const countRows: {
    shelfLabel: string; itemName: string; sku: string | null;
    expected: number; itemTypeId: string; shelfId: string;
  }[] = [];

  for (const sh of allShelves) {
    for (const it of sh.items) {
      countRows.push({
        shelfLabel: `${sh.warehouseName} ${sh.column}-${sh.row}`,
        itemName: it.itemName,
        sku: it.sku,
        expected: it.quantity,
        itemTypeId: it.itemTypeId,
        shelfId: sh.id,
      });
    }
  }

  // פריטים מהתקן שלא על מדפים כלל
  const onShelfItemIds = new Set(countRows.map((r) => r.itemTypeId));
  const missing = baselines.filter((b) => !onShelfItemIds.has(b.itemTypeId));

  return (
    <div className="space-y-4">
      <h2 className="font-bold text-slate-800">ספירת מחסן ימ״ח</h2>
      <p className="text-xs text-slate-500">
        ספירה מול התקן. סמן כמות בפועל לכל פריט על כל מדף. פערים מחושבים אוטומטית.
      </p>

      {countRows.length === 0 ? (
        <Card className="p-6">
          <EmptyState><p>אין פריטים על מדפים. שייך פריטים למדפים בטאב "פריטים".</p></EmptyState>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs">
              <tr>
                <th className="text-right p-2">מדף</th>
                <th className="text-right p-2">פריט</th>
                <th className="text-center p-2">צפוי</th>
                <th className="text-center p-2">בפועל</th>
                <th className="text-center p-2">פער</th>
              </tr>
            </thead>
            <tbody>
              {countRows.map((r, i) => (
                <CountRow key={`${r.shelfId}-${r.itemTypeId}`} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {missing.length > 0 && (
        <Card className="p-4 bg-rose-50 border-rose-200 mt-4">
          <h3 className="font-bold text-sm text-rose-800 mb-2">⚠️ פריטי תקן ללא מידוף ({missing.length})</h3>
          <div className="space-y-1">
            {missing.map((m) => (
              <div key={m.itemTypeId} className="text-xs flex justify-between">
                <span>{m.itemName}</span>
                <span className="font-bold text-rose-700">×{m.permanentQuantity}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function CountRow({ row }: { row: { shelfLabel: string; itemName: string; sku: string | null; expected: number } }) {
  const [actual, setActual] = useState<number | "">(row.expected);
  const gap = typeof actual === "number" ? actual - row.expected : 0;

  return (
    <tr className="border-b hover:bg-slate-50">
      <td className="p-2 font-mono text-xs text-slate-500">{row.shelfLabel}</td>
      <td className="p-2">{row.itemName}</td>
      <td className="p-2 text-center">{row.expected}</td>
      <td className="p-2 text-center">
        <input
          type="number"
          min={0}
          value={actual}
          onChange={(e) => setActual(e.target.value === "" ? "" : Number(e.target.value))}
          className={`border rounded px-1.5 py-1 text-sm w-16 text-center ${
            gap < 0 ? "border-red-300 bg-red-50" : gap > 0 ? "border-amber-300 bg-amber-50" : ""
          }`}
        />
      </td>
      <td className="p-2 text-center">
        {gap < 0 ? (
          <Badge className="bg-red-100 text-red-700">{gap}</Badge>
        ) : gap > 0 ? (
          <Badge className="bg-amber-100 text-amber-700">+{gap}</Badge>
        ) : (
          <Badge className="bg-emerald-100 text-emerald-700">✓</Badge>
        )}
      </td>
    </tr>
  );
}

// ===================== טאב דוחות =====================
function ReportsTab({
  companyName, companyLogo, battalionName, battalionLogo,
  warehouses, operationalKits, baselines,
}: {
  companyName: string; companyLogo: string | null;
  battalionName: string; battalionLogo: string | null;
  warehouses: Warehouse[];
  operationalKits: OpKit[];
  baselines: Baseline[];
}) {
  return (
    <div className="space-y-4">
      <h2 className="font-bold text-slate-800">דוחות מחסן ימ״ח</h2>
      <p className="text-xs text-slate-500">
        הפקת דוחות PDF מעוצבים עם סמלי יחידה, לשליחה במייל או וואטסאפ.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ReportCard
          icon="📋" title="מלאי למחסן סה״כ"
          desc="פריט, כמות, מידוף — סיכום כולל"
          onClick={() => generateReport("total", { companyName, companyLogo, battalionName, battalionLogo, warehouses, baselines })}
        />
        <ReportCard
          icon="🗄️" title="פריטים וכמות לפי מדף"
          desc="חלוקה לפי מדפים — מה נמצא איפה"
          onClick={() => generateReport("by-shelf", { companyName, companyLogo, battalionName, battalionLogo, warehouses, baselines })}
        />
        <ReportCard
          icon="🏗️" title="מבנה מחסן"
          desc="שרטוט ויזואלי של המידוף"
          onClick={() => generateReport("map", { companyName, companyLogo, battalionName, battalionLogo, warehouses, baselines })}
        />
        <ReportCard
          icon="👤" title="תעודת ציוד אישית"
          desc="פריט, כמות, שייכות לחייל — עם סמל וחותמת"
          onClick={() => generateReport("soldier", { companyName, companyLogo, battalionName, battalionLogo, warehouses, baselines, operationalKits })}
        />
      </div>
    </div>
  );
}

function ReportCard({ icon, title, desc, onClick }: { icon: string; title: string; desc: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full text-right">
      <Card className="p-4 hover:bg-slate-50 cursor-pointer transition-colors">
        <div className="flex items-start gap-3">
          <span className="text-2xl">{icon}</span>
          <div>
            <h3 className="font-bold text-sm text-slate-800">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
          </div>
          <span className="mr-auto text-slate-300">📄 PDF</span>
        </div>
      </Card>
    </button>
  );
}

// placeholder — PDF generation will be implemented as server action
function generateReport(type: string, data: Record<string, unknown>) {
  alert(`הפקת דוח "${type}" — ייושם בשלב הבא (PDF)`);
}
