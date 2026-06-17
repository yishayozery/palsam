import { HDate, HebrewCalendar, flags } from "@hebcal/core";

export type DayInfo = {
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 0=Sun
  dayLabel: string; // "א׳", "ב׳"...
  gregDay: number;
  gregMonth: number;
  hebrewDate: string; // "כ״ג סיון"
  holiday: string | null;
  isShabbat: boolean;
  isHoliday: boolean;
};

const DAY_NAMES = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const HEB_MONTHS: Record<string, string> = {
  January: "ינואר", February: "פברואר", March: "מרס", April: "אפריל",
  May: "מאי", June: "יוני", July: "יולי", August: "אוגוסט",
  September: "ספטמבר", October: "אוקטובר", November: "נובמבר", December: "דצמבר",
};

export function getMonthLabel(year: number, month: number): string {
  const d = new Date(year, month - 1, 1);
  const eng = d.toLocaleString("en-US", { month: "long" });
  return `${HEB_MONTHS[eng] ?? eng} ${year}`;
}

export function getDaysForRange(startDate: string, days: number): DayInfo[] {
  const result: DayInfo[] = [];
  const start = new Date(startDate);

  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;

    const hd = new HDate(d);
    const hebrewDate = hd.renderGematriya(true);

    const events = HebrewCalendar.getHolidaysOnDate(hd, true) ?? [];
    const majorHoliday = events.find(
      (e) => e.getFlags() & (flags.CHAG | flags.YOM_TOV_ENDS | flags.MAJOR_FAST | flags.LIGHT_CANDLES),
    );
    const holiday = majorHoliday?.renderBrief("he") ?? null;
    const isShabbat = d.getDay() === 6;
    const isHoliday = !!majorHoliday;

    result.push({
      date: dateStr,
      dayOfWeek: d.getDay(),
      dayLabel: DAY_NAMES[d.getDay()],
      gregDay: d.getDate(),
      gregMonth: d.getMonth() + 1,
      hebrewDate,
      holiday,
      isShabbat,
      isHoliday,
    });
  }

  return result;
}
