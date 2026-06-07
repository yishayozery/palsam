"use client";

import { useEffect } from "react";

/** ESC במקלדת סוגר את החלון. הופעל רק כש-active=true (כלומר ה-modal פתוח). */
export function useEscClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, onClose]);
}
