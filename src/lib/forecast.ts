/**
 * תחזית הגעה — שלוש שכבות, לפי הסדר:
 *   1. תעסוקה  — טווח התאריכים הכללי (Employment)
 *   2. צו       — טווח הגיוס של החייל, יכול להיות שונה (ForecastOrder)
 *   3. חריג     — יום בתוך הצו שבו החייל לא מגיע, עם סיבה (ForecastEntry)
 *
 * ⚠️ ללא צו החייל **אינו מגויס** ואינו נספר. זו ההבחנה המרכזית:
 *    "מחוץ לצו" ≠ "נעדר" — הראשון תקין, השני דורש טיפול.
 */

export type OrderRange = { soldierId: string; startDate: string; endDate: string };
export type ExceptionEntry = { soldierId: string; date: string; statusId: string };
export type ForecastStatusLite = { id: string; inService: boolean };

export type DayState = "IN_SERVICE" | "ABSENT" | "NOT_ORDERED";

/** מצב חייל ביום — בונים פעם אחת ומשתמשים בכל המסכים. */
export function buildForecast(
  orders: OrderRange[],
  exceptions: ExceptionEntry[],
  statuses: ForecastStatusLite[],
) {
  const orderBy = new Map<string, OrderRange>();
  for (const o of orders) orderBy.set(o.soldierId, o);

  const inServiceStatus = new Set(statuses.filter((s) => s.inService).map((s) => s.id));
  const exceptionBy = new Map<string, string>();
  for (const e of exceptions) exceptionBy.set(`${e.soldierId}|${e.date}`, e.statusId);

  function stateOf(soldierId: string, date: string): DayState {
    const o = orderBy.get(soldierId);
    if (!o || date < o.startDate || date > o.endDate) return "NOT_ORDERED";
    const ex = exceptionBy.get(`${soldierId}|${date}`);
    // חריג עם סטטוס "בשמ"פ" אינו היעדרות — הוא רק תיעוד
    if (ex && !inServiceStatus.has(ex)) return "ABSENT";
    return "IN_SERVICE";
  }

  return {
    stateOf,
    orderOf: (soldierId: string) => orderBy.get(soldierId) ?? null,
    exceptionOf: (soldierId: string, date: string) => {
      const ex = exceptionBy.get(`${soldierId}|${date}`);
      return ex && !inServiceStatus.has(ex) ? ex : null;
    },
    /** ספירה לקבוצת חיילים ביום — הבסיס לכל הסיכומים */
    countOn(soldierIds: string[], date: string) {
      let inService = 0, absent = 0, notOrdered = 0;
      for (const id of soldierIds) {
        const st = stateOf(id, date);
        if (st === "IN_SERVICE") inService++;
        else if (st === "ABSENT") absent++;
        else notOrdered++;
      }
      return { inService, absent, notOrdered, total: soldierIds.length };
    },
  };
}

export type Forecast = ReturnType<typeof buildForecast>;

/** רשימת תאריכים (YYYY-MM-DD) בין שני תאריכים, כולל. */
export function enumerateDates(start: string, end: string, cap = 400): string[] {
  const out: string[] = [];
  for (const d = new Date(start + "T00:00:00Z"); d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
    if (out.length >= cap) break;
  }
  return out;
}
