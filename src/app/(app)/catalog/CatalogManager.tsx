"use client";

import { useState } from "react";
import { saveItemType } from "./actions";

type Cat = { id: string; name: string };
type Loc = { id: string; label: string };
export type EditData = {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  trackingMethod: string;
  unit: string;
  association: string;
  signMode: string;
  imageData: string | null;
  homeLocationId?: string | null;
  trackExpiry?: boolean;
  expiryAlertDays?: number | null;
};

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 500;
        let { width, height } = img;
        if (width > height && width > max) { height = (height * max) / width; width = max; }
        else if (height > max) { width = (width * max) / height; height = max; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function CatalogManager({ categories, locations = [], edit }: { categories: Cat[]; locations?: Loc[]; edit?: EditData }) {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<string | null>(edit?.imageData ?? null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={edit ? "text-xs text-slate-500 hover:text-slate-800" : "bg-slate-800 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-900"}
      >
        {edit ? "עריכה" : '+ פריט חדש'}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">{edit ? `עריכת ${edit.name}` : "פריט חדש"}</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <form action={async (fd) => { await saveItemType(fd); setOpen(false); }} className="p-5 space-y-4">
              {edit && <input type="hidden" name="id" value={edit.id} />}

              <div>
                <label className="block text-xs text-slate-500 mb-1">שם הפריט</label>
                <input name="name" defaultValue={edit?.name} required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">מק״ט (אופציונלי)</label>
                  <input name="sku" defaultValue={edit?.sku}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">יחידת מידה</label>
                  <input name="unit" defaultValue={edit?.unit || "יח'"}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">קטגוריה</label>
                  <select name="categoryId" defaultValue={edit?.categoryId ?? ""}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="">— ללא —</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">שיטת ניהול</label>
                  <select name="trackingMethod" defaultValue={edit?.trackingMethod || "QUANTITY"}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="QUANTITY">כמותי — ספירה לפי כמות</option>
                    <option value="SERIAL">פרטני — מס״ד לכל יחידה</option>
                    <option value="LOT">אצווה — מספר אצווה + כמות</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">שייכות</label>
                  <select name="association" defaultValue={edit?.association || "MILITARY"}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="MILITARY">צבאי</option>
                    <option value="DONATION_COMPANY">תרומה — פלוגתי</option>
                    <option value="DONATION_BATTALION">תרומה — גדודי</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">מי חותם?</label>
                  <select name="signMode" defaultValue={edit?.signMode || "COMPANY"}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="COMPANY">הפלוגה (מפ/רס״פ)</option>
                    <option value="SOLDIER">חייל ישירות (נשק)</option>
                  </select>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" name="trackExpiry" defaultChecked={edit?.trackExpiry ?? false}
                    className="w-4 h-4" />
                  <span className="font-medium">⏳ פריט עם תאריך תפוגה</span>
                </label>
                <p className="text-[11px] text-slate-500 mr-6 mt-0.5">סמן כדי לחייב הזנת תאריך תפוגה בקבלת מלאי. הפריט יופיע במסך ניהול תוקף.</p>
                <div className="mr-6 mt-2 flex items-center gap-2">
                  <label className="text-xs text-slate-600">🔔 התראה</label>
                  <input type="number" name="expiryAlertDays" min={1} defaultValue={edit?.expiryAlertDays ?? 90}
                    className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
                  <span className="text-xs text-slate-600">ימים לפני פקיעת התוקף</span>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">מיקום בימ&quot;ח (מידוף — אופציונלי)</label>
                <select name="homeLocationId" defaultValue={edit?.homeLocationId ?? ""}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="">— ללא הגדרה —</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
                {locations.length === 0 && (
                  <p className="text-[11px] text-slate-400 mt-1">אין מחסנים מוגדרים. הגדר ב<a href="/locations" className="text-blue-600 hover:underline">מחסני ימ״ח</a>.</p>
                )}
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">צילום מוצר (אופציונלי)</label>
                <input type="hidden" name="imageData" value={image === null ? (edit?.imageData ? "__CLEAR__" : "") : image} />
                <div className="flex items-center gap-3">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="מוצר" className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-slate-300 text-2xl">📷</div>
                  )}
                  <div className="flex flex-col gap-1">
                    <label className="text-sm bg-white border border-slate-300 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-slate-50">
                      {busy ? "טוען..." : "בחר / צלם תמונה"}
                      <input type="file" accept="image/*" capture="environment" className="hidden"
                        onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setBusy(true); try { setImage(await compressImage(f)); } finally { setBusy(false); } }} />
                    </label>
                    {image && <button type="button" onClick={() => setImage(null)} className="text-xs text-rose-500 text-right">הסר תמונה</button>}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
                <button className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm">שמירה</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
