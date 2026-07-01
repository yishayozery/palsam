"use client";

export default function SignaturesError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-8 max-w-lg mx-auto text-center">
      <h2 className="text-xl font-bold text-red-700 mb-4">שגיאה בדף החתימות</h2>
      <p className="text-slate-600 mb-2">{error.message}</p>
      <button onClick={reset} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
        נסה שוב
      </button>
    </div>
  );
}
