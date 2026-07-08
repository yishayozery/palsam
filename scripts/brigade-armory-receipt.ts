import { PrismaClient } from "../src/generated/prisma";
import ExcelJS from "exceljs";
const p = new PrismaClient();

// ===== תמלול הטפסים (תעודת מפקד אפסניה — חטיבה→ארמון) =====
// כל פריט: { n: מספר כפי שנקרא, name: שם פריט כפי שנקרא (best-effort), qty }
type Row = { n: string; name: string; qty: number };
type Form = { form: string; brigade: string; date: string; serials: Row[]; qtys: Row[] };

const FORMS: Form[] = [
  {
    form: "טופס 1 (454xxxxx)", brigade: "", date: "05.07.26",
    serials: [
      "45401301","45401286","45402495","45402498","45401275","45401279","45402497","45401290","45401294","45402436",
      "45401276","45401340","45401143","45401289","45401319","45401343","45401349","45401282","45401295","45401287","45401323",
    ].map((n) => ({ n, name: "", qty: 1 })),
    qtys: [ { n: "", name: "שורת סיכום 1", qty: 21 }, { n: "", name: "שורת סיכום 2", qty: -21 }, { n: "", name: "שורת סיכום 3", qty: -21 } ],
  },
  {
    form: "טופס 2 (2510xxxx — עמ' 1)", brigade: "", date: "05.07.26",
    serials: [
      "25102317","25102355","25102036","25102346","25100238","25102245","25102109","25101385","25101008","25102349",
      "25102264","25102330","25100813","25102265","25102133","25101503","25102125","25101085","25102253","25102136","25101386",
    ].map((n) => ({ n, name: "", qty: 1 })),
    qtys: [ { n: "", name: "רובה אישית", qty: 85 }, { n: "", name: "חוגר תקני", qty: 45 }, { n: "", name: "אפוד מטח קל", qty: 90 }, { n: "", name: "קנה מטח קל", qty: 90 } ],
  },
  {
    form: "טופס 2 (2510xxxx — עמ' 2)", brigade: "", date: "05.07.26",
    serials: [
      "25101526","25101045","25102763","25102142","25101543","25100858","25101484","25102135","25102239","25100015",
      "25102266","25102255","25102429","25102147","25101394","25102302","25102406","25101510","25100981","25102100",
      "25101502","25102470","25102023","25101174",
    ].map((n) => ({ n, name: "", qty: 1 })),
    qtys: [],
  },
  {
    form: "טופס 3 (חטיבה 8)", brigade: "8", date: "26.07.05",
    serials: [],
    qtys: [ { n: "", name: "כלולה אלמן", qty: 5 }, { n: "", name: "חוגר", qty: 5 }, { n: "", name: "חגורה", qty: 5 }, { n: "", name: "קנה", qty: 5 } ],
  },
  {
    form: "טופס 4 (6/7 ספרות)", brigade: "", date: "05.07.26",
    serials: [
      "66084569","7201867","68000391","68000371","70000937","7202767","68000732","68000286","6203199","72026669",
    ].map((n) => ({ n, name: "", qty: 1 })),
    qtys: [ { n: "", name: "קנה אלמן חי", qty: 10 }, { n: "", name: "אחר חי מאגר", qty: 50 }, { n: "", name: "כלולה", qty: 50 } ],
  },
  {
    form: "טופס 5 (231xxx / 39xxx)", brigade: "", date: "05.07.26",
    serials: [ "231826","231845","231832","39425","39429","39430" ].map((n) => ({ n, name: "", qty: 1 })),
    qtys: [ { n: "", name: "שורות יתרה מעורבות", qty: 0 } ],
  },
];

async function main() {
  const bat = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true } });
  const allNumbers = [...new Set(FORMS.flatMap((f) => f.serials.map((r) => r.n)))];

  // חיפוש כפול: SerialUnit.serialNumber (עם/בלי אפסים מובילים) + ItemType.sku
  const [units, itemsBySku] = await Promise.all([
    p.serialUnit.findMany({
      where: { battalionId: bat!.id, serialNumber: { in: allNumbers } },
      select: {
        serialNumber: true,
        itemType: { select: { name: true, sku: true } },
        currentHolder: { select: { name: true, kind: true, warehouseType: true } },
        signedSoldier: { select: { fullName: true, personalNumber: true, company: { select: { name: true } } } },
      },
    }),
    p.itemType.findMany({ where: { battalionId: bat!.id, sku: { in: allNumbers } }, select: { sku: true, name: true } }),
  ]);
  const unitMap = new Map(units.map((u) => [u.serialNumber, u]));
  const skuMap = new Map(itemsBySku.map((i) => [i.sku!, i]));

  const wb = new ExcelJS.Workbook();
  let matched = 0, total = 0;
  const combined: (string | number)[][] = [];
  const stat = { armory: 0, soldier: 0, otherHolder: 0, notFound: 0 };

  // מצב נוכחי של יחידה סריאלית: חתום על חייל / במחסן ארמון / holder אחר / לא נמצא
  const statusOf = (u: (typeof units)[number] | undefined) => {
    if (!u) return { where: "✗ לא נמצא במערכת", soldier: "", pn: "" };
    if (u.signedSoldier) return { where: `חתום על חייל${u.signedSoldier.company ? ` · ${u.signedSoldier.company.name}` : ""}`, soldier: u.signedSoldier.fullName, pn: u.signedSoldier.personalNumber ?? "" };
    if (u.currentHolder?.warehouseType === "ARMORY") return { where: "מחסן ארמון", soldier: "", pn: "" };
    return { where: u.currentHolder?.name ?? "—", soldier: "", pn: "" };
  };

  for (const f of FORMS) {
    const ws = wb.addWorksheet(f.form.replace(/[*?:\\/[\]]/g, "-").slice(0, 28));
    ws.views = [{ rightToLeft: true }];
    ws.columns = [
      { header: "מס' סריאלי", key: "n", width: 16 },
      { header: "שם פריט (מהמערכת)", key: "sys", width: 22 },
      { header: "כמות", key: "qty", width: 7 },
      { header: "נמצא", key: "found", width: 9 },
      { header: "מיקום נוכחי", key: "where", width: 22 },
      { header: "חתום על חייל", key: "soldier", width: 20 },
      { header: "מ.א.", key: "pn", width: 12 },
      { header: "שם כפי שנקרא", key: "read", width: 16 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.addRow({ n: `📋 ${f.form}  ·  תאריך ${f.date}${f.brigade ? `  ·  חטיבה ${f.brigade}` : ""}` }).font = { bold: true, color: { argb: "FF1F4E79" } };
    for (const r of f.serials) {
      total++;
      const u = unitMap.get(r.n); const sku = skuMap.get(r.n);
      const found = !!u || !!sku;
      if (found) matched++;
      const sysName = u?.itemType.name ?? sku?.name ?? "";
      const st = statusOf(u);
      if (!found) stat.notFound++;
      else if (u?.signedSoldier) stat.soldier++;
      else if (u?.currentHolder?.warehouseType === "ARMORY") stat.armory++;
      else stat.otherHolder++;
      ws.addRow({ n: r.n, sys: sysName, qty: r.qty, found: found ? "✓" : "✗", where: st.where, soldier: st.soldier, pn: st.pn, read: r.name });
      combined.push([f.form, r.n, sysName || r.name, r.qty, found ? "✓" : "✗", st.where, st.soldier, st.pn]);
    }
    if (f.qtys.length) {
      ws.addRow({ n: "— שורות כמותיות —" }).font = { italic: true, color: { argb: "FF888888" } };
      for (const q of f.qtys) { ws.addRow({ n: "", sys: q.name, qty: q.qty, found: "כמותי" }); combined.push([f.form, "", q.name, q.qty, "כמותי", "", "", ""]); }
    }
  }

  const sum = wb.addWorksheet("ריכוז");
  sum.views = [{ rightToLeft: true }];
  sum.columns = [
    { header: "טופס", width: 24 }, { header: "מס'", width: 15 }, { header: "שם פריט", width: 22 },
    { header: "כמות", width: 7 }, { header: "נמצא", width: 7 }, { header: "מיקום נוכחי", width: 22 },
    { header: "חתום על חייל", width: 20 }, { header: "מ.א.", width: 12 },
  ];
  sum.getRow(1).font = { bold: true };
  combined.forEach((r) => sum.addRow(r));

  // גיליון סטטוס — פילוח היכן נמצא הציוד שהתקבל
  const st = wb.addWorksheet("סטטוס");
  st.views = [{ rightToLeft: true }];
  st.columns = [ { header: "מצב", width: 26 }, { header: "כמות סריאליים", width: 16 } ];
  st.getRow(1).font = { bold: true };
  st.addRow(["חתום על חיילים", stat.soldier]);
  st.addRow(["במחסן ארמון", stat.armory]);
  st.addRow(["holder אחר (פלוגה/מחסן)", stat.otherHolder]);
  st.addRow(["✗ לא נמצא במערכת", stat.notFound]);
  st.addRow(["סה\"כ סריאליים בטפסים", total]);
  console.log(`\nסטטוס: חתום על חיילים=${stat.soldier} · מחסן ארמון=${stat.armory} · holder אחר=${stat.otherHolder} · לא נמצא=${stat.notFound}`);

  const out = "gadsam4/קבלת-נשקים-חטיבה-ארמון.xlsx";
  await wb.xlsx.writeFile(out);
  console.log(`✅ נוצר: ${out}`);
  console.log(`סריאליים: ${matched}/${total} נמצאו במערכת (${total - matched} לא נמצאו — ייתכן שגיאת קריאה או פריט חדש).`);
}
main().then(() => p.$disconnect()).catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
