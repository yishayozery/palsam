"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** מסך מצב סטטי (כבר נחתם / פג תוקף / לא תקף) — מנווט אוטומטית למסך הראשי אחרי 3 שניות */
export default function CenteredWithRedirect({
  title,
  text,
  tone,
  autoRedirect = true,
}: {
  title: string;
  text: string;
  tone?: "ok" | "error";
  autoRedirect?: boolean;
}) {
  const router = useRouter();
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (!autoRedirect) return;
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          router.push("/");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [autoRedirect, router]);

  const titleColor =
    tone === "ok" ? "text-emerald-700"
    : tone === "error" ? "text-rose-700"
    : "text-slate-800";

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-sm w-full">
        <h1 className={`text-2xl font-bold ${titleColor}`}>{title}</h1>
        <p className="text-sm text-slate-500 mt-3">{text}</p>
        {autoRedirect && (
          <>
            <p className="text-xs text-slate-400 mt-5">
              חוזר לדף הראשי בעוד <b className={titleColor}>{countdown}</b> שניות...
            </p>
            <button
              onClick={() => router.push("/")}
              className={`mt-4 ${tone === "ok" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-700 hover:bg-slate-800"} text-white rounded-lg px-6 py-2 text-sm font-medium`}
            >
              → חזרה עכשיו
            </button>
          </>
        )}
      </div>
    </div>
  );
}
