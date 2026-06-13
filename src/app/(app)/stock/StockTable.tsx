"use client";

import { useState } from "react";
import { Card, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { TRACKING_METHOD } from "@/lib/labels";
import { WAREHOUSE_TYPE_SHORT } from "@/lib/rbac";
import { declareQtyForm, declareSerialsForm, declareLotForm, importSerials, importLots, editSerialNumber } from "./actions";

type Item = {
  id: string; name: string; sku: string | null; unit: string;
  trackingMethod: "QUANTITY" | "SERIAL" | "LOT" | "KIT";
  association: string;
  category: string | null;
  categoryId: string | null;
  warehouseType: "EQUIPMENT" | "COMMS" | "AMMO" | "ARMORY" | "VEHICLES" | "MEDICAL" | "GENERAL" | null;
  total: number;
  available: number;
  signedOnSoldiers: number;
  transit: number;
  units?: { id: string; serialNumber: string; lotQuantity: number | null; statusName: string; signedTo?: string | null }[];
};
type Cat = { id: string; name: string; warehouseType: string };
type Status = { id: string; name: string; isDefault: boolean };

const WH_OPTS = ["EQUIPMENT","COMMS","AMMO","ARMORY","VEHICLES","MEDICAL","GENERAL"] as const;

function UnitEditRow({ unit }: { unit: { id: string; serialNumber: string; lotQuantity: number | null; statusName: string; signedTo?: string | null } }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(unit.serialNumber);
  const [error, setError] = useState<string | null>(null);

  async function save(fd: FormData) {
    setError(null);
    try {
      await editSerialNumber(fd);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 text-sm py-1 px-2 hover:bg-slate-50 rounded">
        <span className="font-mono flex-1 truncate">{unit.serialNumber}</span>
        {unit.lotQuantity && <span className="text-xs text-slate-500">×{unit.lotQuantity}</span>}
        <span className="text-xs text-slate-500">[{unit.statusName}]</span>
        {unit.signedTo && <span className="text-xs text-blue-600">חתום: {unit.signedTo}</span>}
        <button type="button" onClick={() => { setValue(unit.serialNumber); setEditing(true); }}
          className="text-xs text-slate-400 hover:text-slate-800 px-1.5 py-0.5"
          title="ערוך מספר סריאל">
          ✎
        </button>
      </div>
    );
  }
  return (
    <form action={save} className="flex items-center gap-2 py-1 px-2 bg-amber-50 rounded">
      <input type="hidden" name="id" value={unit.id} />
      <input name="newSerial" value={value} onChange={(e) => setValue(e.target.value)} autoFocus required
        className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm font-mono" />
      <button className="text-xs bg-emerald-600 text-white rounded px-2 py-1">שמור</button>
      <button type="button" onClick={() => { setEditing(false); setError(null); }} className="text-xs text-slate-500">ביטול</button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </form>
  );
}

function ExpandedRow({ item, statuses }: { item: Item; statuses: Status[] }) {
  const defaultStatus = statuses.find((s) => s.isDefault)?.id ?? statuses[0]?.id ?? "";

  if (item.trackingMethod === "QUANTITY") {
    return (
      <form action={declareQtyForm} className="bg-slate-50 p-3 space-y-2 border-t border-slate-200">
        <input type="hidden" name="itemTypeId" value={item.id} />
        <p className="text-xs text-slate-600 mb-1">הוספת כמות נוספת (יתווסף לסך הקיים).</p>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-xs text-slate-500 mb-1">סטטוס</label>
            <select name="statusId" defaultValue={defaultStatus}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">כמות להוסיף</label>
            <input name="quantity" type="number" min="1" defaultValue="1"
              className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">מנפק</label>
            <input name="externalUnit" defaultValue="חטיבה" className="w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <button className="bg-emerald-600 text-white rounded-lg px-4 py-1.5 text-sm hover:bg-emerald-700">+ הוסף</button>
        </div>
      </form>
    );
  }

  if (item.trackingMethod === "SERIAL") {
    return (
      <div className="bg-slate-50 p-3 space-y-3 border-t border-slate-200">
        {/* רשימת SNs קיימים — לעריכת מספר */}
        {item.units && item.units.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <div className="text-xs font-semibold text-slate-600 mb-2">
              יחידות קיימות ({item.units.length}) — לחץ ✎ לתיקון מספר סריאל שהוקלד בטעות
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {item.units.map((u) => <UnitEditRow key={u.id} unit={u} />)}
            </div>
          </div>
        )}
        <form action={declareSerialsForm} className="space-y-2">
          <input type="hidden" name="itemTypeId" value={item.id} />
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <label className="block text-xs text-slate-500 mb-1">סטטוס</label>
              <select name="statusId" defaultValue={defaultStatus} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-64">
              <label className="block text-xs text-slate-500 mb-1">מספרי סריאל (אחד בשורה או מופרדים בפסיק)</label>
              <textarea name="serials" rows={2} placeholder="M4-1001&#10;M4-1002"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-mono" />
            </div>
            <button className="bg-emerald-600 text-white rounded-lg px-4 py-1.5 text-sm hover:bg-emerald-700">הוסף</button>
          </div>
        </form>
        <form action={importSerials} className="flex items-end gap-2 flex-wrap">
          <input type="hidden" name="itemTypeId" value={item.id} />
          <select name="statusId" defaultValue={defaultStatus} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input type="file" name="file" accept=".xlsx,.xls" required className="text-sm" />
          <button className="bg-slate-700 text-white rounded-lg px-3 py-1.5 text-sm">⬆ טען מקובץ</button>
          <a href="/stock/serials-template" className="text-xs text-blue-600 hover:underline">⬇ תבנית לדוגמה</a>
        </form>
      </div>
    );
  }

  if (item.trackingMethod === "LOT") {
    return (
      <div className="bg-slate-50 p-3 space-y-3 border-t border-slate-200">
        <form action={declareLotForm} className="flex items-end gap-2 flex-wrap">
          <input type="hidden" name="itemTypeId" value={item.id} />
          <div>
            <label className="block text-xs text-slate-500 mb-1">סטטוס</label>
            <select name="statusId" defaultValue={defaultStatus} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">מספר אצווה</label>
            <input name="lotNumber" required placeholder="GREN-2026-A"
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-mono w-40" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">כמות באצווה</label>
            <input name="quantity" type="number" min="1" defaultValue="1"
              className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <button className="bg-emerald-600 text-white rounded-lg px-4 py-1.5 text-sm hover:bg-emerald-700">הוסף אצווה</button>
        </form>
        <form action={importLots} className="flex items-end gap-2 flex-wrap">
          <input type="hidden" name="itemTypeId" value={item.id} />
          <select name="statusId" defaultValue={defaultStatus} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input type="file" name="file" accept=".xlsx,.xls" required className="text-sm" />
          <button className="bg-slate-700 text-white rounded-lg px-3 py-1.5 text-sm">⬆ טען מקובץ</button>
          <a href="/stock/lots-template" className="text-xs text-blue-600 hover:underline">⬇ תבנית לדוגמה</a>
        </form>
      </div>
    );
  }

  return null;
}

export default function StockTable({
  items, categories, statuses, initialQ, initialCategory, initialWarehouse,
}: {
  items: Item[]; categories: Cat[]; statuses: Status[];
  initialQ: string; initialCategory: string; initialWarehouse: string;
}) {
  const [search, setSearch] = useState(initialQ);
  const [cat, setCat] = useState(initialCategory);
  const [wh, setWh] = useState(initialWarehouse);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = items.filter((i) => {
    if (search.trim()) {
      const s = search.toLowerCase();
      if (!i.name.toLowerCase().includes(s) && !(i.sku || "").toLowerCase().includes(s)) return false;
    }
    if (cat && i.categoryId !== cat) return false;
    if (wh && i.warehouseType !== wh) return false;
    return true;
  });
  // אם נבחר מחסן — הצג רק קטגוריות של אותו מחסן
  const visibleCats = wh ? categories.filter((c) => c.warehouseType === wh) : categories;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-48">
          <label className="block text-xs text-slate-500 mb-1">חיפוש (שם / מק״ט)</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="הקלד..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">מחסן</label>
          <select value={wh} onChange={(e) => { setWh(e.target.value); setCat(""); }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">כל המחסנים</option>
            {WH_OPTS.map((v) => <option key={v} value={v}>{WAREHOUSE_TYPE_SHORT[v]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">קטגוריה</label>
          <select value={cat} onChange={(e) => setCat(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">הכל</option>
            {visibleCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {(search || cat || wh) && (
          <button onClick={() => { setSearch(""); setCat(""); setWh(""); }}
            className="text-sm text-slate-500 hover:text-slate-800 self-end pb-2">נקה</button>
        )}
        <span className="text-xs text-slate-500 self-end pb-2">{filtered.length} פריטים</span>
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState>אין פריטים תואמים. הקם פריטים בהגדרות פריטים.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>פריט</Th><Th>מק״ט</Th><Th>קטגוריה</Th><Th>שיטה</Th>
                <Th>שייכות</Th><Th>במלאי</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <>
                  <tr key={i.id} className={expanded === i.id ? "bg-slate-50" : ""}>
                    <Td className="font-medium">{i.name}</Td>
                    <Td className="font-mono text-xs text-slate-500">{i.sku ?? "—"}</Td>
                    <Td>{i.category ?? "—"}</Td>
                    <Td><Badge>{TRACKING_METHOD[i.trackingMethod]}</Badge></Td>
                    <Td>
                      <Badge className={i.association === "צבאי" ? "bg-slate-100 text-slate-600" : "bg-purple-100 text-purple-700"}>
                        {i.association}
                      </Badge>
                    </Td>
                    <Td className="font-bold text-slate-800">
                      <div title="זמין במחסן (לא חתום ולא במעבר)">
                        {i.available} <span className="text-xs text-slate-400 font-normal">{i.unit}</span>
                      </div>
                      {(i.signedOnSoldiers > 0 || i.transit > 0 || i.total !== i.available) && (
                        <div className="text-[10px] text-slate-500 font-normal mt-0.5 leading-tight">
                          {i.signedOnSoldiers > 0 && <span className="text-blue-600">🪖 {i.signedOnSoldiers} חתום · </span>}
                          {i.transit > 0 && <span className="text-amber-600">🚚 {i.transit} במעבר · </span>}
                          <span>סה״כ {i.total}</span>
                        </div>
                      )}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5 justify-end">
                        <a href={`/items/${i.id}/history`}
                          className="text-xs bg-white border border-slate-300 text-slate-700 rounded-md px-2.5 py-1 hover:bg-slate-50"
                          title="היסטוריית תנועות + ייצוא Excel">
                          🕘 היסטוריה
                        </a>
                      </div>
                    </Td>
                  </tr>
                  {false && expanded === i.id && (
                    <tr key={i.id + "-exp"}>
                      <td colSpan={7} className="p-0">
                        <ExpandedRow item={i} statuses={statuses} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
