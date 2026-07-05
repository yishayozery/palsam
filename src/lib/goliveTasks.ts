// המשימות הראשונות לכל תפקיד — מצורפות להודעת ההזמנה כדי לחבר הצטרפות ↔ עלייה-לאוויר.
// (client-safe: אין כאן server-only imports)

export type InviteRole = "admin" | "rep";

export const INVITE_TASKS: Record<InviteRole, { title: string; tasks: string[] }> = {
  admin: {
    title: "מנהל מערכת",
    tasks: [
      "הגדרות גדוד, פלוגות ומחסנים",
      "הקמת משתמשים לכל הגורמים ושליחת הזמנות",
      "מעקב בצ'קליסט העלייה-לאוויר (תפריט: צ'קליסט הקמה)",
    ],
  },
  rep: {
    title: 'רס"פ / מפ',
    tasks: [
      "חיבור הטלגרם שלך לבוט (לתזכורות ודיווח)",
      "החתמת ציוד פלוגתי",
      "דיווח נוכחות יומית",
    ],
  },
};

/** בונה את טקסט ההזמנה — כולל "המשימות הראשונות שלך" אם התפקיד ידוע. */
export function buildInviteText(link: string, role?: InviteRole | null): string {
  let text = `הוזמנת למערכת PALMY. קישור להגדרת סיסמה: ${link}`;
  const spec = role ? INVITE_TASKS[role] : null;
  if (spec) {
    text += `\n\nהמשימות הראשונות שלך (${spec.title}):\n` + spec.tasks.map((t) => `• ${t}`).join("\n");
  }
  return text;
}
