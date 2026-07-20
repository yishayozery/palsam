"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import SigPadInline from "./SigPadInline";
import { createExternalSignout } from "./external-actions";
import { useEscClose } from "@/lib/useEscClose";
import BarcodeScanner from "@/components/BarcodeScanner";
import type { ScanHit } from "@/app/(app)/scan-actions";
import { whyUnavailable, type ScanMsg } from "@/lib/scan-feedback";

type Unit = { id: string; itemTypeId: string; itemName: string; serial: string; statusId: string; lotQuantity: number | null; holderId?: string | null };
type Balance = { itemTypeId: string; itemName: string; unit: string; statusId: string; status: string; quantity: number; holderId?: string | null };

export default function ExternalSignModal({ warehouseId, warehouseName, units, balances, warehouses = [], defaultWarehouseId = null }: {
  warehouseId: string | null; warehouseName: string | null; units: Unit[]; balances: Balance[];
  warehouses?: { id: string; name: string }[]; defaultWarehouseId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // מחסן-מקור נבחר בתוך המודל — כדי שגם מי שאין לו מחסן פעיל (מפ"מ/אדמין) יוכל להחתים
  const [wh, setWh] = useState<string>(warehouseId ?? defaultWarehouseId ?? warehouses[0]?.id ?? "");
  const [name, setName] = useState("");
  const [personalId, setPersonalId] = useState("");
  const [phone, setPhone] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [serials, setSerials] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState<Record<string, number>>({}); // key = itemTypeId|statusId
  const [sig, setSig] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [scanMsg, setScanMsg] = useState<ScanMsg | null>(null);
  useEscClose(open, () => setOpen(false));

  const whName = warehouses.find((w) => w.id === wh)?.name ?? (wh && wh === warehouseId ? warehouseName : null);
  const total = serials.size + Object.values(qty).filter((n) => n > 0).length;
  // מסננים למחסן הנבחר (אם יש holderId בנתונים — אחרת המלאי כבר מסונן בשרת)
  const whUnits = useMemo(() => units.filter((u) => !u.holderId || !wh || u.holderId === wh), [units, wh]);
  const whBal = useMemo(() => balances.filter((b) => !b.holderId || !wh || b.holderId === wh), [balances, wh]);
  const filtUnits = useMemo(() => search ? whUnits.filter((u) => u.itemName.includes(search) || u.serial.includes(search)) : whUnits, [whUnits, search]);
  const filtBal = useMemo(() => search ? whBal.filter((b) => b.itemName.includes(search)) : whBal, [whBal, search]);

  function reset() { setName(""); setPersonalId(""); setPhone(""); setAffiliation(""); setSerials(new Set()); setQty({}); setSig(""); setSearch(""); setErr(null); }
  function toggleSerial(id: string) { setSerials((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  function setQtyVal(k: string, v: number, max: number) { setQty((q) => ({ ...q, [k]: Math.max(0, Math.min(max, v)) })); }

  /** 📷 סריקה → בחירה. הפריט חייב להיות במלאי המחסן שנבחר בראש המודל. */
  function handleScan(hit: ScanHit) {
    if (hit.kind === "NOT_FOUND") return;
    if (hit.kind === "SERIAL") {
      if (serials.has(hit.unitId)) { setScanMsg({ ok: false, text: `${hit.itemName} · ${hit.serialNumber} — כבר נבחר` }); return; }
      const u = whUnits.find((x) => x.id === hit.unitId);
      if (!u) { setScanMsg({ ok: false, text: `${hit.itemName} · ${hit.serialNumber} — ${whyUnavailable(hit)}` }); return; }
      toggleSerial(u.id);
      setScanMsg({ ok: true, text: `${u.itemName} · ${u.serial}` });
      return;
    }
    const opts = whBal.filter((b) => b.itemTypeId === hit.itemTypeId && b.quantity > 0);
    if (opts.length === 0) { setScanMsg({ ok: false, text: `${hit.itemName} — אין יתרה במחסן הנבחר` }); return; }
    const b = [...opts].sort((x, y) => y.quantity - x.quantity)[0];
    const k = `${b.itemTypeId}|${b.statusId}`;
    setQtyVal(k, (qty[k] ?? 0) + 1, b.quantity);
    setScanMsg({ ok: true, text: `${b.itemName} (${b.status})` });
  }

  async function submit() {
    setErr(null);
    if (!wh) { setErr("בחר מחסן מקור"); return; }
    if (!name.trim()) { setErr("נא להזין שם מלא"); return; }
    if (total === 0) { setErr("בחר לפחות פריט אחד"); return; }
    const qtyItems = Object.entries(qty).filter(([, n]) => n > 0).map(([k, n]) => { const [itemTypeId, statusId] = k.split("|"); return { itemTypeId, statusId, quantity: n }; });
    setBusy(true);
    const r = await createExternalSignout({ warehouseId: wh, recipient: { name, personalId, phone, affiliation }, serialUnitIds: [...serials], qtyItems, signature: sig || undefined });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    reset(); setOpen(false);
    router.push(`/transfers/${r.transferId}/document`);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="bg-white border border-indigo-300 text-indigo-700 rounded-lg px-3 py-2 text-xs md:text-sm font-medium hover:bg-indigo-50">
        🌐 החתמת חוץ
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-0 sm:p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-700 to-indigo-800 text-white p-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-lg">🌐 החתמת חוץ{whName ? ` — ${whName}` : ""}</h3>
                <p className="text-xs text-indigo-200 mt-0.5">מסירת ציוד לגורם חיצוני — יורד מהמלאי ומופק אישור</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-indigo-200 hover:text-white text-2xl">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* מחסן מקור — מוצג רק כשיש יותר ממחסן אחד לבחירה */}
              {warehouses.length > 0 && (
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">מחסן מקור</label>
                  <select value={wh} onChange={(e) => { setWh(e.target.value); setSerials(new Set()); setQty({}); }}
                    className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
                    <option value="">— בחר מחסן —</option>
                    {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
              )}

              {/* פרטי הגורם החיצוני */}
              <div className="grid grid-cols-2 gap-2">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם מלא *" className="border border-slate-300 rounded-lg px-2 py-2 text-sm col-span-2" />
                <input value={personalId} onChange={(e) => setPersonalId(e.target.value)} placeholder="מ.א" inputMode="numeric" className="border border-slate-300 rounded-lg px-2 py-2 text-sm" />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="נייד" inputMode="tel" className="border border-slate-300 rounded-lg px-2 py-2 text-sm" />
                <input value={affiliation} onChange={(e) => setAffiliation(e.target.value)} placeholder="שייכות (יחידה / גורם)" className="border border-slate-300 rounded-lg px-2 py-2 text-sm col-span-2" />
              </div>

              <div className="flex gap-2">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 חיפוש פריט…" className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                <BarcodeScanner label="📷 סרוק" compact onHit={handleScan} />
              </div>
              {scanMsg && (
                <div className={`rounded-lg px-2 py-1.5 text-xs ${scanMsg.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                  {scanMsg.ok ? "✅ נבחר:" : "⚠️"} {scanMsg.text}
                </div>
              )}

              {/* פריטים כמותיים */}
              {filtBal.length > 0 && (
                <div>
                  <div className="text-[11px] text-slate-500 mb-1">כמותי</div>
                  <div className="space-y-1">
                    {filtBal.map((b) => {
                      const k = `${b.itemTypeId}|${b.statusId}`;
                      return (
                        <div key={k} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2 py-1.5">
                          <span className="flex-1 text-sm">{b.itemName} <span className="text-[10px] text-slate-400">· {b.status} · יש {b.quantity}</span></span>
                          <button onClick={() => setQtyVal(k, (qty[k] ?? 0) - 1, b.quantity)} className="w-7 h-7 rounded border border-slate-300 text-lg">−</button>
                          <span className="w-6 text-center text-sm font-medium">{qty[k] ?? 0}</span>
                          <button onClick={() => setQtyVal(k, (qty[k] ?? 0) + 1, b.quantity)} className="w-7 h-7 rounded border border-slate-300 text-lg">+</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* פריטים סריאליים */}
              {filtUnits.length > 0 && (
                <div>
                  <div className="text-[11px] text-slate-500 mb-1">סריאלי / אצווה</div>
                  <div className="space-y-1 max-h-52 overflow-y-auto">
                    {filtUnits.map((u) => (
                      <label key={u.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer ${serials.has(u.id) ? "bg-indigo-50 border border-indigo-200" : "bg-slate-50"}`}>
                        <input type="checkbox" checked={serials.has(u.id)} onChange={() => toggleSerial(u.id)} className="accent-indigo-600" />
                        <span className="text-sm">{u.itemName} <span className="font-mono text-[11px] text-slate-500">{u.serial}</span>{u.lotQuantity && u.lotQuantity > 1 ? <span className="text-[10px] text-slate-400"> ×{u.lotQuantity}</span> : ""}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <SigPadInline label="חתימת מקבל החוץ" onChange={setSig} />
              {err && <p className="text-rose-600 text-sm text-center">{err}</p>}
            </div>

            <div className="border-t border-slate-200 p-3 bg-white shrink-0 flex items-center gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm">ביטול</button>
              <button onClick={submit} disabled={busy || total === 0 || !name.trim() || !wh} className="flex-1 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white rounded-lg px-4 py-2.5 text-sm font-bold">
                {busy ? "מפיק תעודה…" : `🌐 החתם והפק תעודה (${total})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
