// ===================== הגדרות טפסי תיק נהג =====================
// 3 טפסים מובנים לתיק נהג — מוגדרים כאן פעם אחת ומשמשים גם למילוי וגם להדפסה.
// כל שדה נשמר ב-DriverForm.data לפי key.

export type FormType = "SAFETY_TRACKING" | "SAFETY_CHECKOUT" | "LICENSE_DECLARATION";

export type FieldType = "text" | "date" | "select" | "checkbox" | "passfail" | "textarea" | "grid";

export type GridColumn = { key: string; label: string; options?: string[] };
export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];        // select / passfail
  prefill?: "lastName" | "firstName" | "personalNumber" | "company" | "role" | "civLicNumber" | "civLicGrade" | "civLicExpiry";
  rows?: string[];           // grid — שורות
  columns?: GridColumn[];    // grid — עמודות
  full?: boolean;            // תופס שורה מלאה
};
export type SectionDef = { title: string; note?: string; fields: FieldDef[] };
export type FormDef = { type: FormType; title: string; sections: SectionDef[]; declaration?: string[]; officerOnly?: boolean };

const LEVELS = ["שליטה מלאה", "שליטה חלקית", "חוסר שליטה"];
const PASSFAIL = ["עבר", "נכשל"];

export const DRIVER_FORMS: Record<FormType, FormDef> = {
  SAFETY_TRACKING: {
    type: "SAFETY_TRACKING",
    title: "תיק נהג ומעקב בטיחות",
    sections: [
      {
        title: "פרטים אישיים",
        fields: [
          { key: "lastName", label: "שם משפחה", type: "text", prefill: "lastName" },
          { key: "firstName", label: "שם פרטי", type: "text", prefill: "firstName" },
          { key: "personalNumber", label: "מ.א", type: "text", prefill: "personalNumber" },
          { key: "birthYear", label: "שנת לידה", type: "text" },
          { key: "address", label: "כתובת", type: "text", full: true },
          { key: "maritalStatus", label: "מצב משפחתי", type: "select", options: ["נשוי", "רווק"] },
        ],
      },
      {
        title: "פרטי רישיון הנהיגה האזרחי/צבאי",
        fields: [
          { key: "licenseNumber", label: "מספר רישיון הנהיגה", type: "text", prefill: "civLicNumber" },
          { key: "licenseGrade", label: "דרגת הרישיון", type: "text", prefill: "civLicGrade" },
          { key: "licenseExpiry", label: "בתוקף עד", type: "date", prefill: "civLicExpiry" },
          { key: "permits", label: "היתרי נהיגה", type: "text", full: true },
        ],
      },
      {
        title: "שיבוץ",
        fields: [
          { key: "role", label: "תפקיד", type: "text", prefill: "role" },
          { key: "company", label: "פלוגה", type: "text", prefill: "company" },
        ],
      },
    ],
  },

  SAFETY_CHECKOUT: {
    type: "SAFETY_CHECKOUT",
    title: "תיק נהג — הכשרה ומעקב בטיחות",
    officerOnly: true, // ממולא רק במערכת ע"י קצין רכב/ק.בטיחות — לא נשלח לנהג בבוט
    sections: [
      {
        title: "חלק א' — נראה אישי לחייל ע\"י ק.בטיחות/מפקד",
        fields: [{ key: "partA_done", label: "בוצע נראה אישי", type: "checkbox" }, { key: "partA_note", label: "הערות", type: "text", full: true }],
      },
      {
        title: "חלק ב' — בדיקת רישיונות (צבאי + אזרחי)",
        fields: [
          { key: "partB_grade", label: "דרגת רישיון (B, C1, C, E)", type: "text", prefill: "civLicGrade" },
          { key: "partB_expiry", label: "תוקף רישיון", type: "date", prefill: "civLicExpiry" },
          { key: "partB_number", label: "מספר רישיון", type: "text", prefill: "civLicNumber" },
          { key: "partB_permits", label: "סוגי היתרים", type: "text", full: true },
        ],
      },
      {
        title: "חלק ג' — הדרכה עיונית (כ-30 ד')",
        fields: [{ key: "partC_result", label: "תוצאה", type: "passfail", options: PASSFAIL }],
      },
      {
        title: "חלק ד' — הכרת הרכב (כ-10 ד')",
        fields: [
          { key: "partD_vehicle", label: "מסוג", type: "text", full: true, options: ["אביר", "האמר", "ריאו", "סופה", "פורד"] },
          { key: "partD_result", label: "תוצאה", type: "passfail", options: PASSFAIL },
        ],
      },
      {
        title: "חלק ה' — הדרכה מעשית (כ-20 ד')",
        fields: [
          {
            key: "partE_grid", label: "רמות שליטה", type: "grid",
            rows: ["תרגולת התהפכות", "תפעול הרכב", "בלימת חירום", "נהיגה בעקומות", "דרך סלולה", "דרכי עפר"],
            columns: [{ key: "level", label: "רמת שליטה", options: LEVELS }],
          },
          { key: "partE_notes", label: "הערות", type: "textarea", full: true },
        ],
      },
      {
        title: "חלק ו' — הצהרת החייל",
        fields: [{ key: "partF_declare", label: "הנני מאשר כי אני בקיא בהפעלת הרכב לאחר ביצוע אימון עיוני ומעשי ואני נוהג ברכב בבטחה", type: "checkbox", full: true }],
      },
      {
        title: "חלק ז' — אישור וחתימת ק.בטיחות בדרכים על גבי רישיון צבאי",
        note: "מאושר וחתום ע\"י ק.בטיחות בחתימה בתחתית הטופס.",
        fields: [{ key: "partG_approved", label: "אושר ע\"י ק.בטיחות בדרכים", type: "checkbox", full: true }],
      },
    ],
  },

  LICENSE_DECLARATION: {
    type: "LICENSE_DECLARATION",
    title: "הצהרת בעל רישיון נהיגה",
    declaration: [
      "לפי מיטב ידיעתי, לא נתגלו אצלי מגבלות במערכת העצבים, העצמות, הראייה או השמיעה, ומצב בריאותי הנוכחי כשיר לנהיגה.",
      "לא נפסלתי מלהחזיק ברישיון נהיגה על ידי בית משפט, רשות הרישוי או קצין משטרה, ולחלופין רישיון הנהיגה הנהיגה אשר ברשותי לא הותלה על ידי גורמים כאמור.",
      "אין לי כל מגבלה בריאותית או רפואית המונעת ממני מלהחזיק ברישיון הנהיגה.",
      "אינני צורך סמים.",
      "אינני צורך אלכוהול מעבר לכמות המותרת על פי דין.",
      "אני מצהיר כי לא חל כל שינוי במצב בריאותי במשך חמש השנים האחרונות.",
      "אני מתחייב כי במידה ויוטלו הגבלות כלשהן על רישיון הנהיגה אשר ברשותי, ולחלופין במידה ויחול שינוי במצב בריאותי באופן המונע ממני מלהמשיך ולנהוג, אדווח על כך מיידית לקצין הרכב הגדודי.",
    ],
    sections: [
      {
        title: "הצהרה",
        fields: [{ key: "declare_all", label: "אני מצהיר כי כל הסעיפים לעיל נכונים וכי ההצהרה הנ\"ל היא אמת", type: "checkbox", full: true }],
      },
    ],
  },
};

export const FORM_ORDER: FormType[] = ["SAFETY_TRACKING", "SAFETY_CHECKOUT", "LICENSE_DECLARATION"];
export const FORM_TITLES: Record<FormType, string> = {
  SAFETY_TRACKING: "תיק נהג ומעקב בטיחות",
  SAFETY_CHECKOUT: "הכשרת בטיחות",
  LICENSE_DECLARATION: "הצהרת בעל רישיון נהיגה",
};
export const DEFAULT_VALIDITY_DAYS: Record<FormType, number> = {
  SAFETY_TRACKING: 365,
  SAFETY_CHECKOUT: 365,
  LICENSE_DECLARATION: 365,
};

/** ערכי prefill מתוך נתוני החייל. */
export function prefillValue(
  p: FieldDef["prefill"],
  s: { lastName?: string | null; firstName?: string | null; fullName?: string | null; personalNumber?: string | null; company?: string | null; role?: string | null; civLicNumber?: string | null; civLicGrade?: string | null; civLicExpiry?: string | null },
): string {
  switch (p) {
    case "lastName": return s.lastName ?? (s.fullName ? s.fullName.split(" ").slice(-1)[0] : "") ?? "";
    case "firstName": return s.firstName ?? (s.fullName ? s.fullName.split(" ").slice(0, -1).join(" ") : "") ?? "";
    case "personalNumber": return s.personalNumber ?? "";
    case "company": return s.company ?? "";
    case "role": return s.role ?? "";
    case "civLicNumber": return s.civLicNumber ?? "";
    case "civLicGrade": return s.civLicGrade ?? "";
    case "civLicExpiry": return s.civLicExpiry ?? "";
    default: return "";
  }
}
