import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

type CheckItem = {
  label: string;
  href: string;
  done: boolean;
  detail: string;
  required: boolean;
};

export default async function SetupChecklistPage() {
  const user = await requireCapability("battalion.profile");
  const bId = user.battalionId!;

  const [
    battalion,
    companiesCount,
    warehousesCount,
    squadsCount,
    usersCount,
    categoriesCount,
    itemTypesCount,
    soldiersCount,
    enlistedCount,
    stockCount,
    serialCount,
    statusesCount,
    attendanceStatusCount,
    companyRolesCount,
    countPlansCount,
    allocationsCount,
    baselinesCount,
    kitsCount,
  ] = await Promise.all([
    prisma.battalion.findUnique({ where: { id: bId }, select: { name: true, commander: true, brigade: true, logoData: true, telegramBotToken: true, notificationEmail: true, senderEmail: true } }),
    prisma.holder.count({ where: { battalionId: bId, kind: "COMPANY", active: true } }),
    prisma.holder.count({ where: { battalionId: bId, kind: "WAREHOUSE", active: true } }),
    prisma.squad.count({ where: { battalionId: bId, active: true } }),
    prisma.appUser.count({ where: { battalionId: bId, active: true } }),
    prisma.category.count({ where: { battalionId: bId, active: true } }),
    prisma.itemType.count({ where: { battalionId: bId, active: true } }),
    prisma.soldier.count({ where: { battalionId: bId } }),
    prisma.soldier.count({ where: { battalionId: bId, status: "ENLISTED" } }),
    prisma.stockBalance.count({ where: { battalionId: bId, quantity: { gt: 0 } } }),
    prisma.serialUnit.count({ where: { battalionId: bId, dischargedAt: null } }),
    prisma.itemStatus.count({ where: { battalionId: bId, active: true } }),
    prisma.attendanceStatus.count({ where: { battalionId: bId, active: true } }),
    prisma.companyRole.count({ where: { battalionId: bId, active: true } }),
    prisma.countPlan.count({ where: { battalionId: bId, active: true } }),
    prisma.companyAllocation.count({ where: { battalionId: bId } }),
    prisma.companyItemBaseline.count({ where: { battalionId: bId } }),
    prisma.kitInstance.count({ where: { battalionId: bId } }),
  ]);

  const hasProfile = !!(battalion?.commander || battalion?.brigade || battalion?.logoData);

  const groups: { title: string; items: CheckItem[] }[] = [
    {
      title: "מבנה ארגוני",
      items: [
        { label: "הגדרות גדוד (שם, מפקד, חטיבה, לוגו)", href: "/profile", done: hasProfile, detail: hasProfile ? "מוגדר" : "טרם הוגדר", required: true },
        { label: "הקמת פלוגות", href: "/profile", done: companiesCount > 0, detail: `${companiesCount} פלוגות`, required: true },
        { label: "הקמת מחסנים", href: "/warehouses", done: warehousesCount > 0, detail: `${warehousesCount} מחסנים`, required: true },
        { label: "הקמת מחלקות בפלוגות", href: "/soldiers", done: squadsCount > 0, detail: `${squadsCount} מחלקות`, required: true },
        { label: "הגדרת תפקידים בפלוגה (מ\"פ, סמ\"פ...)", href: "/soldiers", done: companyRolesCount > 0, detail: `${companyRolesCount} תפקידים`, required: false },
      ],
    },
    {
      title: "משתמשים",
      items: [
        { label: "הקמת משתמשים (קצין מחסן, רס\"פ, שליש...)", href: "/users/all", done: usersCount > 1, detail: `${usersCount} משתמשים`, required: true },
      ],
    },
    {
      title: "התראות (טלגרם + מייל)",
      items: [
        { label: "בוט טלגרם — טוקן + רישום Webhook", href: "/settings", done: !!battalion?.telegramBotToken, detail: battalion?.telegramBotToken ? "מוגדר" : "טרם הוגדר (BotFather → טוקן → /settings)", required: false },
        { label: "מייל התראות (לאן נשלחות ההתראות)", href: "/settings", done: !!battalion?.notificationEmail, detail: battalion?.notificationEmail || "טרם הוגדר — יכול להיות כל Gmail", required: false },
        { label: "כתובת שליחה (From) — רק אם דומיין מאומת ב-Resend", href: "/settings", done: !!battalion?.senderEmail, detail: battalion?.senderEmail || "השאר ריק אם אין דומיין מאומת (משתמש בברירת מחדל)", required: false },
      ],
    },
    {
      title: "קטלוג פריטים",
      items: [
        { label: "הגדרת קטגוריות", href: "/items", done: categoriesCount > 0, detail: `${categoriesCount} קטגוריות`, required: true },
        { label: "הגדרת פריטים", href: "/items", done: itemTypesCount > 0, detail: `${itemTypesCount} פריטים`, required: true },
        { label: "סטטוסי פריטים (תקין, בלאי, אבוד...)", href: "/items", done: statusesCount > 0, detail: `${statusesCount} סטטוסים`, required: true },
      ],
    },
    {
      title: "חיילים",
      items: [
        { label: "קליטת חיילים (ייבוא / ידני)", href: "/soldiers", done: soldiersCount > 0, detail: `${soldiersCount} חיילים`, required: true },
        { label: "אישור גיוס לחיילים", href: "/roster", done: enlistedCount > 0, detail: `${enlistedCount} מאושרים`, required: true },
      ],
    },
    {
      title: "מלאי",
      items: [
        { label: "קליטת מלאי ראשוני למחסנים", href: "/stock", done: stockCount > 0 || serialCount > 0, detail: `${stockCount} יתרות כמותיות, ${serialCount} יחידות סריאליות`, required: true },
      ],
    },
    {
      title: "הגדרות נוספות (אופציונלי)",
      items: [
        { label: "סטטוסי נוכחות", href: "/attendance-settings", done: attendanceStatusCount > 0, detail: `${attendanceStatusCount} סטטוסים`, required: false },
        { label: "ערכות החתמה (קיטים)", href: "/kits", done: kitsCount > 0, detail: `${kitsCount} תבניות`, required: false },
        { label: "הקצאות ציוד לפלוגה", href: "/armory-allocations", done: allocationsCount > 0, detail: `${allocationsCount} הקצאות`, required: false },
        { label: "ציוד קבוע לפלוגה", href: "/permanent-items", done: baselinesCount > 0, detail: `${baselinesCount} הגדרות`, required: false },
        { label: "תכניות ספירה", href: "/counts/plans", done: countPlansCount > 0, detail: `${countPlansCount} תכניות`, required: false },
      ],
    },
  ];

  const allRequired = groups.flatMap((g) => g.items.filter((i) => i.required));
  const doneRequired = allRequired.filter((i) => i.done).length;
  const totalRequired = allRequired.length;
  const pct = totalRequired > 0 ? Math.round((doneRequired / totalRequired) * 100) : 0;

  const allItems = groups.flatMap((g) => g.items);
  const totalDone = allItems.filter((i) => i.done).length;

  return (
    <div>
      <PageHeader
        title="📋 צ'קליסט הקמת גדוד"
        subtitle="מעקב אחר שלבי ההקמה — סטטוס מתעדכן אוטומטית לפי מה שקיים במערכת"
      />

      <Card className="p-4 mb-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-slate-700">
                התקדמות חובה: {doneRequired}/{totalRequired}
              </span>
              <span className="text-sm font-bold text-slate-900">{pct}%</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : "bg-blue-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div className="text-xs text-slate-500">
            סה&quot;כ: {totalDone}/{allItems.length} שלבים הושלמו
          </div>
        </div>
        {pct === 100 && (
          <div className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-center font-medium">
            ✅ כל שלבי החובה הושלמו — הגדוד מוכן לעבודה!
          </div>
        )}
      </Card>

      <div className="space-y-4">
        {groups.map((g) => (
          <Card key={g.title} className="overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2">
              <h2 className="font-bold text-sm text-slate-700">{g.title}</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {g.items.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition"
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                    item.done
                      ? "bg-emerald-100 text-emerald-600"
                      : item.required
                        ? "bg-red-100 text-red-400"
                        : "bg-slate-100 text-slate-400"
                  }`}>
                    {item.done ? "✓" : item.required ? "!" : "○"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${item.done ? "text-slate-500" : "text-slate-800"}`}>
                      {item.label}
                      {!item.required && <span className="text-[10px] text-slate-400 mr-1">(אופציונלי)</span>}
                    </div>
                    <div className="text-xs text-slate-400">{item.detail}</div>
                  </div>
                  <span className="text-slate-300 text-sm">←</span>
                </Link>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
