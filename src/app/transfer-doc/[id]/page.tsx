import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PrintButton from "@/components/PrintButton";
import { TRANSFER_TYPE, TRANSFER_STATUS } from "@/lib/labels";
import { verifyLink } from "@/lib/link-token";
import ArmoryIssueDoc, { type ArmoryIssueData } from "./ArmoryIssueDoc";

export const dynamic = "force-dynamic";

// כותרת מסמך תיאורית — משפיעה על שם-הקובץ בהדפסה/שמירה כ-PDF מהדפדפן
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await prisma.transfer.findUnique({
    where: { id },
    select: { type: true, fromHolder: { select: { warehouseType: true } }, toSoldier: { select: { fullName: true } } },
  });
  const name = t?.toSoldier?.fullName ?? "";
  const isArmory = t?.fromHolder?.warehouseType === "ARMORY" && t?.type !== "CHECKIN";
  const base = isArmory ? "אישור ניפוק נשק" : "תעודת ציוד";
  return { title: name ? `${base} - ${name}` : base };
}

export default async function PublicTransferDocPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t: tok } = await searchParams;
  // 🔒 גישה ציבורית מותרת רק עם טוקן חתום — מונע מנייה/ניחוש של תעודות
  if (!verifyLink("transfer-doc", id, tok)) notFound();

  const t = await prisma.transfer.findUnique({
    where: { id },
    include: {
      battalion: true,
      fromHolder: true,
      toHolder: true,
      toSoldier: { select: { fullName: true, personalNumber: true, company: { select: { name: true } }, weaponsApprovedById: true, weaponsApprovedAt: true, weaponsApprovalSignature: true } },
      createdBy: { select: { fullName: true } },
      approvedBy: { select: { fullName: true } },
      lines: { include: { itemType: true, serialUnit: true, status: true } },
      signatures: { where: { status: "SIGNED" }, select: { signatureData: true, signedAt: true, soldier: { select: { fullName: true, personalNumber: true } }, signerUser: { select: { fullName: true, title: true } } }, take: 1 },
    },
  });
  if (!t) notFound();

  const unitName = t.battalion?.name || "גדוד";
  const docNumber = t.id.slice(-8).toUpperCase();

  // 🔫 טופס ניפוק נשק אישי — כשההעברה ממחסן ארמון (השלב האחרון מ-4 שלבי קבלת הנשק)
  if (t.fromHolder?.warehouseType === "ARMORY" && t.type !== "CHECKIN") {
    const [employment, approver] = await Promise.all([
      prisma.employment.findFirst({ where: { battalionId: t.battalionId, active: true }, orderBy: { endDate: "desc" }, select: { endDate: true } }),
      t.toSoldier?.weaponsApprovedById
        ? prisma.appUser.findUnique({ where: { id: t.toSoldier.weaponsApprovedById }, select: { fullName: true, title: true } })
        : Promise.resolve(null),
    ]);
    const data: ArmoryIssueData = {
      docNumber,
      battalionName: unitName,
      logoData: t.battalion?.logoData ?? null,
      motto: t.battalion?.motto ?? null,
      soldier: t.toSoldier ? { fullName: t.toSoldier.fullName, personalNumber: t.toSoldier.personalNumber, companyName: t.toSoldier.company?.name ?? null } : null,
      externalName: t.toSoldier ? null : (t.externalName ?? t.toHolder?.name ?? null),
      issueDate: t.signatures[0]?.signedAt ?? t.createdAt,
      endDate: employment?.endDate ?? null,
      purpose: t.reason ?? null,
      issuerName: t.createdBy.fullName,
      issuerHolderName: t.fromHolder?.name ?? null,
      declarationText: t.fromHolder?.weaponsAgreementText ?? null,
      lines: t.lines.map((l) => ({ name: l.itemType.name, sku: l.itemType.sku, quantity: l.quantity, serial: l.serialUnit?.serialNumber ?? null })),
      signature: t.signatures[0] ?? null,
      approverName: approver?.fullName ?? null,
      approverTitle: approver?.title ?? null,
      approvedAt: t.toSoldier?.weaponsApprovedAt ?? null,
      approverSignature: t.toSoldier?.weaponsApprovalSignature ?? null,
    };
    return <ArmoryIssueDoc d={data} />;
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <div className="flex justify-center items-center mb-4 print:hidden">
        <PrintButton />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-3xl mx-auto print:shadow-none print:border-0">
        {/* כותרת */}
        <div className="flex justify-between items-start border-b-2 border-slate-800 pb-4 mb-6">
          <div className="flex items-center gap-3">
            {t.battalion?.logoData && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.battalion.logoData} alt="סמל הגדוד" className="w-14 h-14 object-contain" />
            )}
            <div>
              <h1 className="text-2xl font-bold text-slate-800">
                {t.type === "CHECKIN" ? "אישור זיכוי ציוד" : "תעודת העברת ציוד"}
              </h1>
              <p className="text-sm text-slate-500 mt-1">{TRANSFER_TYPE[t.type]}</p>
            </div>
          </div>
          <div className="text-left text-sm flex items-center gap-3">
            <div>
              <div className="font-bold">{unitName}</div>
              {t.battalion?.motto && <div className="text-xs text-slate-500 italic">״{t.battalion.motto}״</div>}
              <div className="text-slate-500">מס׳ תעודה: {docNumber}</div>
              <div className="text-slate-500">{t.createdAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })} {t.createdAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" })}</div>
            </div>
            <div className="text-3xl">🛡️</div>
          </div>
        </div>

        {/* פרטי העברה */}
        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          {t.type === "CHECKIN" ? (
            <>
              <div>
                <span className="text-slate-500">חייל:</span>{" "}
                <span className="font-medium">{t.toSoldier?.fullName ?? "—"}</span>
                {t.toSoldier?.personalNumber && <span className="text-slate-400 mr-1 text-xs">({t.toSoldier.personalNumber})</span>}
              </div>
              <div>
                <span className="text-slate-500">הוחזר אל:</span>{" "}
                <span className="font-medium">{t.toHolder?.name ?? t.fromHolder?.name ?? "מחסן"}</span>
              </div>
            </>
          ) : (
            <>
              <div>
                <span className="text-slate-500">שם המוסר:</span>{" "}
                <span className="font-medium">{t.createdBy.fullName}</span>
                {t.fromHolder?.name && <span className="text-slate-400 mr-1 text-xs">({t.fromHolder.name})</span>}
              </div>
              <div>
                <span className="text-slate-500">שם המקבל:</span>{" "}
                <span className="font-medium">{t.toSoldier?.fullName ?? t.toHolder?.name ?? "חטיבה (גורם חיצוני)"}</span>
                {t.toSoldier?.personalNumber && <span className="text-slate-400 mr-1 text-xs">({t.toSoldier.personalNumber})</span>}
              </div>
            </>
          )}
          <div>
            <span className="text-slate-500">סטטוס:</span>{" "}
            <span className="font-medium">{TRANSFER_STATUS[t.status]}</span>
          </div>
          {t.reason && (
            <div><span className="text-slate-500">הערה:</span> {t.reason}</div>
          )}
        </div>

        {/* טבלת פריטים */}
        <table className="w-full text-sm text-right border border-slate-300 mb-6">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-3 py-2">#</th>
              <th className="border border-slate-300 px-3 py-2">פריט</th>
              <th className="border border-slate-300 px-3 py-2">מספר סריאלי</th>
              <th className="border border-slate-300 px-3 py-2">כמות</th>
              <th className="border border-slate-300 px-3 py-2">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {t.lines.map((l, i) => (
              <tr key={l.id}>
                <td className="border border-slate-300 px-3 py-2 text-center">{i + 1}</td>
                <td className="border border-slate-300 px-3 py-2">{l.itemType.name}</td>
                <td className="border border-slate-300 px-3 py-2 font-mono text-xs">{l.serialUnit?.serialNumber ?? "—"}</td>
                <td className="border border-slate-300 px-3 py-2 text-center">{l.quantity}</td>
                <td className="border border-slate-300 px-3 py-2">{l.status?.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* תניית חתימה */}
        {t.fromHolder?.signatureClause && (
          <div className="mt-8 border-2 border-slate-800 rounded-lg p-4 bg-slate-50 print:bg-white">
            <div className="text-xs font-bold text-slate-800 mb-2 uppercase tracking-wide">
              📝 הצהרת חייל / תניית חתימה
            </div>
            <pre className="text-sm text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">{t.fromHolder.signatureClause}</pre>
          </div>
        )}

        {/* חתימות */}
        <div className="grid grid-cols-2 gap-8 mt-10 text-sm">
          {t.type === "CHECKIN" ? (
            <>
              {/* זיכוי: החייל המחזיר (toSoldier) מול המחסן המקבל */}
              <div className="border-t border-slate-400 pt-2">
                <div className="text-slate-500">חייל מחזיר</div>
                <div className="font-medium mt-1">
                  {t.toSoldier?.fullName ?? "________________"}
                  {t.toSoldier?.personalNumber && <span className="text-slate-400 text-xs mr-1">· מ.א. {t.toSoldier.personalNumber}</span>}
                </div>
              </div>
              <div className="border-t border-slate-400 pt-2">
                <div className="text-slate-500">מקבל במחסן / מאשר (חותם)</div>
                <div className="font-medium mt-1">
                  {t.signatures[0]?.signerUser?.fullName ?? t.approvedBy?.fullName ?? t.createdBy.fullName}
                  {t.approvedAt && (
                    <span className="text-slate-400"> · {t.approvedAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}</span>
                  )}
                </div>
                {t.signatures[0]?.signatureData && (
                  <div className="mt-3 border border-slate-200 rounded-lg p-2 bg-slate-50">
                    <div className="text-[10px] text-slate-500 mb-1">חתימה דיגיטלית:</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.signatures[0].signatureData} alt="חתימה" className="max-h-24 object-contain" />
                    {t.signatures[0].signedAt && (
                      <div className="text-[10px] text-slate-400 mt-1">נחתם: {t.signatures[0].signedAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}</div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* החתמה/העברה: המוסר (מחתים) מול המקבל (חותם) + חתימה */}
              <div className="border-t border-slate-400 pt-2">
                <div className="text-slate-500">מוסר / יוצר התעודה (מחתים)</div>
                <div className="font-medium mt-1">{t.createdBy.fullName}</div>
              </div>
              <div className="border-t border-slate-400 pt-2">
                <div className="text-slate-500">מקבל / חותם</div>
                <div className="font-medium mt-1">
                  {t.signatures[0]?.soldier?.fullName ?? t.signatures[0]?.signerUser?.fullName ?? t.toSoldier?.fullName ?? t.approvedBy?.fullName ?? "________________"}
                  {t.signatures[0]?.soldier?.personalNumber && <span className="text-slate-400 text-xs mr-1">· מ.א. {t.signatures[0].soldier.personalNumber}</span>}
                </div>
                {t.signatures[0]?.signatureData && (
                  <div className="mt-3 border border-slate-200 rounded-lg p-2 bg-slate-50">
                    <div className="text-[10px] text-slate-500 mb-1">חתימה דיגיטלית:</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.signatures[0].signatureData} alt="חתימה" className="max-h-24 object-contain" />
                    {t.signatures[0].signedAt && (
                      <div className="text-[10px] text-slate-400 mt-1">
                        נחתם: {t.signatures[0].signedAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <p className="text-xs text-slate-400 text-center mt-8">
          מסמך זה הופק אוטומטית ממערכת ניהול המלאי הגדודי · {docNumber}
        </p>
      </div>
    </div>
  );
}
