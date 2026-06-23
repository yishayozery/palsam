"use client";

export default function TemplatesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="bg-rose-50 border border-rose-300 rounded-xl p-6 m-4 text-sm text-rose-800">
      <h3 className="font-bold text-lg mb-2">שגיאה בטעינת שבצ&quot;ק קבוע</h3>
      <pre className="text-xs bg-white p-3 rounded overflow-auto max-h-48 mb-3 border border-rose-200 whitespace-pre-wrap">{error.message}{"\n"}{error.stack}</pre>
      <div className="flex gap-2">
        <button onClick={reset} className="bg-rose-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-rose-700">נסה שוב</button>
        <a href="/dispatch" className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm hover:bg-slate-300">חזרה לשבצ&quot;ק</a>
      </div>
    </div>
  );
}
