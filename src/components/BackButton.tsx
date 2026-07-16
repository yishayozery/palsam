"use client";

import { useRouter } from "next/navigation";

/** כפתור "חזרה" חכם — חוזר לדף הקודם (המסך שממנו נפתחה התעודה), עם fallback. */
export default function BackButton({ label = "← חזרה", fallback = "/transfers" }: { label?: string; fallback?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => { if (typeof window !== "undefined" && window.history.length > 1) router.back(); else router.push(fallback); }}
      className="text-sm text-slate-500 hover:text-slate-800"
    >
      {label}
    </button>
  );
}
