/**
 * 🏛️ זריעת נתוני-דמו למערכת החטיבה (E2E): גדוד פותח → חטיבה רואה/מטפל.
 * דרישות מכל סוג בשלבים שונים + כרטיסי דלק (הקצאה/חתימה) + הובלות עם מעמיס/פורק.
 * משאיר את ה-DATA להדגמה. מסומן notes/מספרים לזיהוי.
 *
 *   npx tsx --env-file=.env scripts/seed-brigade-demo.ts
 */
import { PrismaClient, type RequestType, type RequestStatus } from "../src/generated/prisma";
import { ensureRequestDefaults } from "../src/lib/requestDefaults";
const p = new PrismaClient();

async function main() {
  const brigade = await p.battalion.findFirst({ where: { level: "BRIGADE" }, select: { id: true, name: true } });
  if (!brigade) throw new Error("אין חטיבה");

  // מוודאים 3 גדודים תחת החטיבה — משייכים את 22 אם צריך
  const b22 = await p.battalion.findFirst({ where: { code: "22" }, select: { id: true, parentId: true } });
  if (b22 && b22.parentId !== brigade.id) { await p.battalion.update({ where: { id: b22.id }, data: { parentId: brigade.id, level: "BATTALION" } }); console.log("🔗 גדוד 22 שויך לחטיבה"); }

  await ensureRequestDefaults(brigade.id);
  const battalions = await p.battalion.findMany({ where: { parentId: brigade.id }, select: { id: true, code: true, name: true } });
  const brigUser = await p.appUser.findFirst({ where: { battalionId: brigade.id }, select: { id: true, fullName: true } });
  console.log(`🏛️ ${brigade.name} · ${battalions.length} גדודים\n`);

  // ניקוי זריעה קודמת (מסומן DEMO) כדי לא לשכפל
  await p.request.deleteMany({ where: { targetUnitId: brigade.id, title: { startsWith: "דמו·" } } });
  await p.brigadeFuelCard.deleteMany({ where: { brigadeUnitId: brigade.id, cardNumber: { startsWith: "DEMO-FC-" } } });

  type Spec = { type: RequestType; title: string; status: RequestStatus; data: Record<string, string>; priority?: "URGENT" };
  let reqN = 0, transportN = 0;
  for (const b of battalions) {
    const specs: Spec[] = [
      { type: "FUEL", title: `דמו· תדלוק ג'ריקנים`, status: "IN_PROGRESS", data: { liters: "200", vehicle: "האמר סיור", location: "בסיס", contact: "רס\"ר יוסי 050-1112222", "h:approved": "מאושר", "h:fuelLocation": "תחנת דלק צפון", "h:time": "14:00" } },
      { type: "CONSTRUCTION", title: `דמו· תקלת חשמל במגורים`, status: "PENDING_APPROVAL", data: { faultType: "חשמל", location: "אוהל 4", urgency: "דחוף", contacts: "דני 050-3334444" }, priority: "URGENT" },
      { type: "SUPPLY", title: `דמו· החלפת אפודים`, status: "RESOLVED", data: { equipmentType: "ציוד אישי", requestKind: "החלפה", quantity: "12", product: "אפוד קרמי", "h:approved": "מאושר", "h:status": "סופק", "h:eta": "אתמול", "h:pickupLocation": "מחסן חטיבה" } },
      { type: "MEDICAL", title: `דמו· ציוד חובשים`, status: "NEEDS_INFO", data: { equipmentType: "ציוד קשר", requestKind: "אספקה", quantity: "5", product: "תיק חובש", "h:approved": "בטיפול" } },
    ];
    for (const s of specs) {
      await p.request.create({ data: {
        battalionId: b.id, targetUnitId: brigade.id, type: s.type, title: s.title, status: s.status,
        priority: s.priority ?? "ROUTINE", data: s.data, openedByName: "מפ\"ק גדוד", openedById: null,
        assignedToId: s.status !== "PENDING_APPROVAL" ? brigUser?.id ?? null : null,
        assignedName: s.status !== "PENDING_APPROVAL" ? brigUser?.fullName ?? "מלכ\"א" : null,
        escalatedAt: s.status !== "PENDING_APPROVAL" ? new Date() : null,
        resolvedAt: s.status === "RESOLVED" ? new Date() : null,
      } });
      reqN++;
    }
    // הובלה עם מעמיס/פורק
    const transport = await p.request.create({ data: {
      battalionId: b.id, targetUnitId: brigade.id, type: "TRANSPORT", title: "דמו· הובלת מכולות", status: "IN_PROGRESS",
      data: { transportType: "מוביל מכולה", vehicleCount: "2", from: "בסיס", to: "שטח אימונים", contact: "קמב\"ץ 050-5556666", loaderContact: "עמית 050-7778888", unloaderContact: "רון 050-9990000", "h:date": "מחר", "h:driverName": "משה נהג", "h:driverPhone": "050-1234567" },
      openedByName: "מפ\"ק גדוד", assignedName: brigUser?.fullName ?? "מלכ\"א", assignedToId: brigUser?.id ?? null, escalatedAt: new Date(),
    } });
    await p.transportParty.createMany({ data: [
      { requestId: transport.id, role: "LOADER", name: "עמית (מעמיס)", reportText: "הועמסו 2 מכולות + ציוד מטבח", reportedAt: new Date() },
      { requestId: transport.id, role: "UNLOADER", name: "רון (פורק)" },
    ] });
    transportN++;
  }

  // כרטיסי דלק: מאגר חטיבה + הקצאה+חתימה לגדודים
  const cardData = Array.from({ length: 24 }, (_, i) => ({ brigadeUnitId: brigade.id, cardNumber: `DEMO-FC-${String(1001 + i)}`, label: "סולר" }));
  await p.brigadeFuelCard.createMany({ data: cardData, skipDuplicates: true });
  const pool = await p.brigadeFuelCard.findMany({ where: { brigadeUnitId: brigade.id, cardNumber: { startsWith: "DEMO-FC-" }, status: "AVAILABLE" }, select: { id: true }, orderBy: { cardNumber: "asc" } });
  let idx = 0;
  for (const b of battalions) {
    const allocate = pool.slice(idx, idx + 6).map((c) => c.id); idx += 6;
    await p.brigadeFuelCard.updateMany({ where: { id: { in: allocate } }, data: { status: "ALLOCATED", allocatedBattalionId: b.id, allocatedName: b.name, allocatedAt: new Date() } });
    // חותמים 2 מתוכם
    const sign = allocate.slice(0, 2);
    await p.brigadeFuelCard.updateMany({ where: { id: { in: sign } }, data: { status: "SIGNED", signedByName: "קצין רכב הגדוד", signedByPersonal: "6380282", signedAt: new Date() } });
  }

  console.log(`✅ נזרעו: ${reqN} דרישות (מכל סוג, שלבים שונים) + ${transportN} הובלות עם מעמיס/פורק`);
  console.log(`✅ כרטיסי דלק: 24 במאגר, 6 מוקצים לכל גדוד (2 חתומים)`);
  // אימות מה החטיבה רואה
  const seen = await p.request.groupBy({ by: ["status"], where: { targetUnitId: brigade.id, title: { startsWith: "דמו·" } }, _count: { _all: true } });
  console.log(`\n🏛️ החטיבה רואה: ${seen.map((s) => `${s.status}=${s._count._all}`).join(", ")}`);
}
main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => p.$disconnect());
