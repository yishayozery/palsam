"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { exchangeWithCompany, exchangeWithBrigade } from "./actions";

type DefectiveItem = {
  itemTypeId: string; itemName: string; sku: string | null; unit: string;
  defectiveStatusId: string; defectiveStatusName: string;
  available: number; // כמות הבלאי הקיימת
};
type Status = { id: string; name: string; isDefault: boolean; isWear: boolean; isLoss: boolean };
type Company = { id: string; name: string };

// יתרת בלאי פר (פלוגה/מחסן) – פר פריט וסטטוס
type DefectiveByOwner = Record<string, DefectiveItem[]>;

type CartLine = {
  uid: number;
  itemTypeId: string; itemName: string; unit: string;
  defectiveStatusId: string; defectiveStatusName: string;
  workingStatusId: string;
  available: number; // כמות זמינה
  quantity: number;  // כמה להחליף
};

let UID = 1;

export default function ExchangeDefectiveModal({
  target, companies = [], defectiveByCompany = {}, defectiveAtMyWarehouse = [], statuses, requirePersonalId,
}: {
  target: "COMPANY" | "BRIGADE";
  companies?: Company[];
  // עבור החלפה לפלוגה: בלאי שיש לכל פלוגה
  defectiveByCompany?: DefectiveByOwner;
  // עבור החלפה מול חטיבה: בלאי שיש במחסן של המשתמש
  defectiveAtMyWarehouse?: DefectiveItem[];
  statuses: Status[];
  requirePersonalId: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [reason, setReason] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPersonalId, setRecipientPersonalId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const workingDefault = statuses.find((s) => s.isDefault && !s.isWear && !s.isLoss)?.id
                       ?? statuses.find((s) => !s.isWear && !s.isLoss)?.id
                       ?? "";

  // מקור הבלאי לפי המצב
  const sourceList: DefectiveItem[] = useMemo(() => {
    if (target === "BRIGADE") return defectiveAtMyWarehouse;
    if (target === "COMPANY" && companyId) return defectiveByCompany[companyId] ?? [];
    return [];
  }, [target, companyId, defectiveByCompany, defectiveAtMyWarehouse]);

  // פריטים שלא הוסיפו לעגלה עדיין
  const availableToAdd = useMemo(() => {
    const inCart = new Set(cart.map((c) => `${c.itemTypeId}|${c.defectiveStatusId}`));
    return sourceList.filter((d) => !inCart.has(`${d.itemTypeId}|${d.defectiveStatusId}`));
  }, [sourceList, cart]);

  function autoFillAll() {
    setCart(sourceList.map((d) => ({
      uid: UID++,
      itemTypeId: d.itemTypeId, itemName: d.itemName, unit: d.unit,
      defectiveStatusId: d.defectiveStatusId, defectiveStatusName: d.defectiveStatusName,
      workingStatusId: workingDefault,
      available: d.available, quantity: d.available,
    })));
  }

  function addToCart(d: DefectiveItem) {
    setCart((c) => [...c, {
      uid: UID++,
      itemTypeId: d.itemTypeId, itemName: d.itemName, unit: d.unit,
      defectiveStatusId: d.defectiveStatusId, defectiveStatusName: d.defectiveStatusName,
      workingStatusId: workingDefault,
      available: d.available, quantity: d.available,
    }]);
  }

  function updateQty(uid: number, q: number) {
    setCart((c) => c.map((l) => l.uid === uid ? { ...l, quantity: Math.max(0, Math.min(l.available, q)) } : l));
  }
  function removeLine(uid: number) {
    setCart((c) => c.filter((l) => l.uid !== uid));
  }

  function reset() {
    setCart([]); setReason(""); setRecipientName(""); setRecipientPersonalId(""); setError(null);
    if (target === "BRIGADE") setCompanyId("");
    else setCompanyId("");
  }

  // אוטו-מילוי בכל פתיחה ב-BRIGADE או בשינוי הפלוגה ב-COMPANY
  function onOpen() {
    reset();
    setOpen(true);
    if (target === "BRIGADE") {
      // מילוי אוטומטי של כל הבלאי שיש במחסן
      setCart(defectiveAtMyWarehouse.map((d) => ({
        uid: UID++,
        itemTypeId: d.itemTypeId, itemName: d.itemName, unit: d.unit,
        defectiveStatusId: d.defectiveStatusId, defectiveStatusName: d.defectiveStatusName,
        workingStatusId: workingDefault,
        available: d.available, quantity: d.available,
      })));
    }
  }

  function onPickCompany(id: string) {
    setCompanyId(id);
    setCart([]);
    if (id && target === "COMPANY") {
      const items = defectiveByCompany[id] ?? [];
      setCart(items.map((d) => ({
        uid: UID++,
        itemTypeId: d.itemTypeId, itemName: d.itemName, unit: d.unit,
        defectiveStatusId: d.defectiveStatusId, defectiveStatusName: d.defectiveStatusName,
        workingStatusId: workingDefault,
        available: d.available, quantity: d.available,
      })));
    }
  }

  async function submit() {
    setError(null);
    if (target === "COMPANY" && !companyId) { setError("בחר פלוגה"); return; }
    if (!recipientName.trim()) { setError("חובה למלא שם המקבל"); return; }
    if (requirePersonalId && recipientPersonalId.length < 5) { setError("הגדוד דורש מ.א. בכל מסירה — חובה למלא מ.א. תקף"); return; }
    const active = cart.filter((l) => l.quantity > 0);
    if (active.length === 0) { setError("הוסף לפחות פריט אחד עם כמות > 0"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      if (target === "COMPANY") fd.append("companyId", companyId);
      else fd.append("externalUnit", "חטיבה");
      fd.append("recipientName", recipientName.trim());
      if (target === "BRIGADE") fd.append("externalContact", recipientName.trim());
      if (recipientPersonalId) fd.append("recipientPersonalId", recipientPersonalId);
      if (reason) fd.append("reason", reason);
      active.forEach((l, i) => {
        fd.append(`line:${i}:itemTypeId`, l.itemTypeId);
        fd.append(`line:${i}:defectiveStatusId`, l.defectiveStatusId);
        fd.append(`line:${i}:workingStatusId`, l.workingStatusId);
        fd.append(`line:${i}:quantity`, String(l.quantity));
      });
      const res = target === "COMPANY" ? await exchangeWithCompany(fd) : await exchangeWithBrigade(fd);
      if (res?.error) { setError(res.error); return; }
      reset(); setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  const isCompany = target === "COMPANY";
  const buttonClass = isCompany ? "bg-orange-600 hover:bg-orange-700 text-white" : "bg-purple-600 hover:bg-purple-700 text-white";
  const headerClass = isCompany ? "from-orange-600 to-orange-800" : "from-purple-600 to-purple-800";
  const buttonLabel = isCompany ? "🔄 החלפת בלאי לפלוגה" : "🔄 החלפת בלאי מול החטיבה";
  const titleLabel = isCompany ? "החלפת בלאי לפלוגה" : "החלפת בלאי מול החטיבה";

  if (!open) {
    return (
      <button onClick={onOpen}
        className={`${buttonClass} rounded-lg px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-medium`}>
        {buttonLabel}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 md:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className={`bg-gradient-to-r ${headerClass} text-white p-4 flex items-center justify-between shrink-0`}>
          <div>
            <h3 className="font-bold text-lg">🔄 {titleLabel}</h3>
            <p className="text-xs text-white/80 mt-0.5">החלפת פריטי בלאי בתקין — תעודה אחת רב-פריטית</p>
          </div>
          <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white text-2xl">✕</button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {/* בורר פלוגה (רק לחילופי-פלוגה) */}
          {isCompany && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">פלוגה</label>
              <select value={companyId} onChange={(e) => onPickCompany(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">— בחר פלוגה —</option>
                {companies.map((c) => {
                  const count = (defectiveByCompany[c.id] ?? []).length;
                  return <option key={c.id} value={c.id}>{c.name} {count > 0 ? `(${count} פריטי בלאי)` : "(אין בלאי)"}</option>;
                })}
              </select>
            </div>
          )}

          {/* רשימת בלאי */}
          {(isCompany ? companyId : true) && sourceList.length === 0 ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center text-sm text-emerald-800">
              ✓ אין פריטי בלאי {isCompany ? "בפלוגה זו" : "במחסן שלך"} כרגע
            </div>
          ) : (isCompany ? companyId : true) ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-700">פריטי בלאי להחלפה ({cart.length})</h4>
                {availableToAdd.length > 0 && cart.length < sourceList.length && (
                  <button type="button" onClick={autoFillAll}
                    className="text-xs text-blue-600 hover:underline">+ הוסף את כל הבלאי</button>
                )}
              </div>

              <div className="space-y-2">
                {cart.map((l) => (
                  <div key={l.uid} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <div className="flex items-start gap-3">
                      <span className="text-xl">📦</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm">{l.itemName}</div>
                        <div className="text-[11px] text-slate-500">
                          סטטוס בלאי: <b>{l.defectiveStatusName}</b> · זמין: <b>{l.available}</b> {l.unit}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <label className="text-xs text-slate-700">כמות להחלפה:</label>
                          <button type="button" onClick={() => updateQty(l.uid, l.quantity - 1)}
                            className="w-7 h-7 rounded border border-slate-300 text-sm font-bold">−</button>
                          <input type="number" min={0} max={l.available} value={l.quantity}
                            onChange={(e) => updateQty(l.uid, parseInt(e.target.value) || 0)}
                            className="w-16 rounded border border-slate-300 px-2 py-1 text-sm text-center font-bold" />
                          <button type="button" onClick={() => updateQty(l.uid, l.quantity + 1)}
                            className="w-7 h-7 rounded border border-slate-300 text-sm font-bold">+</button>
                          <button type="button" onClick={() => updateQty(l.uid, l.available)}
                            className="text-xs text-blue-600 hover:underline px-1">הכל</button>
                        </div>
                      </div>
                      <button type="button" onClick={() => removeLine(l.uid)}
                        className="text-rose-500 hover:text-rose-700 text-sm">✕</button>
                    </div>
                  </div>
                ))}
              </div>

              {availableToAdd.length > 0 && (
                <details className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                  <summary className="text-xs font-semibold text-slate-700 cursor-pointer">
                    + הוסף פריט נוסף ({availableToAdd.length} עוד אפשרויות)
                  </summary>
                  <div className="mt-2 space-y-1">
                    {availableToAdd.map((d) => (
                      <button key={`${d.itemTypeId}-${d.defectiveStatusId}`} type="button" onClick={() => addToCart(d)}
                        className="w-full text-right p-2 hover:bg-amber-50 rounded text-sm flex items-center gap-2 border border-slate-200">
                        <span>📦</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{d.itemName}</div>
                          <div className="text-[10px] text-slate-500">{d.defectiveStatusName} · זמין {d.available}</div>
                        </div>
                        <span className="text-amber-600 font-bold">+</span>
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </>
          ) : null}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">סיבה (אופציונלי)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="החלפת ציוד בלוי..."
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
        </div>

        {/* 🔒 פרטי המקבל — בתחתית, חובה */}
        <div className="border-t-2 border-amber-300 bg-amber-50 p-3 shrink-0">
          <div className="text-xs font-bold text-amber-900 mb-1.5">🔒 פרטי המקבל (חובה)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">שם המקבל <span className="text-rose-600">*</span></label>
              <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)}
                placeholder={isCompany ? "שם הקצין/רס\"פ בפלוגה" : "שם הקצין החטיבתי"} required
                className={`w-full rounded-lg border-2 px-2 py-1.5 text-sm bg-white ${recipientName.trim() ? "border-emerald-300" : "border-amber-400"}`} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                מ.א. של המקבל {requirePersonalId && <span className="text-rose-600">*</span>}{!requirePersonalId && <span className="text-slate-400 text-[10px]">(אופציונלי)</span>}
              </label>
              <input value={recipientPersonalId} onChange={(e) => setRecipientPersonalId(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric" placeholder="1234567" required={requirePersonalId}
                className={`w-full rounded-lg border-2 px-2 py-1.5 text-sm font-mono bg-white ${requirePersonalId && recipientPersonalId.length < 5 ? "border-amber-400" : recipientPersonalId.length >= 5 ? "border-emerald-300" : "border-slate-300"}`} />
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 p-3 bg-white shrink-0">
          {error && <div className="text-sm text-rose-700 font-medium mb-2">⚠️ {error}</div>}
          <div className="flex items-center gap-2">
            <button onClick={() => { reset(); setOpen(false); }} disabled={busy}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm disabled:opacity-50">ביטול</button>
            <button onClick={submit}
              disabled={busy || cart.filter((l) => l.quantity > 0).length === 0 || !recipientName.trim() || (requirePersonalId && recipientPersonalId.length < 5)}
              className={`flex-1 ${buttonClass} disabled:opacity-50 rounded-lg px-5 py-2.5 text-sm font-bold flex items-center justify-center gap-2`}>
              {busy ? "שולח..." : `🔄 בצע החלפה (${cart.filter((l) => l.quantity > 0).length} שורות)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
