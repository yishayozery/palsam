"use client";

import { useState, useMemo, useRef } from "react";
import { createSignout, updateSoldierPhone } from "./actions";
import { signKit } from "../ymach/actions";
import { useEscClose } from "@/lib/useEscClose";

type Soldier = { id: string; name: string; pn: string | null; phone?: string | null; companyId?: string | null; companyName?: string | null; enlisted?: boolean; armoryEligible?: boolean };
type Company = { id: string; name: string };
type Unit = { id: string; itemTypeId: string; itemName: string; serial: string; status: string; statusId: string; lotQuantity: number | null; trackLocation?: boolean };
type Balance = { itemTypeId: string; itemName: string; unit: string; status: string; statusId: string; quantity: number; trackLocation?: boolean };
type KitLine = { name: string; qty: number; itemTypeId: string; trackingMethod: "QUANTITY" | "SERIAL" | "LOT" | "KIT" };
type Kit = { id: string; name: string; lines: KitLine[] };
type PendingKitPick = { itemTypeId: string; itemName: string; needed: number; kitName: string };
type Vehicle = { id: string; name: string; plate: string };
type EquipLocation = { id: string; name: string; isVehicle: boolean; companyId: string };

type CartSerial = { type: "serial"; unitId: string; itemName: string; serial: string; status: string; lotQty?: number; lotTotal?: number };
type CartQty = { type: "qty"; itemTypeId: string; itemName: string; unit: string; quantity: number; statusId: string; statusName: string; fromKit?: string };
type CartItem = CartSerial | CartQty;
type OpKitProp = { id: string; name: string; status: string; soldierId: string; soldierName: string; shelfLabel: string | null; items: { itemTypeId: string; itemName: string; sku: string | null; quantity: number }[] };

export default function SignoutModal({
  soldiers, companies = [], balances = [], units, kits, vehicles, equipmentLocations = [], lockCompanyId, isArmory = false, reopenForSoldierId, preselectSerialIds, operationalKits = [],
}: {
  soldiers: Soldier[]; companies?: Company[]; balances?: Balance[];
  units: Unit[]; kits: Kit[]; vehicles: Vehicle[];
  equipmentLocations?: EquipLocation[];
  lockCompanyId?: string | null;
  isArmory?: boolean;
  reopenForSoldierId?: string | null;
  preselectSerialIds?: string[];
  operationalKits?: OpKitProp[];
}) {
  const [open, setOpen] = useState(!!reopenForSoldierId);
  const [soldierId, setSoldierId] = useState(reopenForSoldierId ?? "");
  const [companyFilter, setCompanyFilter] = useState(lockCompanyId ?? "");
  const [soldierSearch, setSoldierSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>(() => {
    if (!preselectSerialIds?.length) return [];
    return preselectSerialIds
      .map((id) => units.find((u) => u.id === id))
      .filter((u): u is Unit => !!u)
      .map((u) => ({ type: "serial" as const, unitId: u.id, itemName: u.itemName, serial: u.serial, status: u.status }));
  });
  const [kitId, setKitId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [equipmentLocationId, setEquipmentLocationId] = useState("");
  const [method, setMethod] = useState<"QR" | "LINK" | "ONSITE">("ONSITE");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  // אצווה: דיאלוג בחירת כמות חלקית
  const [lotPicker, setLotPicker] = useState<{ unit: Unit; qty: number } | null>(null);
  // ערכה: תור פריטים סריאליים/אצוות שצריכים בחירה
  const [pendingKitPicks, setPendingKitPicks] = useState<PendingKitPick[]>([]);
  const [kitPickerSearch, setKitPickerSearch] = useState("");
  // התראת חוסר ערכה — לפני שמרחיבים: מפרטת מה חסר, מאפשרת המשך עם מה שיש
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneError, setPhoneError] = useState("");

  // מארזים מבצעיים — STORED, משויכים לחייל הנבחר
  const allSoldierOpKits = operationalKits.filter((k) => k.soldierId === soldierId && k.status === "STORED");
  const [includedOpKitIds, setIncludedOpKitIds] = useState<Set<string>>(new Set());
  const soldierOpKits = allSoldierOpKits.filter((k) => includedOpKitIds.has(k.id));
  const [opKitRemovedItems, setOpKitRemovedItems] = useState<Record<string, Record<string, number>>>({});

  const [kitShortageDialog, setKitShortageDialog] = useState<{
    kitId: string;
    kitName: string;
    shortages: { name: string; needed: number; available: number; itemTypeId: string }[];
    qtyLines: CartQty[];
    picks: PendingKitPick[];
  } | null>(null);

  // ESC סוגר — אבל לא בזמן שדיאלוג ילד פתוח
  useEscClose(open && !lotPicker && pendingKitPicks.length === 0, () => { reset(); setOpen(false); });

  const selectedSoldier = soldiers.find((s) => s.id === soldierId);
  const selectedKit = kits.find((k) => k.id === kitId);

  // חיילים מסוננים — לפי פלוגה+חיפוש
  const filteredSoldiers = useMemo(() => {
    return soldiers.filter((s) => {
      if (isArmory && !s.armoryEligible) return false;
      if (companyFilter && s.companyId !== companyFilter) return false;
      if (soldierSearch.trim()) {
        const q = soldierSearch.trim().toLowerCase();
        return s.name.toLowerCase().includes(q) || (s.pn ?? "").includes(q);
      }
      return true;
    }).slice(0, 200);
  }, [soldiers, companyFilter, soldierSearch, isArmory]);

  // פריטים זמינים — סריאלי + כמותי, מסוננים לפי חיפוש; ומסירים אלו שכבר בעגלה
  const cartSerialIds = new Set(cart.filter((c) => c.type === "serial").map((c) => (c as CartSerial).unitId));
  const availableUnits = useMemo(() => {
    return units.filter((u) => {
      if (cartSerialIds.has(u.id)) return false;
      if (itemSearch.trim()) {
        const q = itemSearch.trim().toLowerCase();
        return u.itemName.toLowerCase().includes(q) || u.serial.toLowerCase().includes(q);
      }
      return true;
    });
  }, [units, cartSerialIds, itemSearch]);
  const availableBalances = useMemo(() => {
    return balances.filter((b) => {
      if (b.quantity < 1) return false;
      if (itemSearch.trim()) {
        const q = itemSearch.trim().toLowerCase();
        return b.itemName.toLowerCase().includes(q);
      }
      return true;
    });
  }, [balances, itemSearch]);

  const addSerial = (u: Unit) => {
    // ⚠️ פריט אצווה (lotQuantity>1) → פותח דיאלוג כמות
    if (u.lotQuantity && u.lotQuantity > 1) {
      setLotPicker({ unit: u, qty: u.lotQuantity });
      return;
    }
    setCart((c) => [...c, { type: "serial", unitId: u.id, itemName: u.itemName, serial: u.serial, status: u.status }]);
  };
  const confirmLotPick = () => {
    if (!lotPicker) return;
    const { unit, qty } = lotPicker;
    if (qty < 1 || qty > (unit.lotQuantity ?? 1)) return;
    setCart((c) => [...c, {
      type: "serial", unitId: unit.id, itemName: unit.itemName, serial: unit.serial, status: unit.status,
      lotQty: qty < (unit.lotQuantity ?? 1) ? qty : undefined,
      lotTotal: unit.lotQuantity ?? qty,
    }]);
    setLotPicker(null);
    // אם זה היה מתוך ערכה ("בחירה לפריט ערכה") — מקדמים את התור
    if (pendingKitPicks.length > 0 && pendingKitPicks[0].itemTypeId === unit.itemTypeId) {
      advanceKitPick();
    }
  };

  const addQty = (b: Balance) => {
    const existing = cart.find((c) => c.type === "qty" && c.itemTypeId === b.itemTypeId && c.statusId === b.statusId);
    if (existing) {
      setCart((c) => c.map((x) => x === existing ? { ...(x as CartQty), quantity: Math.min(b.quantity, (x as CartQty).quantity + 1) } : x));
    } else {
      setCart((c) => [...c, { type: "qty", itemTypeId: b.itemTypeId, itemName: b.itemName, unit: b.unit, quantity: 1, statusId: b.statusId, statusName: b.status }]);
    }
  };

  const updateCartQty = (idx: number, n: number) => {
    setCart((c) => c.map((x, i) => i === idx ? { ...(x as CartQty), quantity: Math.max(1, n) } : x));
  };

  const removeCart = (idx: number) => setCart((c) => c.filter((_, i) => i !== idx));

  const reset = () => {
    setSoldierId(""); setCompanyFilter(lockCompanyId ?? ""); setSoldierSearch("");
    setItemSearch(""); setCart([]); setKitId(""); setVehicleId(""); setMethod("ONSITE"); setError(null); setIncludedOpKitIds(new Set());
    setBusy(false); submittingRef.current = false; setPhoneInput(""); setPhoneError("");
  };

  // ⚠️ בחירת ערכה — מפצלת לפריטים בעגלה:
  //   • QTY/LOT-template → שורת qty
  //   • SERIAL → מקפיץ פופ-אפ לבחירת SN ספציפי (או הקלדה ידנית)
  //   • LOT (lotQuantity>1 בפועל) → גם דורש בחירה
  // 🆕 בודק חוסרים לפני הרחבה — אם יש פריטים שאין במלאי, מקפיץ פופ-אפ
  const onPickKit = (newKitId: string) => {
    // הסרת ערכה קודמת
    setCart((c) => c.filter((x) => !(x.type === "qty" && (x as CartQty).fromKit === kitId)));
    setPendingKitPicks([]);
    setKitId(newKitId);
    if (!newKitId) return;
    const kit = kits.find((k) => k.id === newKitId);
    if (!kit) return;

    const qtyLines: CartQty[] = [];
    const picks: PendingKitPick[] = [];
    const shortages: { name: string; needed: number; available: number; itemTypeId: string }[] = [];

    for (const l of kit.lines) {
      // חישוב זמין במלאי לפי שיטת מעקב
      let available = 0;
      if (l.trackingMethod === "QUANTITY" || l.trackingMethod === "LOT") {
        available = balances.filter((b) => b.itemTypeId === l.itemTypeId).reduce((a, b) => a + b.quantity, 0);
      } else if (l.trackingMethod === "SERIAL") {
        available = units.filter((u) => u.itemTypeId === l.itemTypeId).length;
      }
      const willTake = Math.min(l.qty, available);

      if (willTake < l.qty) {
        shortages.push({ name: l.name, needed: l.qty, available, itemTypeId: l.itemTypeId });
      }
      if (willTake === 0) continue; // אין מה לקחת — מדלגים על הפריט

      if (l.trackingMethod === "QUANTITY" || l.trackingMethod === "LOT") {
        qtyLines.push({
          type: "qty",
          itemTypeId: l.itemTypeId,
          itemName: l.name, unit: "יח׳", quantity: willTake,
          statusId: "", statusName: "מתוך ערכה",
          fromKit: newKitId,
        });
      } else if (l.trackingMethod === "SERIAL") {
        picks.push({ itemTypeId: l.itemTypeId, itemName: l.name, needed: willTake, kitName: kit.name });
      }
    }

    // אם יש חוסרים → פותחים פופ-אפ אישור; אחרת — ישר מרחיבים
    if (shortages.length > 0) {
      setKitShortageDialog({ kitId: newKitId, kitName: kit.name, shortages, qtyLines, picks });
    } else {
      setCart((c) => [...c, ...qtyLines]);
      setPendingKitPicks(picks);
      setKitId("");
    }
  };

  // אחרי שהמשתמש אישר את החוסרים — מרחיבים את המה-שיש לעגלה
  const acceptKitShortage = () => {
    if (!kitShortageDialog) return;
    setCart((c) => [...c, ...kitShortageDialog.qtyLines]);
    setPendingKitPicks(kitShortageDialog.picks);
    setKitShortageDialog(null);
    setKitId("");
  };
  const cancelKitShortage = () => {
    setKitShortageDialog(null);
    setKitId(""); // מבטל את הערכה
  };

  const skipKitPick = () => {
    setPendingKitPicks((p) => p.slice(1));
    setKitPickerSearch("");
  };
  const advanceKitPick = () => {
    setPendingKitPicks((p) => {
      const cur = p[0];
      if (!cur) return p;
      if (cur.needed > 1) return [{ ...cur, needed: cur.needed - 1 }, ...p.slice(1)];
      return p.slice(1);
    });
    setKitPickerSearch("");
  };
  const confirmKitPick = (u: Unit) => {
    const cur = pendingKitPicks[0];
    if (!cur) return;
    if (u.lotQuantity && u.lotQuantity > 1) {
      // לאצווה — פותחים lotPicker; ההתקדמות בערכה תקרה רק אחרי אישור
      setLotPicker({ unit: u, qty: u.lotQuantity });
      return;
    }
    setCart((c) => [...c, { type: "serial", unitId: u.id, itemName: u.itemName, serial: u.serial, status: u.status }]);
    advanceKitPick();
  };
  // הקלדה ידנית: בודק שה-SN קיים במלאי הזמין של אותו פריט
  const tryManualSn = (sn: string) => {
    const cur = pendingKitPicks[0];
    if (!cur || !sn.trim()) return;
    const match = units.find((u) => u.itemTypeId === cur.itemTypeId && u.serial.toLowerCase() === sn.trim().toLowerCase());
    if (match) confirmKitPick(match);
  };

  async function submit() {
    if (submittingRef.current || busy) return;
    setError(null);
    if (!soldierId) { setError("בחר חייל"); return; }
    if (cart.length === 0 && !kitId && soldierOpKits.length === 0) { setError("הוסף לפחות פריט אחד או בחר ערכה"); return; }
    submittingRef.current = true;
    setBusy(true);

    // שלב 1: החתמת מארזים מבצעיים (STORED → ISSUED)
    for (const opKit of soldierOpKits) {
      const removed = opKitRemovedItems[opKit.id];
      const removedList = removed
        ? Object.entries(removed).filter(([, q]) => q > 0).map(([itemTypeId, quantity]) => ({ itemTypeId, quantity }))
        : undefined;
      const res = await signKit(opKit.id, removedList?.length ? removedList : undefined);
      if (res.error) { setError(`שגיאה במארז ${opKit.name}: ${res.error}`); submittingRef.current = false; setBusy(false); return; }
    }

    // אם אין פריטים בעגלה ואין ערכה — סיימנו (רק מארזים)
    if (cart.length === 0 && !kitId) {
      reset(); setOpen(false); return;
    }

    const fd = new FormData();
    fd.append("soldierId", soldierId);
    fd.append("method", method);
    if (kitId) fd.append("kitId", kitId);
    if (vehicleId) fd.append("vehicleId", vehicleId);
    if (equipmentLocationId) fd.append("equipmentLocationId", equipmentLocationId);
    for (const c of cart) {
      if (c.type === "serial") {
        fd.append("serial", c.unitId);
        // אם זו חלוקת אצווה — שולחים את הכמות כדי שהשרת יפצל
        if (c.lotQty && c.lotTotal && c.lotQty < c.lotTotal) {
          fd.append(`lotQty:${c.unitId}`, String(c.lotQty));
        }
      }
      else if (c.type === "qty") {
        // שורות כמותיות (ידניות או מערכה) — kitId נמחק אחרי ההרחבה, אז כולן נשלחות ישירות
        fd.append("qtyItem", c.itemTypeId);
        fd.append("qtyValue", String(c.quantity));
        fd.append("qtyStatus", c.statusId);
      }
    }
    try {
      await createSignout(fd);
      // הצלחה: השרת יפנה לדף החתימה. אם הגענו לכאן ללא redirect — נסגור.
      reset(); setOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // NEXT_REDIRECT הוא אובייקט מיוחד — אם זה זה, פשוט מתעלמים (הניתוב בוצע)
      if (msg.includes("NEXT_REDIRECT")) return;
      setError(msg);
      submittingRef.current = false;
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium">
        ✍️ החתמת חייל
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50 md:p-4">
      <div className="bg-white md:rounded-2xl rounded-t-2xl shadow-2xl w-full max-w-5xl max-h-[85dvh] md:max-h-[95vh] flex flex-col overflow-hidden relative" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {/* כותרת */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg">✍️ החתמת חייל על ציוד</h3>
            <p className="text-xs text-slate-300 mt-0.5">בחר חייל → הוסף פריטים מהמלאי לעגלה → אופן חתימה → שלח</p>
          </div>
          <button onClick={() => { reset(); setOpen(false); }} className="text-slate-300 hover:text-white text-2xl">✕</button>
        </div>

        {/* שורה 1: בחירת חייל — הכל בשורה אחת */}
        <div className="bg-blue-50 border-b border-blue-200 p-3 shrink-0">
          <div className="flex gap-2 items-end flex-wrap">
            {!lockCompanyId && companies.length > 0 && (
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">פלוגה</label>
                <select value={companyFilter} onChange={(e) => { setCompanyFilter(e.target.value); setSoldierId(""); }}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white min-w-32">
                  <option value="">כל הפלוגות</option>
                  {companies.map((c) => {
                    const cnt = soldiers.filter((s) => s.companyId === c.id).length;
                    return <option key={c.id} value={c.id}>{c.name} ({cnt})</option>;
                  })}
                </select>
              </div>
            )}
            <div className="flex-1 min-w-40">
              <label className="block text-[11px] text-slate-600 mb-0.5">חיפוש שם / מ.א.</label>
              <input value={soldierSearch} onChange={(e) => setSoldierSearch(e.target.value)} placeholder="הקלד..."
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white" />
            </div>
            <div className="flex-[2] min-w-48">
              <label className="block text-[11px] text-slate-600 mb-0.5">בחר חייל ({filteredSoldiers.length})</label>
              <select value={soldierId} onChange={(e) => { setSoldierId(e.target.value); setIncludedOpKitIds(new Set()); }}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
                <option value="">— {filteredSoldiers.length === 0 ? "אין חיילים בפלוגה" : "בחר חייל"} —</option>
                {filteredSoldiers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.pn ? ` (${s.pn})` : ""}{s.companyName ? ` · ${s.companyName}` : ""}{s.enlisted === false ? " ⏳ לא מאושר" : ""}
                  </option>
                ))}
              </select>
              {filteredSoldiers.length === 0 && (
                <p className="text-[10px] text-rose-600 mt-1">
                  {isArmory
                    ? <>⚠️ אין חיילים שהשלימו את תהליך הנשק. בדוק ב<a href="/armory-ineligibility" className="underline">דוח זכאות נשק</a>.</>
                    : <>⚠️ אין חיילים. הקם חיילים ב<a href="/soldiers" className="underline">חיילי הפלוגה</a> או <a href="/roster" target="_blank" className="underline">רוסטר השלישות</a>.</>}
                </p>
              )}
            </div>
          </div>
          {selectedSoldier && !selectedSoldier.phone && (
            <div className="mt-2 bg-amber-50 border-2 border-amber-300 rounded-lg p-2.5">
              <div className="text-xs font-bold text-amber-900 mb-1.5">📱 חסר מספר נייד ל{selectedSoldier.name}</div>
              <div className="flex gap-2 items-end">
                <input value={phoneInput} onChange={(e) => { setPhoneInput(e.target.value); setPhoneError(""); }}
                  placeholder="05XXXXXXXX" dir="ltr"
                  className="flex-1 rounded-lg border border-amber-400 px-2.5 py-1.5 text-sm font-mono bg-white" />
                <button disabled={phoneSaving || !phoneInput.trim()} onClick={async () => {
                  setPhoneSaving(true); setPhoneError("");
                  const res = await updateSoldierPhone(selectedSoldier.id, phoneInput);
                  setPhoneSaving(false);
                  if (!res.ok) { setPhoneError(res.error ?? "שגיאה"); return; }
                  selectedSoldier.phone = phoneInput.replace(/[-\s]/g, "");
                  setPhoneInput("");
                }}
                  className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg px-3 py-1.5 text-sm font-bold">
                  {phoneSaving ? "..." : "שמור"}
                </button>
              </div>
              {phoneError && <p className="text-xs text-rose-600 mt-1">{phoneError}</p>}
              <p className="text-[10px] text-amber-700 mt-1">נדרש לשליחת תעודת החתמה לחייל</p>
            </div>
          )}
        </div>

        {/* גוף: דסקטופ 2 עמודות; מובייל 1 עמודה - מלאי קודם (גלילה משלו), עגלה בהמשך */}
        <div className="flex-1 flex flex-col md:grid md:grid-cols-2 gap-0 overflow-y-auto md:overflow-hidden min-h-0">
          {/* === עמודה ימינה (בעברית "ימין" קודם) — עגלה === */}
          <div className="border-l border-slate-200 flex flex-col bg-slate-50 order-2 md:order-1 md:min-h-0">
            <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-white">
              <div className="font-bold text-slate-800">🛒 עגלת חתימה ({cart.length})</div>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-xs text-rose-500 hover:text-rose-700">נקה הכל</button>
              )}
            </div>
            <div className="flex-1 md:overflow-y-auto p-2 space-y-1.5">
              {/* מארזים מבצעיים — עם אפשרות לבחור אם לכלול */}
              {allSoldierOpKits.length > 0 && (
                <div className="mb-2">
                  <div className="text-xs font-bold text-emerald-700 mb-1">📦 מארזים מבצעיים ({allSoldierOpKits.length})</div>
                  {allSoldierOpKits.map((kit) => {
                    const included = includedOpKitIds.has(kit.id);
                    return (
                    <div key={kit.id} className={`border rounded-lg p-2 mb-1.5 ${included ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"}`}>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={included} onChange={(e) => {
                          setIncludedOpKitIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(kit.id); else next.delete(kit.id);
                            return next;
                          });
                        }} className="w-4 h-4 rounded accent-emerald-600" />
                        <div className="flex-1">
                          <div className="font-medium text-sm text-emerald-800">{kit.name}</div>
                          {kit.shelfLabel && <div className="text-[10px] text-emerald-600">📍 {kit.shelfLabel}</div>}
                        </div>
                      </label>
                      {included && (
                      <div className="mt-1 space-y-0.5 mr-6">
                        {kit.items.map((item) => {
                          const removedQty = opKitRemovedItems[kit.id]?.[item.itemTypeId] ?? 0;
                          const effectiveQty = item.quantity - removedQty;
                          return (
                            <div key={item.itemTypeId} className="flex items-center justify-between text-xs">
                              <span className={effectiveQty <= 0 ? "line-through text-slate-400" : "text-slate-700"}>
                                {item.itemName} {item.sku ? `(${item.sku})` : ""}
                              </span>
                              <div className="flex items-center gap-1">
                                <span className={effectiveQty <= 0 ? "text-slate-400" : "text-emerald-700 font-medium"}>{effectiveQty}</span>
                                {effectiveQty > 0 && (
                                  <button
                                    onClick={() => setOpKitRemovedItems((prev) => ({
                                      ...prev,
                                      [kit.id]: { ...prev[kit.id], [item.itemTypeId]: removedQty + 1 },
                                    }))}
                                    className="text-rose-400 hover:text-rose-600 text-[10px]"
                                    title="הורד פריט"
                                  >✕</button>
                                )}
                                {removedQty > 0 && (
                                  <button
                                    onClick={() => setOpKitRemovedItems((prev) => ({
                                      ...prev,
                                      [kit.id]: { ...prev[kit.id], [item.itemTypeId]: removedQty - 1 },
                                    }))}
                                    className="text-emerald-400 hover:text-emerald-600 text-[10px]"
                                    title="החזר פריט"
                                  >↩</button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
              {cart.length === 0 && allSoldierOpKits.length === 0 ? (
                <div className="text-center text-slate-400 py-6 md:py-10 text-sm">
                  עגלה ריקה.<br />לחץ על פריט במלאי כדי להוסיף.
                </div>
              ) : cart.length === 0 ? null : cart.map((c, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-lg p-2 flex items-center gap-2">
                  {c.type === "serial" ? (
                    <>
                      <span className="text-lg">{c.lotQty ? "💣" : "🔫"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {c.itemName}
                          {c.lotQty && (
                            <span className="mr-1 text-[10px] bg-orange-100 text-orange-800 rounded px-1.5 py-0.5">
                              אצווה · {c.lotQty}/{c.lotTotal}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 font-mono truncate">
                          {c.lotQty ? `לוט: ${c.serial}` : `SN: ${c.serial}`} · {c.status}
                        </div>
                      </div>
                      {c.lotQty && (
                        <input type="number" min={1} max={c.lotTotal} value={c.lotQty}
                          onChange={(e) => {
                            const n = Math.max(1, Math.min(c.lotTotal ?? 1, parseInt(e.target.value) || 1));
                            setCart((arr) => arr.map((x, j) => j === i ? { ...(x as CartSerial), lotQty: n } : x));
                          }}
                          className="w-14 rounded border border-slate-300 px-1.5 py-1 text-sm text-center" />
                      )}
                    </>
                  ) : (
                    <>
                      <span className="text-lg">{c.fromKit ? "🎒" : "📦"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{c.itemName}{c.fromKit && <span className="text-[10px] text-violet-600 mr-1">(מערכה)</span>}</div>
                        <div className="text-xs text-slate-500">{c.statusName}</div>
                      </div>
                      <input type="number" min={1} value={c.quantity}
                        onChange={(e) => updateCartQty(i, parseInt(e.target.value) || 1)}
                        className="w-16 rounded border border-slate-300 px-1.5 py-1 text-sm text-center" />
                      <span className="text-xs text-slate-400">{c.unit}</span>
                    </>
                  )}
                  <button onClick={() => removeCart(i)} className="text-rose-400 hover:text-rose-700 px-1">✕</button>
                </div>
              ))}
            </div>

            {/* תוספות מתחת לעגלה */}
            <div className="p-3 border-t border-slate-200 bg-white space-y-2">
              {/* 📍 מיקום פיזי — רק אם לפחות פריט אחד בעגלה מסומן trackLocation=true (לדוגמה: רכב/קסדה).
                  נשק וציוד אישי שנשארים על החייל — לא מוצגים. */}
              {(() => {
                const allowLocation = cart.some((c) => {
                  if (c.type === "serial") {
                    const u = units.find((x) => x.id === (c as CartSerial).unitId);
                    return u?.trackLocation === true;
                  } else {
                    const b = balances.find((x) => x.itemTypeId === (c as CartQty).itemTypeId);
                    return b?.trackLocation === true;
                  }
                });
                if (!allowLocation) return null;
                // מסנן מיקומים לפי הפלוגה של החייל הנבחר
                const soldierCompany = selectedSoldier?.companyId ?? null;
                const filteredLocs = soldierCompany
                  ? equipmentLocations.filter((l) => l.companyId === soldierCompany)
                  : equipmentLocations;
                return (
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-0.5">📍 מיקום ציוד (אופציונלי)</label>
                    {filteredLocs.length === 0 ? (
                      <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                        ⚠️ אין מיקומים מוגדרים לפלוגה זו. <a href="/locations?tab=equipment" className="underline">הגדר עכשיו</a>
                      </div>
                    ) : (
                      <select value={equipmentLocationId} onChange={(e) => setEquipmentLocationId(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                        <option value="">— ללא מיקום —</option>
                        {filteredLocs.map((l) => (
                          <option key={l.id} value={l.id}>{l.isVehicle ? "🚙" : "📍"} {l.name}</option>
                        ))}
                      </select>
                    )}
                    <p className="text-[10px] text-slate-400 mt-1">הפלוגה תוכל לעדכן בעתיד דרך &apos;מיקומי ציוד&apos;</p>
                  </div>
                );
              })()}
              {vehicles.length > 0 && cart.some((c) => c.type === "serial") && (
                <div>
                  <label className="block text-[11px] text-slate-600 mb-0.5">רכב (אופציונלי)</label>
                  <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                    <option value="">— ללא —</option>
                    {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} {v.plate}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">אופן חתימה</label>
                <div className="flex gap-1.5 text-xs">
                  {(["ONSITE", "QR", "LINK"] as const).map((m) => (
                    <label key={m} className={`flex-1 text-center px-2 py-1.5 rounded-lg border-2 cursor-pointer transition ${method === m ? "border-slate-800 bg-slate-100" : "border-slate-200"}`}>
                      <input type="radio" checked={method === m} onChange={() => setMethod(m)} className="hidden" />
                      {m === "ONSITE" ? "✍️ שרבוט (כאן)" : m === "QR" ? "📱 QR" : "💬 WhatsApp"}
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  {method === "ONSITE" ? "✍️ החייל יחתום ישירות במכשיר הזה" :
                   method === "QR" ? "📱 ייפתח QR שהחייל יסרוק במכשיר שלו" :
                   "💬 ייפתח לינק שתשלח לחייל בוואטסאפ"}
                </p>
              </div>
            </div>
          </div>

          {/* === עמודה שמאלית — מלאי זמין === */}
          <div className="flex flex-col bg-white order-1 md:order-2 md:min-h-0">
            <div className="p-2 border-b border-slate-200 bg-white sticky top-0 shrink-0">
              <details>
                <summary className="cursor-pointer text-sm text-slate-600 flex items-center gap-1.5 px-1 py-1">
                  🔍 חפש פריט...
                  <span className="text-xs text-slate-400 mr-auto">({availableUnits.length + availableBalances.length})</span>
                </summary>
                <input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="הקלד שם פריט..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm mt-1" autoFocus />
              </details>
            </div>
            <div className="flex-1 md:overflow-y-auto p-2 space-y-1.5 min-h-[200px]">
              {/* בורר ערכה — נגלל עם שאר הפריטים */}
              {kits.length > 0 && (
                <div className="bg-violet-50 border border-violet-200 rounded-lg p-2 mb-1">
                  <label className="block text-[11px] font-semibold text-violet-900 mb-1">📦 ערכה מוכנה</label>
                  <select value={kitId} onChange={(e) => onPickKit(e.target.value)}
                    className="w-full rounded-lg border border-violet-300 px-2 py-1.5 text-sm bg-white">
                    <option value="">— ללא ערכה / בחירה ידנית —</option>
                    {kits.map((k) => <option key={k.id} value={k.id}>{k.name} ({k.lines.length} פריטים)</option>)}
                  </select>
                  {selectedKit && (
                    <p className="text-[10px] text-violet-700 mt-1">
                      ✓ {selectedKit.lines.map((l) => `${l.name}×${l.qty}`).join(" · ")}
                    </p>
                  )}
                </div>
              )}
              {availableUnits.length === 0 && availableBalances.length === 0 && (
                <div className="text-center text-slate-400 py-10 text-sm">
                  אין פריטים זמינים במחסן שלך.<br />הוסף מלאי קודם ב"מלאי המחסן".
                </div>
              )}

              {availableBalances.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-2 pb-1">כמותי — לחץ + להוספה</div>
                  {availableBalances.map((b) => {
                    const inCart = cart.find((c) => c.type === "qty" && c.itemTypeId === b.itemTypeId && c.statusId === b.statusId) as CartQty | undefined;
                    return (
                      <button key={`${b.itemTypeId}-${b.statusId}`} onClick={() => addQty(b)}
                        className={`w-full text-right border rounded-lg p-2 mb-1 transition flex items-center gap-2 group ${inCart ? "bg-emerald-50 border-emerald-400 ring-1 ring-emerald-300" : "bg-white border-slate-200 hover:bg-emerald-50 hover:border-emerald-300"}`}>
                        <span className="text-lg">📦</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{b.itemName}</div>
                          <div className="text-xs text-slate-500">{b.status} · זמין: <b>{b.quantity}</b> {b.unit}</div>
                        </div>
                        {inCart ? (
                          <span className="text-[10px] bg-emerald-600 text-white rounded-full px-2 py-0.5 font-bold">בעגלה ×{inCart.quantity}</span>
                        ) : (
                          <span className="text-emerald-600 font-bold text-lg group-hover:scale-110 transition">+</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {availableUnits.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-2 pb-1 pt-1">סריאלי / אצוות — לחץ להוספה</div>
                  {availableUnits.map((u) => {
                    const isLot = !!u.lotQuantity && u.lotQuantity > 1;
                    const serialInCart = cart.some((c) => c.type === "serial" && (c as CartSerial).unitId === u.id);
                    return (
                      <button key={u.id} onClick={() => { if (!serialInCart) addSerial(u); }}
                        className={`w-full text-right border rounded-lg p-2 mb-1 transition flex items-center gap-2 group ${serialInCart ? "bg-emerald-50 border-emerald-400 ring-1 ring-emerald-300" : isLot ? "bg-white border-orange-300 hover:border-orange-400 hover:bg-blue-50" : "bg-white border-slate-200 hover:border-blue-300 hover:bg-blue-50"}`}>
                        <span className="text-lg">{isLot ? "💣" : "🔫"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {u.itemName}
                            {isLot && <span className="mr-1 text-[10px] bg-orange-100 text-orange-800 rounded px-1.5 py-0.5">אצווה ×{u.lotQuantity}</span>}
                          </div>
                          <div className="text-xs text-slate-500 font-mono truncate">{isLot ? `לוט: ${u.serial}` : `SN: ${u.serial}`} · {u.status}</div>
                        </div>
                        {serialInCart ? (
                          <span className="text-[10px] bg-emerald-600 text-white rounded-full px-2 py-0.5 font-bold shrink-0">✓ בעגלה</span>
                        ) : (
                          <span className={`font-bold text-lg group-hover:scale-110 transition ${isLot ? "text-orange-600" : "text-blue-600"}`}>+</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* דיאלוג חוסר ערכה — מפרט מה חסר ומאשר המשך עם מה שיש */}
        {kitShortageDialog && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20 p-3">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
              <div className="bg-gradient-to-r from-rose-600 to-rose-800 text-white p-4 shrink-0">
                <h3 className="font-bold text-lg flex items-center gap-2">⚠️ חסרים פריטים בערכה</h3>
                <p className="text-xs text-rose-100 mt-1">
                  ערכה: <b>{kitShortageDialog.kitName}</b>
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <p className="text-sm text-slate-700">
                  הפריטים הבאים אינם במלאי בכמות הנדרשת:
                </p>
                <div className="bg-rose-50 border-2 border-rose-200 rounded-lg p-3 space-y-2">
                  {kitShortageDialog.shortages.map((s) => (
                    <div key={s.itemTypeId} className="flex items-center justify-between text-sm">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-rose-700 font-mono">
                        זמין: <b>{s.available}</b> / נדרש: <b>{s.needed}</b>
                        {s.available === 0 && <span className="text-rose-600 mr-2">⚠️ אין כלל</span>}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
                  💡 <b>אפשרות:</b> תוכל להמשיך ולהחתים רק על הפריטים שיש במלאי.
                  הפריטים החסרים <b>לא יוחתמו</b> ולא יוסיפו לעגלה. תוכל להוסיף אותם ידנית או להחתים בנפרד מאוחר יותר.
                </div>
              </div>
              <div className="border-t border-slate-200 p-3 flex gap-2 shrink-0">
                <button onClick={cancelKitShortage} className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm">
                  ✕ ביטול
                </button>
                <button onClick={acceptKitShortage}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2.5 text-sm font-bold">
                  ✓ המשך עם מה שיש
                </button>
              </div>
            </div>
          </div>
        )}

        {/* דיאלוג ערכה: בחירת SN/אצווה ספציפיים מתוך מלאי */}
        {pendingKitPicks.length > 0 && !lotPicker && (() => {
          const cur = pendingKitPicks[0];
          const cartSerialSet = new Set(cart.filter((c) => c.type === "serial").map((c) => (c as CartSerial).unitId));
          const opts = units
            .filter((u) => u.itemTypeId === cur.itemTypeId && !cartSerialSet.has(u.id))
            .filter((u) => !kitPickerSearch.trim() || u.serial.toLowerCase().includes(kitPickerSearch.toLowerCase()));
          return (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10 p-3">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
                <div className="bg-gradient-to-r from-violet-600 to-violet-800 text-white p-4 shrink-0">
                  <h3 className="font-bold text-lg flex items-center gap-2">🎒 ערכה: {cur.kitName}</h3>
                  <p className="text-xs text-violet-100 mt-1">
                    נדרש פריט סריאלי: <b>{cur.itemName}</b> {cur.needed > 1 && <>· נותרו <b>{cur.needed}</b> לבחור</>}
                  </p>
                </div>
                <div className="p-3 border-b border-slate-200 shrink-0">
                  <input value={kitPickerSearch}
                    onChange={(e) => setKitPickerSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") tryManualSn(kitPickerSearch); }}
                    placeholder="סרוק / הקלד SN לבחירה מהירה, או חפש ברשימה..."
                    className="w-full rounded-lg border-2 border-violet-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-400"
                    autoFocus />
                  {kitPickerSearch.trim() && !opts.length && (
                    <p className="text-xs text-rose-600 mt-1.5">⚠️ SN "{kitPickerSearch}" לא נמצא במלאי הזמין של {cur.itemName}</p>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  {opts.length === 0 ? (
                    <p className="text-center text-slate-400 py-8 text-sm">
                      {kitPickerSearch.trim() ? "אין התאמות" : `אין יחידות ${cur.itemName} פנויות במלאי`}
                    </p>
                  ) : opts.map((u) => {
                    const isLot = !!u.lotQuantity && u.lotQuantity > 1;
                    return (
                      <button key={u.id} type="button" onClick={() => confirmKitPick(u)}
                        className={`w-full text-right p-2.5 rounded-lg border mb-1 hover:bg-violet-50 transition flex items-center gap-2 ${isLot ? "border-orange-300" : "border-slate-200"}`}>
                        <span className="text-lg">{isLot ? "💣" : "🔫"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {u.itemName}
                            {isLot && <span className="mr-1 text-[10px] bg-orange-100 text-orange-800 rounded px-1.5 py-0.5">אצווה ×{u.lotQuantity}</span>}
                          </div>
                          <div className="text-xs text-slate-500 font-mono truncate">{isLot ? `לוט: ${u.serial}` : `SN: ${u.serial}`} · {u.status}</div>
                        </div>
                        <span className="text-violet-600 font-bold">+</span>
                      </button>
                    );
                  })}
                </div>
                <div className="border-t border-slate-200 p-3 flex gap-2 shrink-0">
                  <button onClick={skipKitPick} className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm">
                    דלג על פריט זה
                  </button>
                  <button onClick={() => { setPendingKitPicks([]); setKitPickerSearch(""); }}
                    className="flex-1 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 px-4 py-2.5 text-sm">
                    בטל ערכה
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* דיאלוג אצווה: בחירת כמות חלקית מתוך לוט */}
        {lotPicker && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10 p-3" onClick={() => setLotPicker(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-orange-500 to-orange-700 text-white p-4">
                <h3 className="font-bold text-lg flex items-center gap-2">⚠️ פריט אצווה</h3>
                <p className="text-xs text-orange-100 mt-1">ודא שזה הפריט הנכון לפני ההחתמה</p>
              </div>
              <div className="p-5 space-y-3">
                <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-3">
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">💣</span>
                    <div className="flex-1">
                      <div className="font-bold text-lg">{lotPicker.unit.itemName}</div>
                      <div className="text-xs text-slate-600 mt-1">מס׳ לוט: <span className="font-mono font-bold">{lotPicker.unit.serial}</span></div>
                      <div className="text-xs text-slate-600">סטטוס: {lotPicker.unit.status}</div>
                      <div className="text-xs text-slate-600">סה״כ באצווה: <span className="font-bold text-orange-700">{lotPicker.unit.lotQuantity}</span></div>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">כמות להחתמה</label>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: Math.max(1, p.qty - 1) } : p)}
                      className="w-10 h-10 rounded-lg border border-slate-300 text-lg font-bold hover:bg-slate-50">−</button>
                    <input type="number" min={1} max={lotPicker.unit.lotQuantity ?? 1} value={lotPicker.qty}
                      onChange={(e) => setLotPicker((p) => p ? { ...p, qty: Math.max(1, Math.min(lotPicker.unit.lotQuantity ?? 1, parseInt(e.target.value) || 1)) } : p)}
                      className="flex-1 rounded-lg border-2 border-orange-300 px-3 py-2 text-2xl font-bold text-center" autoFocus />
                    <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: Math.min(lotPicker.unit.lotQuantity ?? 1, p.qty + 1) } : p)}
                      className="w-10 h-10 rounded-lg border border-slate-300 text-lg font-bold hover:bg-slate-50">+</button>
                  </div>
                  <div className="flex justify-between mt-2 text-xs">
                    <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: 1 } : p)} className="text-blue-600 hover:underline">1 בלבד</button>
                    <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: Math.floor((lotPicker.unit.lotQuantity ?? 1) / 2) } : p)} className="text-blue-600 hover:underline">חצי</button>
                    <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: lotPicker.unit.lotQuantity ?? 1 } : p)} className="text-blue-600 hover:underline">הכל ({lotPicker.unit.lotQuantity})</button>
                  </div>
                  {lotPicker.qty < (lotPicker.unit.lotQuantity ?? 1) && (
                    <p className="text-[11px] text-amber-700 mt-2 bg-amber-50 rounded p-2">
                      ℹ️ האצווה תתפצל: <b>{lotPicker.qty}</b> יחידות יעברו לחייל, ו-<b>{(lotPicker.unit.lotQuantity ?? 1) - lotPicker.qty}</b> יישארו במחסן באותו מס׳ לוט.
                    </p>
                  )}
                </div>
              </div>
              <div className="p-3 border-t border-slate-200 flex gap-2">
                <button onClick={() => setLotPicker(null)} className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm">ביטול</button>
                <button onClick={confirmLotPick} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white rounded-lg px-4 py-2.5 text-sm font-bold">
                  ✓ הוסף לעגלה ({lotPicker.qty})
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mobile sticky cart summary — visible only on small screens when cart has items */}
        {cart.length > 0 && (
          <div className="md:hidden border-t-2 border-emerald-300 bg-emerald-50 shrink-0">
            <button
              onClick={() => setMobileCartOpen(!mobileCartOpen)}
              className="w-full flex items-center justify-between px-3 py-2"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
                <span>🛒</span>
                <span>{cart.length} פריטים בעגלה</span>
              </div>
              <span className="text-emerald-600 text-xs">{mobileCartOpen ? "▲ סגור" : "▼ פרט"}</span>
            </button>
            {mobileCartOpen && (
              <div className="max-h-48 overflow-y-auto px-2 pb-2 space-y-1">
                {cart.map((c, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 flex items-center gap-2 text-xs">
                    {c.type === "serial" ? (
                      <>
                        <span>{c.lotQty ? "💣" : "🔫"}</span>
                        <div className="flex-1 min-w-0 truncate">
                          <span className="font-medium">{c.itemName}</span>
                          {c.lotQty && <span className="text-orange-700 mr-1">×{c.lotQty}</span>}
                          <span className="text-slate-400 mr-1 font-mono">{c.serial}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <span>{c.fromKit ? "🎒" : "📦"}</span>
                        <div className="flex-1 min-w-0 truncate font-medium">{c.itemName}</div>
                        <input type="number" min={1} value={c.quantity}
                          onChange={(e) => updateCartQty(i, parseInt(e.target.value) || 1)}
                          className="w-12 rounded border border-slate-300 px-1 py-0.5 text-center text-xs" />
                      </>
                    )}
                    <button onClick={() => removeCart(i)} className="text-rose-400 hover:text-rose-700 px-0.5 shrink-0">✕</button>
                  </div>
                ))}
                <button onClick={() => setCart([])} className="w-full text-center text-[10px] text-rose-500 hover:text-rose-700 py-1">
                  נקה הכל
                </button>
              </div>
            )}
          </div>
        )}

        {/* footer */}
        <div className="border-t border-slate-200 p-3 bg-white shrink-0">
          {error && <div className="text-sm text-rose-700 font-medium mb-2">⚠️ {error}</div>}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => { setError(null); }} disabled={busy}
              className="flex-1 sm:flex-none rounded-lg border border-slate-300 px-4 py-2.5 text-sm disabled:opacity-50">ביטול</button>
            <button onClick={submit} disabled={busy || !soldierId || (cart.length === 0 && !kitId && soldierOpKits.length === 0)}
              className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-5 py-2.5 text-sm font-bold flex items-center justify-center gap-2">
              {busy ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  שולח...
                </>
              ) : (
                <>{method === "ONSITE" ? "✍️ עבור לחתימה" : "🚀 הפעל החתמה"} ({cart.length}{kitId ? " + ערכה" : ""}{soldierOpKits.length > 0 ? ` + ${soldierOpKits.length} מארזים` : ""})</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
