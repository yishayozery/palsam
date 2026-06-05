"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * עוטף את ה-Sidebar במצב responsive.
 * Desktop (md+): סיידבר תמיד גלוי בצד.
 * Mobile (<md): סיידבר מוסתר; hamburger בטופ-בר פותח drawer.
 */
export default function MobileShell({
  sidebar,
  headerBrand,
  children,
}: {
  sidebar: ReactNode;
  headerBrand: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // סגירה אוטומטית בעת מעבר עמוד
  useEffect(() => { setOpen(false); }, [pathname]);

  // נעילת גלילה ב-body כשה-drawer פתוח
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar — תמיד גלוי ב-md+ */}
      <aside className="hidden md:flex w-60 bg-slate-900 text-white flex-col shrink-0 print:hidden">
        {sidebar}
      </aside>

      {/* Mobile drawer — overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          {/* Drawer — RTL ה-side פותח מימין */}
          <aside className="relative w-72 max-w-[85vw] bg-slate-900 text-white flex flex-col shadow-2xl mr-auto animate-slide-in">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-3 left-3 text-slate-300 hover:text-white text-2xl leading-none z-10"
              aria-label="סגור תפריט"
            >
              ✕
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-y-auto bg-slate-100 flex flex-col min-w-0">
        {/* Top bar — מובייל בלבד */}
        <header className="md:hidden sticky top-0 z-30 bg-slate-900 text-white flex items-center justify-between px-3 py-2.5 shadow-md print:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-800 active:bg-slate-700 transition"
            aria-label="פתח תפריט"
          >
            <span className="text-2xl">☰</span>
          </button>
          <div className="flex-1 mr-2 min-w-0">{headerBrand}</div>
        </header>

        <div className="flex-1 p-3 md:p-6">
          <div className="max-w-7xl mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
}
