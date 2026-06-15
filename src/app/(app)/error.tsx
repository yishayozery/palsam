"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error boundary:", error);
  }, [error]);

  const isProdGeneric =
    error.message.includes("Server Components render") ||
    error.message.includes("digest property");

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white border-2 border-rose-200 rounded-2xl shadow-lg p-6 text-center">
        <div className="text-5xl mb-3">⚠️</div>
        <h2 className="text-xl font-bold text-rose-700 mb-2">משהו השתבש</h2>
        <p className="text-sm text-slate-700 mb-3">
          {isProdGeneric
            ? 'התרחשה שגיאה בלתי צפויה בשרת. נסה לרענן את הדף, ואם הבעיה חוזרת — פנה למפ"מ של הגדוד.'
            : error.message}
        </p>
        {error.digest && (
          <p className="text-[11px] text-slate-400 font-mono mb-3">
            קוד תקלה לפנייה: {error.digest}
          </p>
        )}
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => reset()}
            className="bg-rose-600 hover:bg-rose-700 text-white rounded-lg px-4 py-2 text-sm font-medium"
          >
            🔄 נסה שוב
          </button>
          <a
            href="/dashboard"
            className="rounded-lg border border-slate-300 hover:bg-slate-50 px-4 py-2 text-sm"
          >
            חזרה לדשבורד
          </a>
        </div>
      </div>
    </div>
  );
}
