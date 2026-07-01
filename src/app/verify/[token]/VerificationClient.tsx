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
};

type Response = {
  found: boolean | null;
  photoData: string | null;
  note: string;
  reportedSerial: string;
  reportedLocation: string;
  reportedQuantity: string;
};

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

const MODE_INSTRUCTIONS: Record<string, string> = {
  CONFIRM: "סמן/י עבור כל פריט האם הוא נמצא ברשותך.",
  SERIAL_ENTRY: "הקלד/י את המספר הסריאלי של כל פריט לאימות.",
  LOCATION: "בחר/י את המיקום של כל פריט.",
  QUANTITY_CONFIRM: "אשר/י את הכמות הצפויה או עדכן/י אם שונה.",
  BLIND_COUNT: "ספור/י את הפריטים והקלד/י את הכמות שמצאת.",
  BATCH: "אשר/י שכל הפריטים ברשימה נמצאים.",
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
    for (const item of items) init[item.id] = { found: null, photoData: null, note: "", reportedSerial: "", reportedLocation: "", reportedQuantity: "" };
    return init;
  });
  const [batchConfirmed, setBatchConfirmed] = useState<boolean | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const allAnswered = (() => {
    if (mode === "BATCH") return batchConfirmed !== null;
    return items.every((item) => {
      const r = responses[item.id];
      if (mode === "CONFIRM") return r.found !== null;
      if (mode === "SERIAL_ENTRY") return r.reportedSerial.length > 0;
      if (mode === "LOCATION") return r.reportedLocation.length > 0;
      if (mode === "QUANTITY_CONFIRM" || mode === "BLIND_COUNT") return r.reportedQuantity.length > 0;
      return r.found !== null;
    });
  })();

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
        if (mode === "SERIAL_ENTRY") {
          const match = r.reportedSerial === item.serialNumber;
          return { itemId: item.id, found: match, reportedSerial: r.reportedSerial, note: match ? undefined : `הוקלד: ${r.reportedSerial}` };
        }
        if (mode === "LOCATION") {
          return { itemId: item.id, found: true, reportedLocation: r.reportedLocation, note: undefined };
        }
        if (mode === "QUANTITY_CONFIRM" || mode === "BLIND_COUNT") {
          const qty = parseInt(r.reportedQuantity, 10) || 0;
          const match = item.expectedQuantity == null || qty === item.expectedQuantity;
          return { itemId: item.id, found: match, reportedQuantity: qty, note: match ? undefined : `צפוי: ${item.expectedQuantity ?? "?"}, דווח: ${qty}` };
        }
        return {
          itemId: item.id,
          found: r.found!,
          photoData: r.photoData || undefined,
          note: r.note || undefined,
        };
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

  return (
    <div>
      <p className="text-xs text-slate-500 mb-4 text-center">
        {MODE_INSTRUCTIONS[mode] || MODE_INSTRUCTIONS.CONFIRM}
      </p>

      {/* BATCH mode — single confirmation for all items */}
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
            <button
              onClick={() => setBatchConfirmed(true)}
              className={`flex-1 px-4 py-3 rounded-xl text-sm font-bold transition ${
                batchConfirmed === true ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-emerald-50"
              }`}
            >
              ✅ הכל נמצא
            </button>
            <button
              onClick={() => setBatchConfirmed(false)}
              className={`flex-1 px-4 py-3 rounded-xl text-sm font-bold transition ${
                batchConfirmed === false ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-rose-50"
              }`}
            >
              ❌ חסרים פריטים
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const r = responses[item.id];
            return (
              <div key={item.id} className="border rounded-xl p-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-medium text-sm">{item.itemTypeName}</div>
                    {item.serialNumber && mode !== "SERIAL_ENTRY" && (
                      <div className="text-xs text-slate-500 font-mono">{item.serialNumber}</div>
                    )}
                    {item.expectedQuantity != null && mode === "QUANTITY_CONFIRM" && (
                      <div className="text-xs text-blue-600">כמות צפויה: {item.expectedQuantity}</div>
                    )}
                  </div>

                  {/* CONFIRM mode buttons */}
                  {mode === "CONFIRM" && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => setResponses((p) => ({ ...p, [item.id]: { ...p[item.id], found: true } }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                          r.found === true ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-emerald-50"
                        }`}
                      >
                        ✅ נמצא
                      </button>
                      <button
                        onClick={() => setResponses((p) => ({ ...p, [item.id]: { ...p[item.id], found: false } }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                          r.found === false ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-rose-50"
                        }`}
                      >
                        ❌ לא נמצא
                      </button>
                    </div>
                  )}
                </div>

                {/* SERIAL_ENTRY mode */}
                {mode === "SERIAL_ENTRY" && (
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="הקלד מספר סריאלי"
                    value={r.reportedSerial}
                    onChange={(e) => setResponses((p) => ({ ...p, [item.id]: { ...p[item.id], reportedSerial: e.target.value } }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                  />
                )}

                {/* LOCATION mode */}
                {mode === "LOCATION" && (
                  <select
                    value={r.reportedLocation}
                    onChange={(e) => setResponses((p) => ({ ...p, [item.id]: { ...p[item.id], reportedLocation: e.target.value } }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">בחר מיקום...</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.name}>{loc.name}</option>
                    ))}
                  </select>
                )}

                {/* QUANTITY modes */}
                {(mode === "QUANTITY_CONFIRM" || mode === "BLIND_COUNT") && (
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder={mode === "BLIND_COUNT" ? "הקלד כמות" : "אשר או עדכן כמות"}
                    value={r.reportedQuantity}
                    onChange={(e) => setResponses((p) => ({ ...p, [item.id]: { ...p[item.id], reportedQuantity: e.target.value } }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                )}

                {/* Photo capture (available in all modes) */}
                {mode === "CONFIRM" && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      ref={(el) => { fileRefs.current[item.id] = el; }}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePhoto(item.id, file);
                      }}
                    />
                    <button
                      onClick={() => fileRefs.current[item.id]?.click()}
                      className="text-xs bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1.5"
                    >
                      📷 {r.photoData ? "החלף תמונה" : "צלם פריט"}
                    </button>
                    {r.photoData && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.photoData} alt="" className="h-10 w-10 rounded object-cover border" />
                    )}
                  </div>
                )}

                {/* Note for denied items in CONFIRM mode */}
                {mode === "CONFIRM" && r.found === false && (
                  <input
                    placeholder="הערה (אופציונלי)"
                    value={r.note}
                    onChange={(e) => setResponses((p) => ({ ...p, [item.id]: { ...p[item.id], note: e.target.value } }))}
                    className="mt-2 w-full border rounded-lg px-2 py-1.5 text-xs"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="text-red-600 text-sm mt-3 text-center">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={!allAnswered || pending}
        className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl py-3 font-bold transition"
      >
        {pending ? "שולח..." : "📤 שלח דיווח"}
      </button>
    </div>
  );
}
