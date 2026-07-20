import { describe, it, expect } from "vitest";
import { buildForecast, enumerateDates } from "@/lib/forecast";

const STATUSES = [
  { id: "in", inService: true },   // בשמ"פ
  { id: "hol", inService: false }, // חול
  { id: "stu", inService: false }, // לימודים
];

describe("buildForecast", () => {
  it("חייל ללא צו אינו מגויס — לא נספר ואינו נעדר", () => {
    const fc = buildForecast([], [], STATUSES);
    expect(fc.stateOf("s1", "2026-08-01")).toBe("NOT_ORDERED");
    expect(fc.countOn(["s1"], "2026-08-01")).toEqual({ inService: 0, absent: 0, notOrdered: 1, total: 1 });
  });

  it("בתוך הצו וללא חריג — בשמ״פ", () => {
    const fc = buildForecast([{ soldierId: "s1", startDate: "2026-08-01", endDate: "2026-08-10" }], [], STATUSES);
    expect(fc.stateOf("s1", "2026-08-05")).toBe("IN_SERVICE");
  });

  it("מחוץ לגבולות הצו — לא מגויס, גם יום אחד לפני ואחרי", () => {
    const fc = buildForecast([{ soldierId: "s1", startDate: "2026-08-01", endDate: "2026-08-10" }], [], STATUSES);
    expect(fc.stateOf("s1", "2026-07-31")).toBe("NOT_ORDERED");
    expect(fc.stateOf("s1", "2026-08-11")).toBe("NOT_ORDERED");
    expect(fc.stateOf("s1", "2026-08-01")).toBe("IN_SERVICE");
    expect(fc.stateOf("s1", "2026-08-10")).toBe("IN_SERVICE");
  });

  it("חריג בתוך הצו — נעדר, והסיבה זמינה", () => {
    const fc = buildForecast(
      [{ soldierId: "s1", startDate: "2026-08-01", endDate: "2026-08-10" }],
      [{ soldierId: "s1", date: "2026-08-05", statusId: "hol" }],
      STATUSES,
    );
    expect(fc.stateOf("s1", "2026-08-05")).toBe("ABSENT");
    expect(fc.exceptionOf("s1", "2026-08-05")).toBe("hol");
    expect(fc.exceptionOf("s1", "2026-08-04")).toBeNull();
  });

  it("חריג מחוץ לצו אינו הופך אותו למגויס", () => {
    const fc = buildForecast(
      [{ soldierId: "s1", startDate: "2026-08-01", endDate: "2026-08-10" }],
      [{ soldierId: "s1", date: "2026-08-20", statusId: "hol" }],
      STATUSES,
    );
    expect(fc.stateOf("s1", "2026-08-20")).toBe("NOT_ORDERED");
    expect(fc.exceptionOf("s1", "2026-08-20")).toBeNull();
  });

  it("חריג עם סטטוס בשמ״פ אינו היעדרות", () => {
    const fc = buildForecast(
      [{ soldierId: "s1", startDate: "2026-08-01", endDate: "2026-08-10" }],
      [{ soldierId: "s1", date: "2026-08-05", statusId: "in" }],
      STATUSES,
    );
    expect(fc.stateOf("s1", "2026-08-05")).toBe("IN_SERVICE");
  });

  it("ימים מפוצלים — שני פרקי היעדרות באותו צו", () => {
    const fc = buildForecast(
      [{ soldierId: "s1", startDate: "2026-08-01", endDate: "2026-08-10" }],
      [
        { soldierId: "s1", date: "2026-08-02", statusId: "hol" },
        { soldierId: "s1", date: "2026-08-08", statusId: "stu" },
      ],
      STATUSES,
    );
    expect(fc.stateOf("s1", "2026-08-02")).toBe("ABSENT");
    expect(fc.stateOf("s1", "2026-08-05")).toBe("IN_SERVICE");
    expect(fc.stateOf("s1", "2026-08-08")).toBe("ABSENT");
    expect(fc.exceptionOf("s1", "2026-08-08")).toBe("stu");
  });

  it("countOn מפריד שלושה מצבים בקבוצה", () => {
    const fc = buildForecast(
      [
        { soldierId: "a", startDate: "2026-08-01", endDate: "2026-08-10" },
        { soldierId: "b", startDate: "2026-08-01", endDate: "2026-08-10" },
        { soldierId: "c", startDate: "2026-08-01", endDate: "2026-08-03" }, // צו קצר — הסתיים
      ],
      [{ soldierId: "b", date: "2026-08-05", statusId: "hol" }],
      STATUSES,
    );
    // d = מחוץ לצו לגמרי (אין לו רשומה)
    expect(fc.countOn(["a", "b", "c", "d"], "2026-08-05"))
      .toEqual({ inService: 1, absent: 1, notOrdered: 2, total: 4 });
  });

  it("orderOf מחזיר את הצו או null", () => {
    const o = { soldierId: "s1", startDate: "2026-08-01", endDate: "2026-08-10" };
    const fc = buildForecast([o], [], STATUSES);
    expect(fc.orderOf("s1")).toEqual(o);
    expect(fc.orderOf("nobody")).toBeNull();
  });
});

describe("enumerateDates", () => {
  it("כולל את שני הקצוות", () => {
    expect(enumerateDates("2026-08-01", "2026-08-04"))
      .toEqual(["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04"]);
  });

  it("יום בודד", () => {
    expect(enumerateDates("2026-08-01", "2026-08-01")).toEqual(["2026-08-01"]);
  });

  it("חוצה גבול חודש", () => {
    expect(enumerateDates("2026-07-30", "2026-08-02"))
      .toEqual(["2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02"]);
  });

  it("טווח הפוך מחזיר ריק", () => {
    expect(enumerateDates("2026-08-10", "2026-08-01")).toEqual([]);
  });

  it("מכבד את התקרה", () => {
    expect(enumerateDates("2026-01-01", "2026-12-31", 30)).toHaveLength(30);
  });
});
