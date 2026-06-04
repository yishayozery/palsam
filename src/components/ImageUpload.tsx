"use client";

import { useState } from "react";

/** דחיסת תמונה ל-data-URL קטן */
export function compressImage(file: File, max = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > max) { height = (height * max) / width; width = max; }
        else if (height > max) { width = (width * max) / height; height = max; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** שדה העלאת תמונה עם תצוגה מקדימה + input מוסתר בשם נתון */
export default function ImageUpload({
  name,
  initial,
  label = "תמונה",
  shape = "square",
}: {
  name: string;
  initial?: string | null;
  label?: string;
  shape?: "square" | "circle";
}) {
  const [image, setImage] = useState<string | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const rounded = shape === "circle" ? "rounded-full" : "rounded-lg";

  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <input type="hidden" name={name} value={image === null ? (initial ? "__CLEAR__" : "") : image} />
      <div className="flex items-center gap-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={label} className={`w-20 h-20 object-contain border border-slate-200 bg-white ${rounded}`} />
        ) : (
          <div className={`w-20 h-20 border border-dashed border-slate-300 flex items-center justify-center text-slate-300 text-2xl ${rounded}`}>🏷️</div>
        )}
        <div className="flex flex-col gap-1">
          <label className="text-sm bg-white border border-slate-300 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-slate-50">
            {busy ? "טוען..." : "בחר / צלם"}
            <input type="file" accept="image/*" className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setBusy(true);
                try { setImage(await compressImage(f)); } finally { setBusy(false); }
              }} />
          </label>
          {image && <button type="button" onClick={() => setImage(null)} className="text-xs text-rose-500 text-right">הסר</button>}
        </div>
      </div>
    </div>
  );
}
