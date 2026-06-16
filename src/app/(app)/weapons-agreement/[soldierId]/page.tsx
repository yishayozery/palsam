import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import PrintButton from "@/components/PrintButton";
import { WEAPONS_AGREEMENT_TITLE, WEAPONS_AGREEMENT_CLAUSES, WEAPONS_AGREEMENT_FOOTER } from "@/lib/weapons-agreement-text";

export const dynamic = "force-dynamic";

export default async function WeaponsAgreementPage({
  params,
}: {
  params: Promise<{ soldierId: string }>;
}) {
  await requireCapability("weapons.view");
  const { soldierId } = await params;

  const soldier = await prisma.soldier.findUnique({
    where: { id: soldierId },
    include: { battalion: { select: { name: true, logoData: true } }, company: { select: { name: true } } },
  });
  if (!soldier || !soldier.weaponsAgreementSignedAt) notFound();

  const unitName = soldier.battalion?.name || "גדוד";
  const armoryHolder = await prisma.holder.findFirst({
    where: { battalionId: soldier.battalionId, warehouseType: "ARMORY", active: true },
    select: { weaponsAgreementText: true },
  });
  const customText = armoryHolder?.weaponsAgreementText ?? null;

  return (
    <div>
      <div className="flex justify-between items-center mb-4 print:hidden">
        <a href="/armory-ineligibility" className="text-sm text-slate-500 hover:text-slate-800">→ חזרה לדוח זכאות</a>
        <PrintButton />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-2xl mx-auto print:shadow-none print:border-0" dir="rtl">
        {/* כותרת */}
        <div className="flex justify-between items-start border-b-2 border-slate-800 pb-4 mb-6">
          <div className="flex items-center gap-3">
            {soldier.battalion?.logoData && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={soldier.battalion.logoData} alt="סמל הגדוד" className="w-14 h-14 object-contain" />
            )}
            <div>
              <div className="text-lg font-bold">{unitName}</div>
              <div className="text-xs text-slate-500">PALSAM</div>
            </div>
          </div>
          <div className="text-left">
            <div className="text-xs text-slate-500">תאריך חתימה</div>
            <div className="font-mono text-sm">{soldier.weaponsAgreementSignedAt.toLocaleDateString("he-IL")}</div>
          </div>
        </div>

        {/* כותרת הנוהל */}
        <h1 className="text-center text-xl font-bold mb-6 border-b pb-3">
          🔫 {WEAPONS_AGREEMENT_TITLE}
        </h1>

        {/* סעיפים */}
        <div className="text-sm leading-relaxed space-y-3 mb-8">
          {customText
            ? customText.split("\n").filter(Boolean).map((line, i) => (
              <div key={i} className="flex gap-2"><span>{line}</span></div>
            ))
            : WEAPONS_AGREEMENT_CLAUSES.map((c, i) => (
              <div key={i} className="flex gap-2">
                <span className="font-bold text-slate-600 shrink-0">{i + 1}.</span>
                <span>{c}</span>
              </div>
            ))
          }
        </div>

        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 mb-6">
          {WEAPONS_AGREEMENT_FOOTER}
        </div>

        {/* פרטי המצהיר */}
        <div className="border-t-2 border-slate-800 pt-4">
          <div className="text-sm font-bold mb-3">פרטי המצהיר/ה:</div>
          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <span className="text-slate-500">שם מלא: </span>
              <span className="font-bold">{soldier.fullName}</span>
            </div>
            <div>
              <span className="text-slate-500">מ.א.: </span>
              <span className="font-mono font-bold">{soldier.personalNumber}</span>
            </div>
            <div>
              <span className="text-slate-500">פלוגה: </span>
              <span>{soldier.company?.name ?? "—"}</span>
            </div>
            <div>
              <span className="text-slate-500">תאריך: </span>
              <span className="font-mono">{soldier.weaponsAgreementSignedAt.toLocaleDateString("he-IL")}</span>
            </div>
          </div>

          {/* חתימה דיגיטלית */}
          {soldier.weaponsAgreementSignature && (
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
              <div className="text-xs text-slate-500 mb-1">חתימה דיגיטלית:</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={soldier.weaponsAgreementSignature} alt="חתימה" className="max-h-24 object-contain" />
            </div>
          )}
        </div>

        <div className="text-[10px] text-slate-400 text-center mt-8 pt-4 border-t border-slate-200 print:mt-12">
          מסמך זה הופק אוטומטית ע&quot;י מערכת PALSAM · {unitName} · {new Date().toLocaleDateString("he-IL")}
        </div>
      </div>
    </div>
  );
}
