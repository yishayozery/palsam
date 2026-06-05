import TabNav from "./TabNav";

export default function SettingsTabs({ active }: { active: "profile" | "org" | "users" | "all-users" }) {
  return (
    <TabNav
      active={active}
      tabs={[
        { key: "profile", label: "פרופיל גדוד", href: "/profile" },
        { key: "org", label: "מבנה ארגוני", href: "/org" },
        { key: "users", label: "מטה גדוד", href: "/users" },
        { key: "all-users", label: "כל המשתמשים", href: "/users/all" },
      ]}
    />
  );
}
