/**
 * בריחת HTML לאינטרפולציה בטוחה לתוך document.write / innerHTML.
 * מכסה את כל 5 התווים המסוכנים (כולל מרכאות) — לשימוש בחלונות הדפסה ו-DOM.
 */
export function escapeHtml(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

/**
 * בריחה להודעות Telegram ב-parse_mode:"HTML".
 * Telegram דורש בריחה של &amp; &lt; &gt; בלבד בטקסט — בריחת מרכאות תוצג כטקסט literal, לכן לא.
 */
export function escapeTelegram(v: unknown): string {
  return String(v ?? "").replace(/[&<>]/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string
  ));
}
