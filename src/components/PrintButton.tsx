"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-900 print:hidden"
    >
      🖨️ הדפסה / שמירה כ-PDF
    </button>
  );
}
