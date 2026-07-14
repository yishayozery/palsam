/** אפשרויות מזון/כשרות לחייל — משותף למסך הפלוגה ולבוט העדכון העצמי. */
export const DIET_OPTIONS = ["ללא", "ציליאק", "טבעוני", "צמחוני", 'כשרות בד"ץ'] as const;
export type DietOption = (typeof DIET_OPTIONS)[number];

/** אימוג'י מלווה לתצוגה קומפקטית. */
export const DIET_ICON: Record<string, string> = {
  "ציליאק": "🌾",
  "טבעוני": "🥦",
  "צמחוני": "🥗",
  'כשרות בד"ץ': "✡️",
  "ללא": "",
};
