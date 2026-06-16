"use client";

const MY_EQUIPMENT_URL = "https://palsam.vercel.app/my-equipment";

export default function IneligibilityActions({ soldierName, phone, armoryTestUrl }: {
  soldierName: string; phone: string; armoryTestUrl: string | null;
}) {
  const lines = [
    `היי ${soldierName},`,
    "",
    "כדי לקבל נשק, צריך להשלים את התהליך:",
    `1. היכנס ללינק: ${MY_EQUIPMENT_URL}`,
    `2. הזן שם מלא + מספר אישי`,
    ...(armoryTestUrl ? [`3. עבור את המבחן: ${armoryTestUrl}`] : []),
    `${armoryTestUrl ? "4" : "3"}. העלה צילום מסך של המבחן שעברת`,
    "",
    "בהצלחה! 🔫",
  ];
  const clean = phone.replace(/\D/g, "");
  const intl = clean.startsWith("0") ? `972${clean.slice(1)}` : clean;
  const url = `https://wa.me/${intl}?text=${encodeURIComponent(lines.join("\n"))}`;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="text-xs bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-lg px-2 py-1 whitespace-nowrap">
      📲 שלח
    </a>
  );
}
