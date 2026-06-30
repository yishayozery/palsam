import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import PrintButton from "@/components/PrintButton";
import { TRANSFER_TYPE, TRANSFER_STATUS } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function TransferDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const t = await prisma.transfer.findUnique({
    where: { id },
    include: {
      battalion: true,
      fromHolder: true, // כולל signatureClause
      toHolder: true,
      toSoldier: { select: { fullName: true, personalNumber: true, phone: true } },
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
  const docUrl = `${base}/transfers/${id}/document`;
  const recipientName = t.toSoldier?.fullName ?? t.toHolder?.name ?? "";
  const recipientPhone = t.toSoldier?.phone ?? null;
  const certWaText = encodeURIComponent(`שלום ${recipientName}, מצורף אישור העברת ציוד:\n${docUrl}`);
  const certWaUrl = recipientPhone
    ? `https://wa.me/${recipientPhone.replace(/\D/g, "").replace(/^0/, "972")}?text=${certWaText}`
    : `https://wa.me/?text=${certWaText}`;

  return (
    <div>
      <div className="flex justify-between items-center mb-4 print:hidden">
        <Link href="/transfers" className="text-sm text-slate-500 hover:text-slate-800">→ חזרה להעברות</Link>
        <div className="flex gap-2">
          <a href={certWaUrl} target="_blank" rel="noreferrer"
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-2 text-xs font-medium">
            📲 שלח תעודה
          </a>
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
            <span className="font-medium">{t.fromHolder?.name ?? "חטיבה (גורם חיצוני)"}</span>
          </div>
          <div>
            <span className="text-slate-500">אל:</span>{" "}
            <span className="font-medium">{t.toSoldier?.fullName ?? t.toHolder?.name ?? "חטיבה (גורם חיצוני)"}</span>
          </div>
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
              {t.approvedBy?.fullName ?? t.signatures[0]?.soldier?.fullName ?? t.signatures[0]?.signerUser?.fullName ?? "________________"}
              {t.approvedAt && (
                <span className="text-slate-400"> · {t.approvedAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}</span>
              )}
            </div>
            {/* חתימה דיגיטלית — אם קיימת */}
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
