"use client";

import { useState, useTransition, useRef } from "react";
import { submitVerification } from "./actions";

type Item = {
  id: string;
  itemTypeName: string;
  serialNumber: string | null;
  status: string;
  photoData: string | null;
  note: string | null;
  expectedQuantity: number | null;
  reportedQuantity: number | null;
  reportedSerial: string | null;
  reportedLocation: string | null;
  expectedExpiry: string | null;
};

type Response = {
  found: boolean | null;
  photoData: string | null;
  note: string;
  reportedSerial: string;
  reportedLocation: string;
  reportedQuantity: string;
  reportedExpiry: string;
};

// סוג הפעולה שכל פריט דורש — נגזר מטבע הפריט + מצב הבקשה.
type ItemAction = "confirm" | "serial" | "quantity" | "quantity_confirm" | "location" | "batch";

function compressImage(file: File, maxWidth = 600, quality = 0.5): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ratio = Math.min(maxWidth / img.width, 1);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// תג צבעוני לכל סוג פעולה — כדי שהמדווח ידע מיד מה לעשות.
const ACTION_BADGE: Record<ItemAction, { label: string; cls: string }> = {
  serial: { label: "🔢 הקש/י מספר סריאלי", cls: "bg-blue-100 text-blue-800 border-blue-300" },
  quantity: { label: "🔢 ספור/י ורשום/י כמות", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  quantity_confirm: { label: "🔢 אשר/י או עדכן/י כמות", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  location: { label: "📍 בחר/י מיקום", cls: "bg-teal-100 text-teal-800 border-teal-300" },
  confirm: { label: "✅ נמצא / ❌ חסר", cls: "bg-slate-100 text-slate-700 border-slate-300" },
  batch: { label: "", cls: "" },
};

export default function VerificationClient({
  token,
  items,
  soldierName,
  mode,
  locations,
}: {
  token: string;
  items: Item[];
  soldierName: string;
  mode: string;
  locations: { id: string; name: string }[];
}) {
  const [responses, setResponses] = useState<Record<string, Response>>(() => {
    const init: Record<string, Response> = {};
    for (const item of items) init[item.id] = { found: null, photoData: null, note: "", reportedSerial: "", reportedLocation: "", reportedQuantity: "", reportedExpiry: item.expectedExpiry ?? "" };
    return init;
  });
  const [batchConfirmed, setBatchConfirmed] = useState<boolean | null>(null);
  const [customLocation, setCustomLocation] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const isBlind = mode === "BLIND_COUNT";
  const isConfirm = mode === "CONFIRM";

  // הפעולה הנדרשת לפריט מסוים — פר-פריט, לא מצב אחד לכל הבקשה.
  const itemAction = (item: Item): ItemAction => {
    if (mode === "BATCH") return "batch";
    if (mode === "CONFIRM") return "confirm";
    if (mode === "SERIAL_ENTRY") return "serial";
    if (mode === "LOCATION") return "location";
    if (mode === "QUANTITY_CONFIRM") return "quantity_confirm";
    // BLIND_COUNT: פריט סריאלי → הקש מספר; אחרת → ספור כמות
    return item.serialNumber != null ? "serial" : "quantity";
  };

  const answered = (item: Item): boolean => {
    const r = responses[item.id];
    switch (itemAction(item)) {
      case "serial": return r.reportedSerial.trim().length > 0;
      case "quantity":
      case "quantity_confirm": return r.reportedQuantity.trim().length > 0;
      case "location": return r.reportedLocation.trim().length > 0;
      case "confirm": return r.found !== null;
      default: return true;
    }
  };

  const allAnswered = mode === "BATCH" ? batchConfirmed !== null : items.every(answered);

  const handlePhoto = async (itemId: string, file: File) => {
    const compressed = await compressImage(file);
    setResponses((prev) => ({ ...prev, [itemId]: { ...prev[itemId], photoData: compressed } }));
  };

  const handleSubmit = () => {
    if (!allAnswered) return;
    setError(null);
    startTransition(async () => {
      const payload = items.map((item) => {
        const r = responses[item.id];
        if (mode === "BATCH") {
          return { itemId: item.id, found: batchConfirmed!, photoData: undefined, note: undefined };
        }
        const loc = r.reportedLocation.trim() || undefined;
        const exp = r.reportedExpiry || undefined;
        const expiryNote = item.expectedExpiry && exp && exp !== item.expectedExpiry ? `תוקף: רשום ${item.expectedExpiry}, דווח ${exp}` : undefined;
        switch (itemAction(item)) {
          case "serial": {
            const match = r.reportedSerial.trim() === item.serialNumber;
            const note = [match ? undefined : `הוקלד: ${r.reportedSerial.trim()}`, expiryNote].filter(Boolean).join(" · ") || undefined;
            return { itemId: item.id, found: match, reportedSerial: r.reportedSerial.trim(), reportedLocation: loc, reportedExpiry: exp, photoData: r.photoData || undefined, note };
          }
          case "location":
            return { itemId: item.id, found: true, reportedLocation: loc, reportedExpiry: exp, note: expiryNote };
          case "quantity":
          case "quantity_confirm": {
            const qty = parseInt(r.reportedQuantity, 10) || 0;
            const match = item.expectedQuantity == null || qty === item.expectedQuantity;
            const note = [match ? undefined : `צפוי: ${item.expectedQuantity ?? "?"}, דווח: ${qty}`, expiryNote].filter(Boolean).join(" · ") || undefined;
            return { itemId: item.id, found: match, reportedQuantity: qty, reportedLocation: loc, reportedExpiry: exp, note };
          }
          default:
            return { itemId: item.id, found: r.found!, photoData: r.photoData || undefined, reportedLocation: loc, reportedExpiry: exp, note: [r.note || undefined, expiryNote].filter(Boolean).join(" · ") || undefined };
        }
      });
      const result = await submitVerification(token, payload);
      if (result.error) { setError(result.error); return; }
      setDone(true);
    });
  };

  if (done) {
    return (
      <div className="text-center py-8">
        <div className="text-5xl mb-3">✅</div>
        <p className="font-bold text-emerald-700">תודה, {soldierName}!</p>
        <p className="text-sm text-slate-500 mt-2">הדיווח נקלט בהצלחה.</p>
      </div>
    );
  }

  const locationPicker = (item: Item) => (
    <div className="mt-2">
      <div className="text-[11px] text-teal-700 mb-1">📍 מיקום (אופציונלי)</div>
      <select
        value={customLocation[item.id] ? "__other__" : responses[item.id].reportedLocation}
        onChange={(e) => {
          const val = e.target.value;
          if (val === "__other__") {
            setCustomLocation((p) => ({ ...p, [item.id]: true }));
            setResponses((p) => ({ ...p, [item.id]: { ...p[item.id], reportedLocation: "" } }));
          } else {
            setCustomLocation((p) => ({ ...p, [item.id]: false }));
            setResponses((p) => ({ ...p, [item.id]: { ...p[item.id], reportedLocation: val } }));
          }
        }}
        className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
      >
        <option value="">— ללא / לא ידוע —</option>
        {locations.map((loc) => (<option key={loc.id} value={loc.name}>{loc.name}</option>))}
        <option value="__other__">אחר — הקלדה ידנית</option>
      </select>
      {customLocation[item.id] && (
        <input
          type="text"
          placeholder="הקלד מיקום..."
          value={responses[item.id].reportedLocation}
          onChange={(e) => setResponses((p) => ({ ...p, [item.id]: { ...p[item.id], reportedLocation: e.target.value } }))}
          className="mt-1 w-full border border-amber-300 rounded-lg px-3 py-2 text-sm"
          autoFocus
        />
      )}
    </div>
  );

  return (
    <div>
      <p className="text-xs text-slate-500 mb-4 text-center">
        {isBlind ? "🔒 ספירה עיוורת — דווח/י מה שמצאת בפועל (אין נתונים מראש)." : isConfirm ? "אשר/י כל פריט: נמצא או חסר." : "מלא/י את הדיווח לכל פריט."}
      </p>

      {mode === "BATCH" ? (
        <div>
          <div className="border rounded-xl p-3 mb-3">
            <p className="text-sm font-medium text-slate-700 mb-2">פריטים לאימות:</p>
            <ul className="space-y-1 text-sm text-slate-600">
              {items.map((item) => (
                <li key={item.id}>• {item.itemTypeName}{item.serialNumber ? ` (${item.serialNumber})` : ""}</li>
              ))}
            </ul>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setBatchConfirmed(true)}
              className={`flex-1 px-4 py-3 rounded-xl text-sm font-bold transition ${batchConfirmed === true ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-emerald-50"}`}>
              ✅ הכל נמצא
            </button>
            <button onClick={() => setBatchConfirmed(false)}
              className={`flex-1 px-4 py-3 rounded-xl text-sm font-bold transition ${batchConfirmed === false ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-rose-50"}`}>
              ❌ חסרים פריטים
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const r = responses[item.id];
            const action = itemAction(item);
            const badge = ACTION_BADGE[action];
            const isDone = answered(item);
            return (
              <div key={item.id} className={`border rounded-xl p-3 transition ${isDone ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200"}`}>
                <div className="flex justify-between items-start gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{item.itemTypeName}</div>
                    {/* בעיוור לא חושפים סריאלי; באישור/כמות מציגים */}
                    {item.serialNumber && action !== "serial" && (
                      <div className="text-xs text-slate-500 font-mono break-all">{item.serialNumber}</div>
                    )}
                    {item.expectedQuantity != null && action === "quantity_confirm" && (
                      <div className="text-xs text-blue-600">כמות צפויה: {item.expectedQuantity}</div>
                    )}
                  </div>
                  {badge.label && (
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full border ${badge.cls}`}>{badge.label}</span>
                  )}
                </div>

                {action === "confirm" && (
                  <div className="flex gap-2">
                    <button onClick={() => setResponses((p) => ({ ...p, [item.id]: { ...p[item.id], found: true } }))}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition ${r.found === true ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-emerald-50"}`}>
                      ✅ נמצא
                    </button>
                    <button onClick={() => setResponses((p) => ({ ...p, [item.id]: { ...p[item.id], found: false } }))}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition ${r.found === false ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-rose-50"}`}>
                      ❌ חסר
                    </button>
                  </div>
                )}

                {action === "serial" && (
                  <input type="text" inputMode="numeric" placeholder="הקש/י את המספר הסריאלי שרשום על הפריט"
                    value={r.reportedSerial}
                    onChange={(e) => setResponses((p) => ({ ...p, [item.id]: { ...p[item.id], reportedSerial: e.target.value } }))}
                    className="w-full border-2 border-blue-200 focus:border-blue-400 rounded-lg px-3 py-2.5 text-sm font-mono outline-none" />
                )}

                {(action === "quantity" || action === "quantity_confirm") && (
                  <input type="number" inputMode="numeric" min="0"
                    placeholder={action === "quantity" ? "כמה יחידות יש בפועל?" : "אשר/י או עדכן/י כמות"}
                    value={r.reportedQuantity}
                    onChange={(e) => setResponses((p) => ({ ...p, [item.id]: { ...p[item.id], reportedQuantity: e.target.value } }))}
                    className="w-full border-2 border-emerald-200 focus:border-emerald-400 rounded-lg px-3 py-2.5 text-sm outline-none" />
                )}

                {action === "location" && locationPicker(item)}

                {/* מיקום אופציונלי לפריט סריאלי/כמותי */}
                {(action === "serial" || action === "quantity" || action === "quantity_confirm") && locations.length > 0 && locationPicker(item)}

                {/* תוקף — אישור מול התאריך הידוע במערכת (כמו אצווה) */}
                {item.expectedExpiry && (
                  <div className="mt-2">
                    <div className="text-[11px] text-amber-700 mb-1">📅 תוקף רשום: {new Date(item.expectedExpiry).toLocaleDateString("he-IL")} — אשר/י או תקן/י</div>
                    <input type="date" value={r.reportedExpiry}
                      onChange={(e) => setResponses((p) => ({ ...p, [item.id]: { ...p[item.id], reportedExpiry: e.target.value } }))}
                      className="w-full border-2 border-amber-200 focus:border-amber-400 rounded-lg px-3 py-2 text-sm outline-none" />
                  </div>
                )}

                {/* צילום — זמין באישור */}
                {action === "confirm" && (
                  <div className="flex items-center gap-2 mt-2">
                    <input ref={(el) => { fileRefs.current[item.id] = el; }} type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={(e) => { const file = e.target.files?.[0]; if (file) handlePhoto(item.id, file); }} />
                    <button onClick={() => fileRefs.current[item.id]?.click()} className="text-xs bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1.5">
                      📷 {r.photoData ? "החלף תמונה" : "צלם פריט"}
                    </button>
                    {r.photoData && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.photoData} alt="" className="h-10 w-10 rounded object-cover border" />
                    )}
                  </div>
                )}

                {action === "confirm" && r.found === false && (
                  <input placeholder="הערה (אופציונלי)" value={r.note}
                    onChange={(e) => setResponses((p) => ({ ...p, [item.id]: { ...p[item.id], note: e.target.value } }))}
                    className="mt-2 w-full border rounded-lg px-2 py-1.5 text-xs" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="text-red-600 text-sm mt-3 text-center">{error}</p>}

      <button onClick={handleSubmit} disabled={!allAnswered || pending}
        className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl py-3 font-bold transition">
        {pending ? "שולח..." : "📤 שלח דיווח"}
      </button>
    </div>
  );
}
