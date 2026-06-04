import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SignatureTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await requireUser();
  const { token } = await params;

  const sig = await prisma.signature.findUnique({
    where: { token },
    include: {
      soldier: true,
      signerUser: true,
      transfer: { include: { lines: { include: { itemType: true, serialUnit: true } } } },
    },
  });
  if (!sig) notFound();

  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const signUrl = `${base}/sign/${token}`;
  const qrDataUrl = await QRCode.toDataURL(signUrl, { width: 280, margin: 1 });

  const waText = encodeURIComponent(
    `שלום ${sig.soldier?.fullName ?? sig.signerUser?.fullName ?? ""}, נדרשת חתימתך על ציוד. קישור להחתמה: ${signUrl}`,
  );
  const phone = sig.soldier?.phone ?? sig.signerUser?.phone ?? null;
  const waUrl = phone
    ? `https://wa.me/${phone.replace(/\D/g, "").replace(/^0/, "972")}?text=${waText}`
    : null;

  const signed = sig.status === "SIGNED";

  return (
    <div>
      <PageHeader
        title="החתמת חייל"
        subtitle={`${sig.soldier?.fullName ?? sig.signerUser?.fullName ?? ""} · ${sig.soldier?.personalNumber ?? sig.signerUser?.username ?? ""}`}
        action={<Link href="/signatures" className="text-sm text-slate-500 hover:text-slate-800">→ חזרה</Link>}
      />

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6 text-center">
          {signed ? (
            <div className="py-8">
              <div className="text-5xl mb-3">✅</div>
              <p className="font-bold text-emerald-700">החתימה הושלמה</p>
              <p className="text-sm text-slate-500 mt-1">
                נחתם בתאריך {sig.signedAt?.toLocaleString("he-IL")}
              </p>
            </div>
          ) : (
            <>
              <h3 className="font-bold text-slate-700 mb-3">קוד QR להחתמה</h3>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="QR" className="mx-auto rounded-lg border border-slate-200" width={240} height={240} />
              <p className="text-xs text-slate-400 mt-3">סרוק עם מצלמת הנייד של החייל</p>

              <div className="mt-5 space-y-2">
                <a href={signUrl} target="_blank" rel="noreferrer"
                  className="block w-full bg-slate-800 text-white rounded-lg py-2 text-sm hover:bg-slate-900">
                  פתח דף החתמה (שרבוט במקום)
                </a>
                {waUrl && (
                  <a href={waUrl} target="_blank" rel="noreferrer"
                    className="block w-full bg-emerald-600 text-white rounded-lg py-2 text-sm hover:bg-emerald-700">
                    שליחה בוואטסאפ
                  </a>
                )}
                <div className="text-xs text-slate-400 break-all bg-slate-50 rounded p-2">{signUrl}</div>
              </div>
            </>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="font-bold text-slate-700 mb-3">פריטים להחתמה</h3>
          <div className="space-y-2">
            {sig.transfer?.lines.map((l) => (
              <div key={l.id} className="flex justify-between text-sm border-b border-slate-100 pb-2">
                <span className="font-medium">{l.itemType.name}</span>
                <span className="font-mono text-xs text-slate-500">
                  {l.serialUnit?.serialNumber ?? `×${l.quantity}`}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Badge className={signed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
              {signed ? "נחתם" : "ממתין לחתימה"}
            </Badge>
          </div>
        </Card>
      </div>
    </div>
  );
}
