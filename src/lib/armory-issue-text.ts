// טקסט טופס ניפוק נשק אישי (טופס 1008).
// מקור-אמת אחד: ההצהרה זהה לנוהל שמירת הנשק הרשמי שהחייל חותם עליו בשלב המקדים
// (weapons-agreement-text.ts). כך הטופס מציג בדיוק את מה שהחייל התחייב לו, ולא נוסח נפרד.
// ניתן לדרוס פר-מחסן דרך Holder.weaponsAgreementText (עורך "תנאי נשק" בהגדרות המחסן).
import { WEAPONS_AGREEMENT_CLAUSES, WEAPONS_AGREEMENT_FOOTER } from "./weapons-agreement-text";

export const ARMORY_ISSUE_TITLE = "אישור לניפוק נשק אישי";

// ההצהרה הרשמית (11 סעיפים) — מקור יחיד המשותף לנוהל ולטופס הניפוק.
export const ARMORY_ISSUE_CLAUSES: readonly string[] = WEAPONS_AGREEMENT_CLAUSES;

export const ARMORY_ISSUE_WARNING = WEAPONS_AGREEMENT_FOOTER;
