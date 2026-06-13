"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { exchangeWithCompany, exchangeWithBrigade } from "./actions";

type Item = { id: string; name: string; sku: string | null; unit: string };
type Status = { id: string; name: string; isDefault: boolean; isWear: boolean; isLoss: boolean };
type Company = { id: string; name: string };

export default function ExchangeDefectiveModal({
  target, items, statuses, companies, defaultDefectiveQty,
}: {
  target: "COMPANY" | "BRIGADE";
  items: Item[];
  statuses: Status[];
  companies?: Company[]; // לכפתור פלוגה בלבד
  defaultDefectiveQty?: Map<string, number>; // הצעות כמות ראשונית פר itemId
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [companyId, setCompanyId] = useState(companies?.[0]?.id ?? "");
  const [itemId, setItemId] = useState("");
  const [defectiveStatusId, setDefectiveStatusId] = useState(statuses.find((s) => s.isWear)?.id ?? "");
  const [workingStatusId, setWorkingStatusId] = useState(statuses.find((s) => s.isDefault)?.id ?? statuses[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [externalContact, setExternalContact] = useState("");
  const [recipientPersonalId, setRecipientPersonalId] = useState("");
  const [externalUnit, setExternalUnit] = useState("חטיבה");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items.slice(0, 50);
    const q = search.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q) || (i.sku || "").toLowerCase().includes(q)).slice(0, 50);
  }, [items, search]);
  const selectedItem = items.find((i) => i.id === itemId);

  const reset = () => {
    setItemId(""); setQuantity(1); setReason(""); setSearch("");
    setExternalContact(""); setRecipientPersonalId("");
    setError(null);
  };

  async function submit() {
    setError(null);
    if (!itemId) { setError("בחר פריט"); return; }
    if (quantity < 1) { setError("כמות חייבת להיות לפחות 1"); return; }
    if (!defectiveStatusId || !workingStatusId) { setError("בחר את סטטוס הבלאי וסטטוס התקין"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("itemTypeId", itemId);
      fd.append("defectiveStatusId", defectiveStatusId);
      fd.append("workingStatusId", workingStatusId);
      fd.append("quantity", String(quantity));
      if (reason) fd.append("reason", reason);
      let res;
      if (target === "COMPANY") {
        if (!companyId) { setError("בחר פלוגה"); setBusy(false); return; }
        fd.append("companyId", companyId);
        res = await exchangeWithCompany(fd);
      } else {
        if (!externalContact.trim()) { setError("חובה למלא שם המקבל בחטיבה"); setBusy(false); return; }
        if (recipientPersonalId.length < 5) { setError("חובה למלא מ.א. תקף"); setBusy(false); return; }
        fd.append("externalUnit", externalUnit);
        fd.append("externalContact", externalContact);
        fd.append("recipientPersonalId", recipientPersonalId);
        res = await exchangeWithBrigade(fd);
      }
      if (res?.error) { setError(res.error); return; }
      reset(); setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  const isCompany = target === "COMPANY";
  const buttonClass = isCompany
    ? "bg-orange-600 hover:bg-orange-700 text-white"
    : "bg-purple-600 hover:bg-purple-700 text-white";
  const headerClass = isCompany ? "from-orange-600 to-orange-800" : "from-purple-600 to-purple-800";
  const buttonLabel = isCompany ? "🔄 החלפת בלאי לפלוגה" : "🔄 החלפת בלאי מול החטיבה";
  const titleLabel = isCompany ? "החלפת בלאי לפלוגה" : "החלפת בלאי מול החטיבה";
  const flowExplanation = isCompany
    ? "הפלוגה מחזירה ציוד בלאי, ומקבלת ציוד תקין במקומו. תיווצרנה 2 תעודות: קליטת בלאי (הושלמה) + ניפוק תקין (ממתינה לחתימת הפלוגה)."
    : "המחסן שולח ציוד בלאי לחטיבה ומקבל ציוד תקין במקומו. תיווצרנה 2 תעודות מושלמות: שליחת בלאי + קליטת תקין.";

  if (!open) {
    return (
      <button onClick={() => { reset(); setOpen(true); }}
        className={`${buttonClass} rounded-lg px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-medium`}>
        {buttonLabel}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 md:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className={`bg-gradient-to-r ${headerClass} text-white p-4 flex items-center justify-between shrink-0`}>
          <div>
            <h3 className="font-bold text-lg">🔄 {titleLabel}</h3>
            <p className="text-xs text-white/80 mt-0.5">תעודה אחת — קליטת בלאי + ניפוק תקין</p>
          </div>
          <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white text-2xl">✕</button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
            💡 {flowExplanation}
          </div>

          {isCompany && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">פלוגה</label>
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
                <option value="">— בחר פלוגה —</option>
                {companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">פריט</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חפש פריט..."
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm mb-1.5" />
            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg">
              {filteredItems.length === 0 ? (
                <div className="text-center text-slate-400 py-4 text-sm">אין פריטים מתאימים</div>
              ) : filteredItems.map((i) => (
                <button key={i.id} onClick={() => { setItemId(i.id); setSearch(i.name); }}
                  className={`w-full text-right p-2 hover:bg-orange-50 text-sm flex items-center gap-2 ${itemId === i.id ? "bg-orange-100" : ""}`}>
                  <span>📦</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{i.name}</div>
                    {i.sku && <div className="font-mono text-[10px] text-slate-400">{i.sku}</div>}
                  </div>
                </button>
              ))}
            </div>
            {selectedItem && (
              <div className="mt-1 text-xs text-emerald-700">✓ נבחר: <b>{selectedItem.name}</b></div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">סטטוס בלאי</label>
              <select value={defectiveStatusId} onChange={(e) => setDefectiveStatusId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
                {statuses.filter((s) => s.isWear || s.isLoss).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">סטטוס תקין</label>
              <select value={workingStatusId} onChange={(e) => setWorkingStatusId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
                {statuses.filter((s) => !s.isWear && !s.isLoss).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">כמות להחלפה {selectedItem && `(${selectedItem.unit})`}</label>
            <input type="number" min={1} value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-bold text-center" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">סיבה (אופציונלי)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="החלפת ציוד בלוי..."
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          </div>

          {!isCompany && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3 space-y-2">
              <div className="text-xs font-bold text-amber-900">🔒 פרטי הקצין החטיבתי המקבל (חובה)</div>
              <div className="grid grid-cols-2 gap-2">
                <input value={externalContact} onChange={(e) => setExternalContact(e.target.value)}
                  placeholder="שם הקצין" required
                  className="rounded-lg border-2 border-amber-400 bg-white px-2 py-1.5 text-sm" />
                <input value={recipientPersonalId} onChange={(e) => setRecipientPersonalId(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric" placeholder="מ.א. 1234567" required
                  className="rounded-lg border-2 border-amber-400 bg-white px-2 py-1.5 text-sm font-mono" />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 p-3 bg-white shrink-0">
          {error && <div className="text-sm text-rose-700 font-medium mb-2">⚠️ {error}</div>}
          <div className="flex items-center gap-2">
            <button onClick={() => { reset(); setOpen(false); }} disabled={busy}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm disabled:opacity-50">ביטול</button>
            <button onClick={submit} disabled={busy || !itemId || quantity < 1}
              className={`flex-1 ${buttonClass} disabled:opacity-50 rounded-lg px-5 py-2.5 text-sm font-bold flex items-center justify-center gap-2`}>
              {busy ? "שולח..." : `🔄 בצע החלפה (${quantity})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
