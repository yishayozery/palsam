const XLSX = require("xlsx");
const { PrismaClient } = require("../src/generated/prisma");
const p = new PrismaClient();

const BASE_URL = "https://www.palmy.co.il";

async function main() {
  const bId = "cmqosgamj0000l704pyypi764";

  const users = await p.appUser.findMany({
    where: { battalionId: bId },
    include: {
      holder: { select: { name: true, kind: true } },
      assignedHolders: { include: { holder: { select: { name: true, kind: true } } } },
      assignedSquads: { include: { squad: { select: { name: true } } } },
      systemRole: { select: { name: true } },
      soldier: {
        select: {
          fullName: true,
          personalNumber: true,
          phone: true,
          company: { select: { name: true } },
          companyRole: { select: { name: true } },
          squad: { select: { name: true } },
        },
      },
    },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
  });

  const ROLE_LABELS = {
    BATTALION_ADMIN: "מנהל מערכת",
    WAREHOUSE_MANAGER: "מנהל מחסן",
    COMPANY_REP: "נציג פלוגה",
    SHALISH: "שליש",
    MAGAD: 'מג"ד',
    SAMAGAD: 'סמג"ד',
    VIEWER: "צופה",
  };

  // Sheet 1: Users — detailed per row
  const ws1Data = users.map((u, i) => ({
    "#": i + 1,
    "שם משתמש": u.username,
    "שם מלא": u.fullName,
    "טלפון": u.phone || "",
    "תואר/כינוי": u.title || "",
    "role (מערכת)": ROLE_LABELS[u.role] || u.role,
    "תפקיד (systemRole)": u.systemRole?.name || "-",
    "שיוך ראשי": u.holder?.name || "-",
    "סוג שיוך": u.holder?.kind === "COMPANY" ? "פלוגה" : u.holder?.kind === "WAREHOUSE" ? "מחסן" : "-",
    "שיוכים נוספים": u.assignedHolders.filter((h) => h.holderId !== u.holderId).map((h) => h.holder.name).join(", ") || "-",
    "מחלקות משויכות": u.assignedSquads.map((s) => s.squad.name).join(", ") || "כל הפלוגה",
    "חייל מקושר": u.soldier?.fullName || "-",
    'מ.א. חייל': u.soldier?.personalNumber || "-",
    "טלפון חייל": u.soldier?.phone || "-",
    "פלוגת חייל": u.soldier?.company?.name || "-",
    "תפקיד חייל": u.soldier?.companyRole?.name || "-",
    "מחלקת חייל": u.soldier?.squad?.name || "-",
    "סטטוס": u.active ? "פעיל" : "מושבת",
    "סיסמה": u.passwordSet ? "הוגדרה" : "ממתין להזמנה",
    "קישור הזמנה": u.inviteToken ? `${BASE_URL}/invite/${u.inviteToken}` : u.passwordSet ? "כבר הוגדרה" : "-",
  }));

  const ws1 = XLSX.utils.json_to_sheet(ws1Data);
  ws1["!cols"] = [
    { wch: 4 },  // #
    { wch: 12 }, // username
    { wch: 20 }, // fullName
    { wch: 14 }, // phone
    { wch: 12 }, // title
    { wch: 16 }, // role
    { wch: 16 }, // systemRole
    { wch: 14 }, // holder
    { wch: 10 }, // holderKind
    { wch: 18 }, // extraHolders
    { wch: 18 }, // squads
    { wch: 20 }, // soldierName
    { wch: 10 }, // soldierPN
    { wch: 14 }, // soldierPhone
    { wch: 14 }, // soldierCompany
    { wch: 14 }, // soldierRole
    { wch: 18 }, // soldierSquad
    { wch: 10 }, // status
    { wch: 16 }, // passwordSet
    { wch: 55 }, // invite link
  ];

  // Sheet 2: System roles
  const sysRoles = await p.systemRole.findMany({
    where: { battalionId: bId, active: true },
    include: {
      permissions: true,
      users: { select: { fullName: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  const ws2Data = sysRoles.map((r) => ({
    "תפקיד": r.name,
    "משתמשים": r.users.length,
    "מנהל": r.isAdmin ? "כן" : "לא",
    "מפקד": r.isCommander ? "כן" : "לא",
    "מסכים": r.permissions.map((pp) => pp.screen).join(", "),
    "שמות משתמשים": r.users.map((u) => u.fullName).join(", ") || "ללא יוזר",
  }));

  const ws2 = XLSX.utils.json_to_sheet(ws2Data);
  ws2["!cols"] = [{ wch: 18 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 80 }, { wch: 40 }];

  // Sheet 3: Checklist
  const itemCount = await p.itemType.count({ where: { battalionId: bId, active: true } });
  const templateCount = await p.dispatchTemplate.count({ where: { battalionId: bId } });
  const certCount = await p.certificationType.count({ where: { battalionId: bId, active: true } });
  const dlCount = await p.drivingLicenseType.count({ where: { battalionId: bId, active: true } });
  const empCount = await p.employment.count({ where: { battalionId: bId, active: true } });
  const soldierCount = await p.soldier.count({ where: { battalionId: bId, status: { not: "DISCHARGED" } } });

  const checklist = [
    { item: "פרופיל גדוד (שם, קוד, חטיבה, מוטו)", status: "הושלם", note: 'גדסם 4, קוד 5554, חטיבה 4, מוטו: עד הנצחון' },
    { item: "לוגו גדוד", status: "חסר", note: "לא הועלה לוגו" },
    { item: "מבנה ארגוני - פלוגות", status: "הושלם", note: 'אגם, טנא, מפקדה, פלה"ק, פת"ן, שינוע' },
    { item: "מבנה ארגוני - מחלקות", status: "הושלם", note: "18 מחלקות תחת הפלוגות" },
    { item: "מחסנים", status: "הושלם", note: "6 מחסנים: ארמון, בונקר חמידה, ציוד, רכבים, רפואה, תקשוב" },
    { item: "חיילים", status: "הושלם", note: `${soldierCount} חיילים` },
    { item: "הגדרת פריטים (קטלוג)", status: "הושלם", note: `${itemCount} סוגי פריטים` },
    { item: 'תבניות שבצ"ק', status: "הושלם", note: `${templateCount} תבניות` },
    { item: "סוגי הסמכות", status: "הושלם", note: `${certCount} סוגי הסמכות` },
    { item: "סוגי רישיון נהיגה", status: "הושלם", note: `${dlCount} סוגי רישיון` },
    { item: "תפקידים והרשאות", status: "הושלם", note: `${sysRoles.length} תפקידים מוגדרים` },
    { item: "משתמשים", status: "הושלם", note: `${users.length} משתמשים` },
    { item: "הזמנת משתמשים", status: "חלקי", note: `רק RAVIDG הגדיר סיסמה. ${users.filter((u) => !u.passwordSet).length} ממתינים` },
    { item: "דומיין palmy.co.il", status: "ממתין", note: "צריך להגדיר NEXT_PUBLIC_APP_URL ב-Vercel ולחבר דומיין" },
    { item: "תעסוקות", status: "חלקי", note: `רק ${empCount} תעסוקה. צריך להגדיר את כל התעסוקות` },
    { item: "ציוד קבוע לפלוגה", status: "הושלם", note: "הוגדרו baselines" },
    { item: "תפקידים ללא יוזר", status: "מידע", note: sysRoles.filter((r) => r.users.length === 0).map((r) => r.name).join(", ") },
  ];

  const ws3 = XLSX.utils.json_to_sheet(checklist.map((c) => ({
    "פריט": c.item,
    "סטטוס": c.status,
    "הערה": c.note,
  })));
  ws3["!cols"] = [{ wch: 35 }, { wch: 14 }, { wch: 70 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, "משתמשים");
  XLSX.utils.book_append_sheet(wb, ws2, "תפקידים");
  XLSX.utils.book_append_sheet(wb, ws3, "צקליסט");

  const outPath = "C:/Users/ASUS/Desktop/gadsam4_users_checklist.xlsx";
  XLSX.writeFile(wb, outPath);
  console.log("Written to", outPath);
}

main().then(() => process.exit(0));
