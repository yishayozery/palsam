"use client";

import { useState, useTransition, useRef } from "react";
import { submitVerification } from "./actions";

type Item = {
  id: string;
  itemTypeName: string;
  serialNumber: string;
  status: string;
  photoData: string | null;
  note: string | null;
};

type Response = {
  found: boolean | null;
  photoData: string | null;
  note: string;
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

export default function VerificationClient({
  token,
  items,
  soldierName,
}: {
  token: string;
  items: Item[];
  soldierName: string;
}) {
  const [responses, setResponses] = useState<Record<string, Response>>(() => {
    const init: Record<string, Response> = {};
    for (const item of items) init[item.id] = { found: null, photoData: null, note: "" };
    return init;
  });
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const allAnswered = items.every((item) => responses[item.id]?.found !== null);

  const handlePhoto = async (itemId: string, file: File) => {
    const compressed = await compressImage(file);
    setResponses((prev) => ({ ...prev, [itemId]: { ...prev[itemId], photoData: compressed } }));
  };

  const handleSubmit = () => {
    if (!allAnswered) return;
    setError(null);
    startTransition(async () => {
      const payload = items.map((item) => ({
        itemId: item.id,
        found: responses[item.id].found!,
        photoData: responses[item.id].photoData || undefined,
        note: responses[item.id].note || undefined,
      }));
      const result = await submitVerification(token, payload);
      if (result.error) {
        setError(result.error);
        return;
      }
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
        אנא סמן/י עבור כל פריט האם הוא נמצא ברשותך, וצלם/י תמונה (אופציונלי).
      </p>

      <div className="space-y-3">
        {items.map((item) => {
          const r = responses[item.id];
          return (
            <div key={item.id} className="border rounded-xl p-3">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-medium text-sm">{item.itemTypeName}</div>
                  <div className="text-xs text-slate-500 font-mono">{item.serialNumber}</div>
                </div>
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
              </div>

              {/* צילום */}
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

              {/* הערה */}
              {r.found === false && (
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
