import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import PrintButton from "@/components/PrintButton";
import BackButton from "@/components/BackButton";
import { TRANSFER_TYPE, TRANSFER_STATUS } from "@/lib/labels";
import { linkTokenQuery } from "@/lib/link-token";
import ArmoryIssueDoc, { type ArmoryIssueData } from "@/app/transfer-doc/[id]/ArmoryIssueDoc";

export const dynamic = "force-dynamic";

// כותרת מסמך תיאורית — משפיעה על שם-הקובץ בהדפסה/שמירה כ-PDF
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

export default async function TransferDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const t = await prisma.transfer.findUnique({
    where: { id },
    include: {
      battalion: true,
      fromHolder: { select: { name: true, signatureClause: true, warehouseType: true, weaponsAgreementText: true } },
      toHolder: true,
      toSoldier: { select: { fullName: true, personalNumber: true, phone: true, company: { select: { name: true } }, weaponsApprovedById: true, weaponsApprovedAt: true, weaponsApprovalSignature: true } },
      createdBy: true,
      approvedBy: true,
      lines: { include: { itemType: true, serialUnit: true, status: true } },
      signatures: { where: { status: "SIGNED" }, select: { signatureData: true, signedAt: true, soldier: { select: { fullName: true, personalNumber: true } }, signerUser: { select: { fullName: true, title: true } } }, take: 1 },
    },
  });
  if (!t) notFound();

  const unitName = t.battalion?.name || "גדוד";
  const docNumber = t.id.slice(-8).toUpperCase();
  const base = process.env.NEXT_PUBLIC_APP_URL || "";
  const recipientName = t.toSoldier?.fullName ?? t.toHolder?.name ?? "";
  const recipientPhone = t.toSoldier?.phone ?? null;
  const pdfUrl = `${base}/api/transfer-doc/${id}/pdf${linkTokenQuery("transfer-doc", id)}`;

  // 🔫 ניפוק מארמון → טופס 1008 (זהה לתעודה הציבורית וה-PDF)
  const isArmory = t.fromHolder?.warehouseType === "ARMORY" && t.type !== "CHECKIN";
  if (isArmory) {
    const [employment, approver] = await Promise.all([
      prisma.employment.findFirst({ where: { battalionId: t.battalionId, active: true }, orderBy: { endDate: "desc" }, select: { endDate: true } }),
      t.toSoldier?.weaponsApprovedById
        ? prisma.appUser.findUnique({ where: { id: t.toSoldier.weaponsApprovedById }, select: { fullName: true, title: true } })
        : Promise.resolve(null),
    ]);
    const data: ArmoryIssueData = {
      docNumber, battalionName: unitName, logoData: t.battalion?.logoData ?? null, motto: t.battalion?.motto ?? null,
      soldier: t.toSoldier ? { fullName: t.toSoldier.fullName, personalNumber: t.toSoldier.personalNumber, companyName: t.toSoldier.company?.name ?? null } : null,
      externalName: t.toSoldier ? null : (t.toHolder?.name ?? t.externalName ?? null),
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
    const waText = encodeURIComponent(`שלום ${recipientName}, מצורף אישור ניפוק נשק:\n${pdfUrl}`);
    const waUrl = recipientPhone ? `https://wa.me/${recipientPhone.replace(/\D/g, "").replace(/^0/, "972")}?text=${waText}` : `https://wa.me/?text=${waText}`;
    return (
      <div>
        <div className="flex justify-between items-center mb-4 print:hidden max-w-3xl mx-auto">
          <BackButton />
          <div className="flex gap-2">
            <a href={waUrl} target="_blank" rel="noreferrer" className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-2 text-xs font-medium">📲 שלח</a>
            <a href={pdfUrl} download className="border border-slate-300 hover:bg-slate-50 rounded-lg px-3 py-2 text-xs font-medium">⬇️ PDF</a>
            <PrintButton />
          </div>
        </div>
        <ArmoryIssueDoc d={data} hideToolbar />
      </div>
    );
  }

  const certWaText = encodeURIComponent(`שלום ${recipientName}, מצורף אישור העברת ציוד:\n${pdfUrl}`);
  const certWaUrl = recipientPhone
    ? `https://wa.me/${recipientPhone.replace(/\D/g, "").replace(/^0/, "972")}?text=${certWaText}`
    : `https://wa.me/?text=${certWaText}`;

  return (
    <div>
      <div className="flex justify-between items-center mb-4 print:hidden">
        <BackButton />
        <div className="flex gap-2">
          <a href={certWaUrl} target="_blank" rel="noreferrer"
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-2 text-xs font-medium">
            📲 שלח תעודה
          </a>
          <a href={pdfUrl} download className="border border-slate-300 hover:bg-slate-50 rounded-lg px-3 py-2 text-xs font-medium">⬇️ PDF</a>
          <PrintButton />
        </div>
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
              <h1 className="text-2xl font-bold text-slate-800">תעודת העברת ציוד</h1>
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
          <div>
            <span className="text-slate-500">מאת:</span>{" "}
            <span className="font-medium">{t.type === "EXTERNAL_IN" && t.externalName ? `🌐 ${t.externalName}` : t.fromHolder?.name ?? "חטיבה (גורם חיצוני)"}</span>
          </div>
          <div>
            <span className="text-slate-500">אל:</span>{" "}
            <span className="font-medium">{t.type === "EXTERNAL_OUT" && t.externalName ? `🌐 ${t.externalName}` : t.toSoldier?.fullName ?? t.toHolder?.name ?? "חטיבה (גורם חיצוני)"}</span>
          </div>
          <div>
            <span className="text-slate-500">סטטוס:</span>{" "}
            <span className="font-medium">{TRANSFER_STATUS[t.status]}</span>
          </div>
          {t.reason && (
            <div><span className="text-slate-500">הערה:</span> {t.reason}</div>
          )}
        </div>

        {/* 🌐 פרטי הגורם החיצוני */}
        {t.externalName && (
          <div className="mb-6 border border-indigo-200 bg-indigo-50/50 rounded-lg p-3 text-sm print:bg-white">
            <div className="font-bold text-indigo-800 mb-1">🌐 פרטי הגורם החיצוני</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div><span className="text-slate-500">שם מלא:</span> <span className="font-medium">{t.externalName}</span></div>
              {t.recipientPersonalId && <div><span className="text-slate-500">מ.א:</span> <span className="font-mono">{t.recipientPersonalId}</span></div>}
              {t.externalPhone && <div><span className="text-slate-500">נייד:</span> <span className="font-mono">{t.externalPhone}</span></div>}
              {t.externalUnit && <div><span className="text-slate-500">שייכות:</span> <span>{t.externalUnit}</span></div>}
            </div>
          </div>
        )}

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

        {/* 📝 תניית חתימה (אם הוגדרה ב-fromHolder) */}
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
          <div className="border-t border-slate-400 pt-2">
            <div className="text-slate-500">מוסר / יוצר התעודה</div>
            <div className="font-medium mt-1">{t.createdBy.fullName}</div>
          </div>
          <div className="border-t border-slate-400 pt-2">
            <div className="text-slate-500">מקבל / מאשר</div>
            <div className="font-medium mt-1">
              {t.externalName ?? t.approvedBy?.fullName ?? t.signatures[0]?.soldier?.fullName ?? t.signatures[0]?.signerUser?.fullName ?? "________________"}
              {t.approvedAt && (
                <span className="text-slate-400"> · {t.approvedAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}</span>
              )}
            </div>
            {t.externalSignature && (
              <div className="mt-3 border border-slate-200 rounded-lg p-2 bg-slate-50">
                <div className="text-[10px] text-slate-500 mb-1">חתימת הגורם החיצוני:</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.externalSignature} alt="חתימת גורם חיצוני" className="max-h-24 object-contain" />
              </div>
            )}
            {t.signatures[0]?.signatureData && (
              <div className="mt-3 border border-slate-200 rounded-lg p-2 bg-slate-50">
                <div className="text-[10px] text-slate-500 mb-1">חתימה דיגיטלית:</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.signatures[0].signatureData} alt="חתימה" className="max-h-24 object-contain" />
                {t.signatures[0].signedAt && (
                  <div className="text-[10px] text-slate-400 mt-1">
                    נחתם: {t.signatures[0].signedAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}
                    {t.signatures[0].soldier?.personalNumber && ` · מ.א. ${t.signatures[0].soldier.personalNumber}`}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-400 text-center mt-8">
          מסמך זה הופק אוטומטית ממערכת ניהול המלאי הגדודי · {docNumber}
        </p>
      </div>
    </div>
  );
}
