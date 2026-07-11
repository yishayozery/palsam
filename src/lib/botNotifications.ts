import { prisma } from "@/lib/prisma";

/** תזכורות בוט מובנות — מוצגות ונשלטות במסך "הודעות בוט". */
export const DEFAULT_RULES: { key: string; name: string; description: string; daysBefore: number; recipients: string }[] = [
  { key: "maintenance-reminder", name: "🔧 תזכורת טיפול רכב", description: "רשימת הרכבים שיש להם טיפול, יום לפני המועד", daysBefore: 1, recipients: "vehicle-officer,signed-holder" },
  { key: "attendance-morning", name: "🗓️ תזכורת דיווח נוכחות", description: "תזכורת בוקר לנאמני כ״א לדווח נוכחות", daysBefore: 0, recipients: "attendance-reporters" },
  { key: "counts-overdue", name: "📊 תזכורת ספירה באיחור", description: "התראה על משימות ספירה שחלף מועד היעד שלהן", daysBefore: 0, recipients: "counters" },
];

/** תוויות קבוצות נמענים (לתצוגה במסך). */
export const RECIPIENT_LABELS: Record<string, string> = {
  "vehicle-officer": "קצין רכב",
  "signed-holder": "החייל החתום על הרכב",
  "attendance-reporters": "נאמני כ״א",
  "counters": "אחראי ספירה",
  "company-reps": "נציגי פלוגה",
};
export const ALL_RECIPIENT_TAGS = Object.keys(RECIPIENT_LABELS);

/** יצירת חוקי ברירת-המחדל לגדוד אם עדיין לא קיימים (לא דורס עריכות משתמש). */
export async function ensureNotificationRules(battalionId: string) {
  const existing = await prisma.botNotificationRule.findMany({ where: { battalionId }, select: { key: true } });
  const have = new Set(existing.map((r) => r.key));
  const missing = DEFAULT_RULES.filter((r) => !have.has(r.key));
  if (missing.length) {
    await prisma.botNotificationRule.createMany({
      data: missing.map((r) => ({ battalionId, key: r.key, name: r.name, description: r.description, daysBefore: r.daysBefore, recipients: r.recipients })),
      skipDuplicates: true,
    });
  }
}
