"use client";

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
      <div className="text-center space-y-4">
        <div className="text-6xl">📡</div>
        <h1 className="text-2xl font-bold text-slate-800">אין חיבור לאינטרנט</h1>
        <p className="text-slate-500">המערכת דורשת חיבור פעיל. בדוק את הרשת ונסה שוב.</p>
        <button onClick={() => window.location.reload()}
          className="bg-slate-800 text-white rounded-lg px-6 py-2 text-sm hover:bg-slate-900">
          נסה שוב
        </button>
      </div>
    </div>
  );
}
