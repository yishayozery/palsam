"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createCompanySign } from "./company-actions";
import { useEscClose } from "@/lib/useEscClose";
import BarcodeScanner from "@/components/BarcodeScanner";
import type { ScanHit } from "@/app/(app)/scan-actions";
import { whyUnavailable, type ScanMsg } from "@/lib/scan-feedback";

type Member = { id: string; name: string; role: string; personalNumber: string | null };
type Company = { id: string; name: string; members: Member[] };
type Unit = { id: string; itemTypeId: string; itemName: string; serial: string; status: string; statusId: string; signMode: "COMPANY" | "SOLDIER"; lotQuantity: number | null };
type Balance = { itemTypeId: string; itemName: string; unit: string; status: string; statusId: string; quantity: number; signMode: "COMPANY" | "SOLDIER" };

type PickedSerial = { unitId: string; itemName: string; serial: string; status: string; lotQty?: number; lotTotal?: number };
type PickedQty = { itemTypeId: string; itemName: string; unit: string; quantity: number; statusId: string; statusName: string };

type Step = "select" | "items" | "summary";

export default function CompanySignModal({
  companies, units, balances,
}: { companies: Company[]; units: Unit[]; balances: Balance[]; }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("select");
  const [companyId, setCompanyId] = useState("");
  const [recipientUserId, setRecipientUserId] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [pickedSerials, setPickedSerials] = useState<PickedSerial[]>([]);
  const [pickedQtys, setPickedQtys] = useState<PickedQty[]>([]);
  const [method, setMethod] = useState<"QR" | "LINK" | "ONSITE">("ONSITE");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  const [lotPicker, setLotPicker] = useState<{ unit: Unit; qty: number } | null>(null);
  const [scanMsg, setScanMsg] = useState<ScanMsg | null>(null);

  useEscClose(open && !lotPicker, () => {
    if (step === "summary") { setStep("items"); return; }
    if (step === "items") { setStep("select"); return; }
    reset(); setOpen(false);
  });

  const selectedCompany = companies.find((c) => c.id === companyId);
  const availableMembers = useMemo(() => {
    if (!selectedCompany) return [];
    const priority = (m: Member): number => {
      const t = (m.role || "");
      if (t.includes('רס"פ') || t.includes("רספ")) return 0;
      if (t.includes('מ"פ') || t.includes("מפ")) return 1;
      return 2;
    };
    return [...selectedCompany.members].sort((a, b) => priority(a) - priority(b));
  }, [selectedCompany]);

  useEffect(() => {
    if (!recipientUserId) {
      const firstValid = availableMembers.find((m) => !!m.personalNumber);
      if (firstValid) setRecipientUserId(firstValid.id);
    }
  }, [availableMembers, recipientUserId]);

  const validMembers = availableMembers.filter((m) => !!m.personalNumber);
  const invalidMembers = availableMembers.filter((m) => !m.personalNumber);

  const pickedSerialIds = new Set(pickedSerials.map((p) => p.unitId));
  const companyUnits = useMemo(() => units.filter((u) =>
    u.signMode === "COMPANY" &&
    (!itemSearch.trim() || u.itemName.toLowerCase().includes(itemSearch.toLowerCase()) || u.serial.toLowerCase().includes(itemSearch.toLowerCase()))
  ), [units, itemSearch]);
  const companyBalances = useMemo(() => balances.filter((b) =>
    b.signMode === "COMPANY" && b.quantity > 0 &&
    (!itemSearch.trim() || b.itemName.toLowerCase().includes(itemSearch.toLowerCase()))
  ), [balances, itemSearch]);

  const totalPicked = pickedSerials.length + pickedQtys.length;

  const toggleSerial = (u: Unit) => {
    if (pickedSerialIds.has(u.id)) {
      setPickedSerials((p) => p.filter((x) => x.unitId !== u.id));
      return;
    }
    if (u.lotQuantity && u.lotQuantity > 1) { setLotPicker({ unit: u, qty: u.lotQuantity }); return; }
    setPickedSerials((p) => [...p, { unitId: u.id, itemName: u.itemName, serial: u.serial, status: u.status }]);
  };
  const confirmLotPick = () => {
    if (!lotPicker) return;
    const { unit, qty } = lotPicker;
    if (qty < 1 || qty > (unit.lotQuantity ?? 1)) return;
    setPickedSerials((p) => [...p, { unitId: unit.id, itemName: unit.itemName, serial: unit.serial, status: unit.status, lotQty: qty, lotTotal: unit.lotQuantity ?? qty }]);
    setLotPicker(null);
  };
  /** 📷 סריקה → בחירה. פריט אישי (נשק) נחסם כאן — הוא עובר דרך "החתמת חייל". */
  function handleScan(hit: ScanHit) {
    if (hit.kind === "NOT_FOUND") return;
    if (hit.kind === "SERIAL") {
      if (pickedSerialIds.has(hit.unitId)) { setScanMsg({ ok: false, text: `${hit.itemName} · ${hit.serialNumber} — כבר נבחר` }); return; }
      const inScreen = units.find((x) => x.id === hit.unitId);
      if (inScreen && inScreen.signMode !== "COMPANY") {
        setScanMsg({ ok: false, text: `${hit.itemName} · ${hit.serialNumber} — פריט אישי, יש להחתים דרך ״החתמת חייל״` });
        return;
      }
      if (!inScreen) { setScanMsg({ ok: false, text: `${hit.itemName} · ${hit.serialNumber} — ${whyUnavailable(hit)}` }); return; }
      toggleSerial(inScreen);
      setScanMsg({ ok: true, text: `${inScreen.itemName} · ${inScreen.serial}` });
      return;
    }
    const opts = balances.filter((b) => b.itemTypeId === hit.itemTypeId && b.quantity > 0);
    if (opts.length === 0) { setScanMsg({ ok: false, text: `${hit.itemName} — אין יתרה במחסן` }); return; }
    if (!opts.some((b) => b.signMode === "COMPANY")) {
      setScanMsg({ ok: false, text: `${hit.itemName} — פריט אישי, יש להחתים דרך ״החתמת חייל״` });
      return;
    }
    const b = [...opts.filter((x) => x.signMode === "COMPANY")].sort((x, y) => y.quantity - x.quantity)[0];
    const cur = pickedQtys.find((p) => p.itemTypeId === b.itemTypeId && p.statusId === b.statusId);
    setQtyFor(b, (cur?.quantity ?? 0) + 1);
    setScanMsg({ ok: true, text: `${b.itemName} (${b.status})` });
  }

  const getQtyPick = (itemTypeId: string, statusId: string) =>
    pickedQtys.find((p) => p.itemTypeId === itemTypeId && p.statusId === statusId);

  const setQtyFor = (b: Balance, qty: number) => {
    if (qty <= 0) {
      setPickedQtys((p) => p.filter((x) => !(x.itemTypeId === b.itemTypeId && x.statusId === b.statusId)));
      return;
    }
    const clamped = Math.min(qty, b.quantity);
    const existing = getQtyPick(b.itemTypeId, b.statusId);
    if (existing) {
      setPickedQtys((p) => p.map((x) => x === existing ? { ...x, quantity: clamped } : x));
    } else {
      setPickedQtys((p) => [...p, { itemTypeId: b.itemTypeId, itemName: b.itemName, unit: b.unit, quantity: clamped, statusId: b.statusId, statusName: b.status }]);
    }
  };

  const reset = () => {
    setStep("select"); setCompanyId(""); setRecipientUserId(""); setItemSearch("");
    setPickedSerials([]); setPickedQtys([]); setMethod("ONSITE"); setError(null);
    setBusy(false); submittingRef.current = false;
  };

  async function submit() {
    if (submittingRef.current || busy) return;
    setError(null);
    if (!companyId) { setError("בחר פלוגה"); return; }
    if (!recipientUserId) { setError("לא נבחר נמען לחתימה"); return; }
    if (totalPicked === 0) { setError("בחר לפחות פריט אחד"); return; }
    submittingRef.current = true;
    setBusy(true);
    const fd = new FormData();
    fd.append("companyId", companyId);
    fd.append("recipientUserId", recipientUserId);
    fd.append("method", method);
    for (const s of pickedSerials) {
      fd.append("serial", s.unitId);
      if (s.lotQty && s.lotTotal && s.lotQty < s.lotTotal) {
        fd.append(`lotQty:${s.unitId}`, String(s.lotQty));
      }
    }
    for (const q of pickedQtys) {
      fd.append(`qty:${q.itemTypeId}:${q.statusId}`, String(q.quantity));
    }
    try {
      const result = await createCompanySign(fd);
      if (result.error || !result.token) {
        setError(result.error || "שגיאה לא ידועה ביצירת ההחתמה");
        submittingRef.current = false;
        setBusy(false);
        return;
      }
      const token = result.token;
      reset();
      setOpen(false);
      if (method === "ONSITE") router.push(`/sign/${token}`);
      else router.push(`/signatures/${token}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("NEXT_REDIRECT")) return;
      const friendly = msg.includes("Server Components render") || msg.includes("digest property")
        ? "שגיאת שרת לא צפויה. נסה שוב בעוד רגע, ואם הבעיה חוזרת — פנה למפ\"מ."
        : msg;
      setError(friendly);
      submittingRef.current = false;
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="bg-purple-700 hover:bg-purple-800 text-white rounded-lg px-4 py-2 text-sm font-medium">
        🏛️ החתמת פלוגה
      </button>
    );
  }

  const selectedRecipient = availableMembers.find((m) => m.id === recipientUserId);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white md:rounded-2xl rounded-t-2xl shadow-2xl w-full max-w-2xl max-h-[90dvh] md:max-h-[95vh] flex flex-col overflow-hidden relative" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {/* כותרת */}
        <div className="bg-gradient-to-r from-purple-700 to-purple-900 text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-lg">🏛️ החתמת פלוגה</h3>
            <p className="text-xs text-purple-200 mt-0.5">
              {step === "select" && "בחר פלוגה ונמען חותם"}
              {step === "items" && `${selectedCompany?.name ?? ""} — בחר פריטים להחתמה`}
              {step === "summary" && `סיכום — ${totalPicked} פריטים ל${selectedCompany?.name ?? ""}`}
            </p>
          </div>
          <button onClick={() => { reset(); setOpen(false); }} className="text-purple-200 hover:text-white text-2xl mr-2">✕</button>
        </div>

        {/* === שלב 1: בחירת פלוגה ונמען === */}
        {step === "select" && (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">פלוגה</label>
                <select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setRecipientUserId(""); }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm bg-white">
                  <option value="">— בחר פלוגה —</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.members.length} בעלי תפקיד)</option>)}
                </select>
              </div>

              {companyId && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">נמען חותם (מפקד הפלוגה)</label>
                  <select value={recipientUserId} onChange={(e) => setRecipientUserId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm bg-white">
                    <option value="">— בחר נמען —</option>
                    {validMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} (מ.א. {m.personalNumber}){m.role ? ` — ${m.role}` : ""}
                      </option>
                    ))}
                    {invalidMembers.length > 0 && <option disabled>──── ללא מ.א. (חסומים) ────</option>}
                    {invalidMembers.map((m) => (
                      <option key={m.id} value={m.id} disabled>🔒 {m.name} — חסר מ.א.</option>
                    ))}
                  </select>
                </div>
              )}

              {selectedCompany && availableMembers.length === 0 && (
                <div className="bg-rose-50 border-2 border-rose-300 rounded-lg p-3 text-sm text-rose-900">
                  <div className="font-bold mb-1">אין נמען לחתימה</div>
                  <p className="text-xs mb-2">
                    אין מפקד פעיל בפלוגה <b>{selectedCompany.name}</b>.
                  </p>
                  <div className="flex gap-2 text-xs">
                    <a href="/soldiers" className="bg-rose-700 text-white rounded px-3 py-1.5 hover:bg-rose-800">הגדר מפקדים ב-{selectedCompany.name}</a>
                    <a href="/org" className="border border-rose-300 rounded px-3 py-1.5 hover:bg-rose-100">/org</a>
                  </div>
                </div>
              )}
              {selectedCompany && availableMembers.length > 0 && validMembers.length === 0 && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3 text-sm text-amber-900">
                  <div className="font-bold mb-1">🔒 אין נמען תקף</div>
                  <p className="text-xs mb-2">
                    לכל בעלי התפקיד ב-<b>{selectedCompany.name}</b> חסר מ.א.
                  </p>
                  <div className="flex gap-2 text-xs">
                    <a href="/roster" className="bg-amber-700 text-white rounded px-3 py-1.5 hover:bg-amber-800">עדכן מ.א. ברוסטר</a>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 p-3 bg-white shrink-0 flex gap-2">
              <button onClick={() => { reset(); setOpen(false); }} className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm">ביטול</button>
              <button onClick={() => setStep("items")} disabled={!companyId || !recipientUserId}
                className="flex-1 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white rounded-lg px-4 py-2.5 text-sm font-bold">
                המשך לבחירת פריטים →
              </button>
            </div>
          </>
        )}

        {/* === שלב 2: בחירת פריטים (inline על כל פריט) === */}
        {step === "items" && (
          <>
            <div className="bg-white border-b border-slate-200 p-3 shrink-0">
              <div className="flex gap-2">
                <input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="🔍 חפש פריט..."
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" autoFocus />
                <BarcodeScanner label="📷 סרוק" compact onHit={handleScan} />
              </div>
              {scanMsg && (
                <div className={`mt-1 rounded-lg px-2 py-1.5 text-xs ${scanMsg.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                  {scanMsg.ok ? "✅ נבחר:" : "⚠️"} {scanMsg.text}
                </div>
              )}
              <p className="text-[11px] text-slate-500 mt-1">לחץ על פריט כדי לבחור. פריטים אישיים (נשק) — דרך &quot;החתמת חייל&quot;.</p>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {companyUnits.length === 0 && companyBalances.length === 0 && (
                <div className="text-center text-slate-400 py-10 text-sm">
                  אין פריטים שמתאימים להחתמת פלוגה.
                </div>
              )}

              {companyBalances.map((b) => {
                const pick = getQtyPick(b.itemTypeId, b.statusId);
                const isSelected = !!pick;
                return (
                  <div key={`${b.itemTypeId}-${b.statusId}`}
                    className={`border rounded-lg p-3 transition ${isSelected ? "bg-purple-50 border-purple-400 ring-1 ring-purple-300" : "bg-white border-slate-200"}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📦</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{b.itemName}</div>
                        <div className="text-xs text-slate-500">{b.status} · זמין: <b>{b.quantity}</b> {b.unit}</div>
                      </div>
                      {isSelected ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => setQtyFor(b, (pick?.quantity ?? 1) - 1)}
                            className="w-8 h-8 rounded-lg border border-purple-300 bg-white text-purple-700 font-bold text-lg flex items-center justify-center">−</button>
                          <input type="number" min={1} max={b.quantity} value={pick?.quantity ?? 1}
                            onChange={(e) => setQtyFor(b, parseInt(e.target.value) || 0)}
                            className="w-12 rounded-lg border border-purple-300 px-1 py-1 text-sm text-center font-bold" />
                          <button onClick={() => setQtyFor(b, (pick?.quantity ?? 1) + 1)}
                            className="w-8 h-8 rounded-lg border border-purple-300 bg-white text-purple-700 font-bold text-lg flex items-center justify-center">+</button>
                        </div>
                      ) : (
                        <button onClick={() => setQtyFor(b, 1)}
                          className="text-purple-600 font-bold text-2xl hover:scale-110 transition px-2">+</button>
                      )}
                    </div>
                  </div>
                );
              })}

              {companyUnits.map((u) => {
                const isLot = !!u.lotQuantity && u.lotQuantity > 1;
                const isPicked = pickedSerialIds.has(u.id);
                const pickedData = pickedSerials.find((p) => p.unitId === u.id);
                return (
                  <div key={u.id}
                    className={`border rounded-lg p-3 transition ${isPicked ? "bg-purple-50 border-purple-400 ring-1 ring-purple-300" : isLot ? "bg-white border-orange-200" : "bg-white border-slate-200"}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{isLot ? "💣" : "📦"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {u.itemName}
                          {isLot && <span className="mr-1 text-[10px] bg-orange-100 text-orange-800 rounded px-1.5 py-0.5">אצווה ×{u.lotQuantity}</span>}
                        </div>
                        <div className="text-xs text-slate-500 font-mono truncate">{isLot ? `לוט: ${u.serial}` : `SN: ${u.serial}`} · {u.status}</div>
                      </div>
                      {isPicked ? (
                        <div className="flex items-center gap-2">
                          {pickedData?.lotQty && (
                            <span className="text-xs bg-orange-100 text-orange-800 rounded px-2 py-0.5 font-bold">{pickedData.lotQty}/{pickedData.lotTotal}</span>
                          )}
                          <button onClick={() => toggleSerial(u)}
                            className="bg-purple-600 text-white rounded-lg px-3 py-1.5 text-xs font-bold">✓ נבחר</button>
                        </div>
                      ) : (
                        <button onClick={() => toggleSerial(u)}
                          className={`font-bold text-2xl hover:scale-110 transition px-2 ${isLot ? "text-orange-600" : "text-purple-600"}`}>+</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* דיאלוג אצווה */}
            {lotPicker && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10 p-3" onClick={() => setLotPicker(null)}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
                  <div className="bg-gradient-to-r from-orange-500 to-orange-700 text-white p-4">
                    <h3 className="font-bold text-lg">פריט אצווה</h3>
                    <p className="text-xs text-orange-100 mt-1">בחר כמות להחתמה</p>
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-3 flex items-start gap-3">
                      <span className="text-3xl">💣</span>
                      <div className="flex-1">
                        <div className="font-bold text-lg">{lotPicker.unit.itemName}</div>
                        <div className="text-xs text-slate-600 mt-1">מס׳ לוט: <span className="font-mono font-bold">{lotPicker.unit.serial}</span></div>
                        <div className="text-xs text-slate-600">סה״כ באצווה: <span className="font-bold text-orange-700">{lotPicker.unit.lotQuantity}</span></div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">כמות להחתמה</label>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: Math.max(1, p.qty - 1) } : p)}
                          className="w-10 h-10 rounded-lg border border-slate-300 text-lg font-bold">−</button>
                        <input type="number" min={1} max={lotPicker.unit.lotQuantity ?? 1} value={lotPicker.qty}
                          onChange={(e) => setLotPicker((p) => p ? { ...p, qty: Math.max(1, Math.min(lotPicker.unit.lotQuantity ?? 1, parseInt(e.target.value) || 1)) } : p)}
                          className="flex-1 rounded-lg border-2 border-orange-300 px-3 py-2 text-2xl font-bold text-center" autoFocus />
                        <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: Math.min(lotPicker.unit.lotQuantity ?? 1, p.qty + 1) } : p)}
                          className="w-10 h-10 rounded-lg border border-slate-300 text-lg font-bold">+</button>
                      </div>
                      <div className="flex justify-between mt-2 text-xs">
                        <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: 1 } : p)} className="text-blue-600 hover:underline">1 בלבד</button>
                        <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: Math.floor((lotPicker.unit.lotQuantity ?? 1) / 2) } : p)} className="text-blue-600 hover:underline">חצי</button>
                        <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: lotPicker.unit.lotQuantity ?? 1 } : p)} className="text-blue-600 hover:underline">הכל ({lotPicker.unit.lotQuantity})</button>
                      </div>
                      {lotPicker.qty < (lotPicker.unit.lotQuantity ?? 1) && (
                        <p className="text-[11px] text-amber-700 mt-2 bg-amber-50 rounded p-2">
                          האצווה תתפצל: <b>{lotPicker.qty}</b> יעברו לפלוגה, <b>{(lotPicker.unit.lotQuantity ?? 1) - lotPicker.qty}</b> יישארו במחסן.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="p-3 border-t border-slate-200 flex gap-2">
                    <button onClick={() => setLotPicker(null)} className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm">ביטול</button>
                    <button onClick={confirmLotPick} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white rounded-lg px-4 py-2.5 text-sm font-bold">
                      ✓ בחר ({lotPicker.qty})
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* footer שלב 2 */}
            <div className="border-t border-slate-200 p-3 bg-white shrink-0">
              <div className="flex items-center gap-2">
                <button onClick={() => setStep("select")} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm">
                  ← חזור
                </button>
                <div className="flex-1 text-center text-sm text-slate-600">
                  {totalPicked > 0 ? (
                    <span className="font-bold text-purple-700">{totalPicked} פריטים נבחרו</span>
                  ) : (
                    <span className="text-slate-400">לא נבחרו פריטים</span>
                  )}
                </div>
                <button onClick={() => setStep("summary")} disabled={totalPicked === 0}
                  className="bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white rounded-lg px-5 py-2.5 text-sm font-bold">
                  סיכום →
                </button>
              </div>
            </div>
          </>
        )}

        {/* === שלב 3: סיכום === */}
        {step === "summary" && (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* פרטי ההחתמה */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <div className="text-sm font-bold text-purple-900 mb-1">פרטי ההחתמה</div>
                <div className="text-sm text-slate-700">
                  <div>פלוגה: <b>{selectedCompany?.name}</b></div>
                  <div>נמען: <b>{selectedRecipient?.name}</b>{selectedRecipient?.role ? ` (${selectedRecipient.role})` : ""}</div>
                </div>
              </div>

              {/* רשימת פריטים */}
              <div>
                <div className="text-sm font-bold text-slate-700 mb-2">{totalPicked} פריטים להחתמה</div>
                <div className="space-y-1.5">
                  {pickedSerials.map((s) => (
                    <div key={s.unitId} className="bg-white border border-slate-200 rounded-lg p-2.5 flex items-center gap-2">
                      <span className="text-lg">{s.lotQty ? "💣" : "📦"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {s.itemName}
                          {s.lotQty && <span className="mr-1 text-[10px] bg-orange-100 text-orange-800 rounded px-1.5 py-0.5">×{s.lotQty}/{s.lotTotal}</span>}
                        </div>
                        <div className="text-xs text-slate-500 font-mono truncate">{s.lotQty ? `לוט: ${s.serial}` : `SN: ${s.serial}`}</div>
                      </div>
                      <button onClick={() => setPickedSerials((p) => p.filter((x) => x.unitId !== s.unitId))}
                        className="text-rose-400 hover:text-rose-700 text-sm px-1">✕</button>
                    </div>
                  ))}
                  {pickedQtys.map((q) => (
                    <div key={`${q.itemTypeId}-${q.statusId}`} className="bg-white border border-slate-200 rounded-lg p-2.5 flex items-center gap-2">
                      <span className="text-lg">📦</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{q.itemName}</div>
                        <div className="text-xs text-slate-500">{q.statusName}</div>
                      </div>
                      <span className="text-sm font-bold text-purple-700">{q.quantity} {q.unit}</span>
                      <button onClick={() => setPickedQtys((p) => p.filter((x) => !(x.itemTypeId === q.itemTypeId && x.statusId === q.statusId)))}
                        className="text-rose-400 hover:text-rose-700 text-sm px-1">✕</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* אופן חתימה */}
              <div>
                <div className="text-sm font-bold text-slate-700 mb-2">אופן חתימה</div>
                <div className="flex gap-1.5 text-xs">
                  {(["ONSITE", "QR", "LINK"] as const).map((m) => (
                    <label key={m} className={`flex-1 text-center px-2 py-2 rounded-lg border-2 cursor-pointer transition ${method === m ? "border-purple-700 bg-purple-100 font-bold" : "border-slate-200"}`}>
                      <input type="radio" checked={method === m} onChange={() => setMethod(m)} className="hidden" />
                      {m === "ONSITE" ? "✍️ שרבוט (כאן)" : m === "QR" ? "📱 QR" : "💬 WhatsApp"}
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  {method === "ONSITE" ? "✍️ ייפתח מסך חתימה ישירות במכשיר הזה" :
                   method === "QR" ? "📱 ייפתח QR שהנמען יסרוק" :
                   "💬 ייפתח לינק לשליחה בוואטסאפ"}
                </p>
              </div>
            </div>

            {/* footer שלב 3 */}
            <div className="border-t border-slate-200 p-3 bg-white shrink-0">
              {error && <div className="text-sm text-rose-700 font-medium mb-2">{error}</div>}
              <div className="flex items-center gap-2">
                <button onClick={() => setStep("items")} disabled={busy}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm disabled:opacity-50">
                  ← ערוך פריטים
                </button>
                <button onClick={submit} disabled={busy}
                  className="flex-1 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white rounded-lg px-5 py-2.5 text-sm font-bold flex items-center justify-center gap-2">
                  {busy ? (
                    <>
                      <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      שולח...
                    </>
                  ) : (
                    <>{method === "ONSITE" ? "✍️ עבור לחתימה" : "🚀 הפעל החתמה"}</>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
