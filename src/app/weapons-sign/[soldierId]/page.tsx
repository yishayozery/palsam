import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { WEAPONS_AGREEMENT_TITLE, WEAPONS_AGREEMENT_CLAUSES, WEAPONS_AGREEMENT_FOOTER } from "@/lib/weapons-agreement-text";
import { verifyLink } from "@/lib/link-token";
import SignForm from "./SignForm";

export const dynamic = "force-dynamic";

export default async function WeaponsSignPage({ params, searchParams }: { params: Promise<{ soldierId: string }>; searchParams: Promise<{ t?: string }> }) {
  const { soldierId } = await params;
  const { t: tok } = await searchParams;
  // 🔒 גישה מותרת רק עם טוקן חתום — מונע חתימה על חיילים אקראיים
  if (!verifyLink("weapons-sign", soldierId, tok)) notFound();
  const soldier = await prisma.soldier.findUnique({
    where: { id: soldierId },
    select: {
      id: true, fullName: true, personalNumber: true, battalionId: true,
      weaponsAgreementSignedAt: true,
      battalion: { select: { name: true, logoData: true } },
    },
  });
  if (!soldier) notFound();

  const armory = await prisma.holder.findFirst({
    where: { battalionId: soldier.battalionId, warehouseType: "ARMORY", active: true },
    select: { weaponsAgreementText: true },
  });
  const clauses: string[] = armory?.weaponsAgreementText?.trim()
    ? armory.weaponsAgreementText.split("\n").map((l) => l.trim()).filter(Boolean)
    : [...WEAPONS_AGREEMENT_CLAUSES];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-950 p-3" dir="rtl">
      <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-xl p-5 my-3">
        <div className="text-center mb-4">
          {soldier.battalion?.logoData ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={soldier.battalion.logoData} alt="סמל" className="mx-auto w-12 h-12 object-contain mb-2" />
          ) : (
            <div className="mx-auto w-12 h-12 rounded-xl bg-slate-800 text-white flex items-center justify-center text-xl mb-2">🔫</div>
          )}
          <h1 className="text-lg font-bold text-slate-800">{WEAPONS_AGREEMENT_TITLE}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{soldier.battalion?.name}</p>
        </div>

        {soldier.weaponsAgreementSignedAt ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-2">✅</div>
            <p className="font-bold text-emerald-700">כבר חתמת על נוהל שמירת הנשק</p>
            <p className="text-xs text-slate-500 mt-1">{new Date(soldier.weaponsAgreementSignedAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}</p>
          </div>
        ) : (
          <SignForm
            soldierId={soldier.id}
            token={tok ?? ""}
            fullName={soldier.fullName ?? ""}
            personalNumber={soldier.personalNumber ?? ""}
            clauses={clauses}
            footer={WEAPONS_AGREEMENT_FOOTER}
          />
        )}
      </div>
    </div>
  );
}
