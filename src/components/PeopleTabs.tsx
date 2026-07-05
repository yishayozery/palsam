import TabNav from "./TabNav";

/** תת-ניווט לאזור "חיילים" — חיילי הפלוגה / הצוות שלי / הסמכות. */
export default function PeopleTabs({ active }: { active: "soldiers" | "team" | "certifications" }) {
  return (
    <TabNav
      active={active}
      tabs={[
        { key: "soldiers", label: "👤 חיילי הפלוגה", href: "/soldiers" },
        { key: "team", label: "🧑‍🤝‍🧑 הצוות שלי", href: "/team" },
        { key: "certifications", label: "🎖️ הסמכות", href: "/certifications" },
      ]}
    />
  );
}
