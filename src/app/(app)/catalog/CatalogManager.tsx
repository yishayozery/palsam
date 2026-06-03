"use client";

import { useState } from "react";
import { saveItemType, addKitComponent, removeKitComponent } from "./actions";

type Cat = { id: string; name: string };
type ItemRef = { id: string; name: string; sku: string };
type EditData = {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  trackingMethod: string;
  unit: string;
  isSensitive: boolean;
  trackLocation: boolean;
  kitComponents: { id: string; name: string; quantity: number }[];
};

export default function CatalogManager({
  categories,
  items,
  edit,
}: {
  categories: Cat[];
  items: ItemRef[];
  edit?: EditData;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState(edit?.trackingMethod || "QUANTITY");

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          edit
            ? "text-xs text-slate-500 hover:text-slate-800"
            : "bg-slate-800 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-900"
        }
      >
        {edit ? "עריכה" : '+ מק"ט חדש'}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">
                {edit ? `עריכת ${edit.name}` : 'מק"ט חדש'}
              </h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">
                ✕
              </button>
            </div>

            <form
              action={async (fd) => {
                await saveItemType(fd);
                setOpen(false);
              }}
              className="p-5 space-y-4"
            >
              {edit && <input type="hidden" name="id" value={edit.id} />}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">מק״ט</label>
                  <input name="sku" defaultValue={edit?.sku} required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">יחידת מידה</label>
                  <input name="unit" defaultValue={edit?.unit || "יח'"}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">שם הפריט</label>
                <input name="name" defaultValue={edit?.name} required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">קטגוריה</label>
                  <select name="categoryId" defaultValue={edit?.categoryId}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">שיטת ניהול</label>
                  <select name="trackingMethod" value={method} onChange={(e) => setMethod(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="QUANTITY">כמותי</option>
                    <option value="SERIAL">פרטני (מס״ד)</option>
                    <option value="LOT">אצווה (Lot)</option>
                    <option value="KIT">ערכה</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="isSensitive" defaultChecked={edit?.isSensitive} className="w-4 h-4" />
                  ציוד רגיש
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="trackLocation" defaultChecked={edit?.trackLocation} className="w-4 h-4" />
                  מעקב מיקום פיזי
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
                <button className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm">שמירה</button>
              </div>
            </form>

            {/* ניהול רכיבי ערכה */}
            {edit && (method === "KIT" || edit.trackingMethod === "KIT") && (
              <div className="p-5 border-t border-slate-200 bg-slate-50">
                <h4 className="font-semibold text-sm text-slate-700 mb-3">רכיבי הערכה</h4>
                <div className="space-y-1.5 mb-3">
                  {edit.kitComponents.length === 0 && (
                    <p className="text-xs text-slate-400">טרם הוגדרו רכיבים</p>
                  )}
                  {edit.kitComponents.map((k) => (
                    <div key={k.id} className="flex items-center justify-between text-sm bg-white rounded-lg px-3 py-1.5 border border-slate-200">
                      <span>{k.name} × {k.quantity}</span>
                      <form action={removeKitComponent}>
                        <input type="hidden" name="id" value={k.id} />
                        <button className="text-xs text-rose-500">הסר</button>
                      </form>
                    </div>
                  ))}
                </div>
                <form action={addKitComponent} className="flex items-end gap-2">
                  <input type="hidden" name="kitItemTypeId" value={edit.id} />
                  <div className="flex-1">
                    <label className="block text-xs text-slate-500 mb-1">רכיב</label>
                    <select name="componentTypeId" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                      {items.filter((x) => x.id !== edit.id).map((x) => (
                        <option key={x.id} value={x.id}>{x.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-20">
                    <label className="block text-xs text-slate-500 mb-1">כמות</label>
                    <input name="quantity" type="number" defaultValue="1" min="1"
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  </div>
                  <button className="bg-emerald-600 text-white rounded-lg px-3 py-1.5 text-sm">הוסף</button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
