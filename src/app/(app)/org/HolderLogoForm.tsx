"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ImageUpload from "@/components/ImageUpload";
import { setHolderLogo } from "./actions";

export default function HolderLogoForm({
  holderId, kind, initial,
}: {
  holderId: string;
  kind: "WAREHOUSE" | "COMPANY";
  initial: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  async function submit(fd: FormData) {
    setBusy(true);
    setFeedback(null);
    try {
      fd.append("id", holderId);
      const res = await setHolderLogo(fd);
      if (res?.error) {
        setFeedback({ ok: false, msg: res.error });
      } else {
        setFeedback({ ok: true, msg: "✓ הסמל נשמר" });
        router.refresh();
      }
    } catch (e) {
      setFeedback({ ok: false, msg: e instanceof Error ? e.message : "שגיאה" });
    } finally {
      setBusy(false);
      setTimeout(() => setFeedback(null), 3000);
    }
  }

  return (
    <form action={submit} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
      <div className="text-xs font-semibold text-blue-900 mb-2">
        🎨 סמל {kind === "WAREHOUSE" ? "המחסן" : "הפלוגה"} (אופציונלי, מוצג בסיידבר ובמבנה הארגוני)
      </div>
      <ImageUpload name="logoData" initial={initial} label="" />
      <div className="flex items-center gap-2 mt-2">
        <button disabled={busy}
          className="text-xs bg-blue-700 text-white rounded px-3 py-1.5 hover:bg-blue-800 disabled:opacity-50">
          {busy ? "שומר..." : "💾 שמור סמל"}
        </button>
        {feedback && (
          <span className={`text-xs ${feedback.ok ? "text-emerald-700" : "text-rose-700"}`}>
            {feedback.msg}
          </span>
        )}
      </div>
    </form>
  );
}
