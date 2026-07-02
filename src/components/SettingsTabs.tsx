import TabNav from "./TabNav";

export default function SettingsTabs({ active }: { active: "profile" | "ops" | "weapons" | "org" | "all-users" | "roles" }) {
  return (
    <TabNav
      active={active}
      tabs={[
        { key: "profile", label: "פרופיל גדוד", href: "/profile" },
        { key: "ops", label: "הגדרות תפעול", href: "/settings" },
        { key: "weapons", label: "תנאי נשק", href: "/weapons-policy" },
        { key: "org", label: "מבנה ארגוני", href: "/org" },
        { key: "all-users", label: "משתמשים", href: "/users/all" },
        { key: "roles", label: "הרשאות ותפקידים", href: "/roles" },
      ]}
    />
  );
}
