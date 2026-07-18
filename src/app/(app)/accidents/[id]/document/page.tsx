import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import PrintButton from "@/components/PrintButton";
import BackButton from "@/components/BackButton";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = { ARMY_SELF: "צבא עצמי (רכב צבאי בודד)", ARMY_ARMY: "צבא עם צבא", CIVILIAN: "מעורבות אזרח" };
const PHOTO_LABEL: Record<string, string> = {
  VEHICLE_FRONT: "רכבנו — חזית", VEHICLE_BACK: "רכבנו — אחור", VEHICLE_LEFT: "רכבנו — שמאל", VEHICLE_RIGHT: "רכבנו — ימין",
  SCENE: "זירת התאונה", CIVIL_LICENSE_FRONT: "רישיון אזרחי קדימה", CIVIL_LICENSE_BACK: "רישיון אזרחי אחורה", MILITARY_LICENSE: "רישיון צבאי",
  OTHER_VEHICLE: "רכב הצד השני", OTHER_CIVIL_LICENSE_FRONT: "רישיון (שני) קדימה", OTHER_CIVIL_LICENSE_BACK: "רישיון (שני) אחורה", OTHER_MILITARY_LICENSE: "רישיון צבאי (שני)", OTHER: "אחר",
};

function Field({ l, v }: { l: string; v: string | null | undefined }) {
  return v ? <div><span className="text-slate-500">{l}: </span><span className="font-medium">{v}</span></div> : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `דיווח תאונה - ${id.slice(-6).toUpperCase()}` };
}

export default async function AccidentDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCapability("maintenance.manage");
  const { id } = await params;
  const r = await prisma.accidentReport.findFirst({
    where: { id, battalionId: user.battalionId! },
    include: { photos: { select: { kind: true, blobUrl: true } }, battalion: { select: { name: true, logoData: true } } },
  });
  if (!r) notFound();

  const docNo = r.id.slice(-8).toUpperCase();
  const il = (d: Date | null) => d ? new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" }).format(d) : "—";

  return (
    <div>
      <div className="flex justify-between items-center mb-4 print:hidden max-w-3xl mx-auto">
        <BackButton />
        <PrintButton />
      </div>

      <div className="bg-white max-w-3xl mx-auto p-8 print:p-0 rounded-xl border border-slate-200 print:border-0 print:shadow-none text-sm">
        {/* כותרת */}
        <div className="flex justify-between items-start border-b-2 border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-3">
            {r.battalion?.logoData && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.battalion.logoData} alt="סמל" className="w-14 h-14 object-contain" />
            )}
            <div>
              <h1 className="text-xl font-bold text-slate-800">דיווח תאונת דרכים</h1>
              <p className="text-xs text-slate-500">{TYPE_LABEL[r.type] ?? r.type}</p>
            </div>
          </div>
          <div className="text-left text-xs text-slate-500">
            <div className="font-bold text-slate-700">{r.battalion?.name}</div>
            <div>מס׳ דיווח: {docNo}</div>
            <div>הופק: {il(new Date())}</div>
          </div>
        </div>

        {/* פרטי אירוע */}
        <section className="mb-4">
          <h2 className="font-bold text-slate-700 border-b border-slate-200 mb-1">פרטי האירוע</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
            <Field l="מועד" v={il(r.accidentAt)} />
            <Field l="מיקום" v={r.location} />
          </div>
          {r.description && <div className="mt-1"><span className="text-slate-500">תיאור: </span>{r.description}</div>}
        </section>

        {/* רכבנו */}
        <section className="mb-4">
          <h2 className="font-bold text-slate-700 border-b border-slate-200 mb-1">רכבנו והנהג</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
            <Field l="מספר רכב" v={r.ourVehiclePlate} />
            <Field l="סוג רכב" v={r.ourVehicleType} />
            <Field l="שם הנהג" v={r.driverName} />
            <Field l='מ"א' v={r.driverPersonalId} />
            <Field l="טלפון" v={r.driverPhone} />
          </div>
        </section>

        {/* צד שני */}
        {r.type !== "ARMY_SELF" && (
          <section className="mb-4">
            <h2 className="font-bold text-slate-700 border-b border-slate-200 mb-1">{r.type === "ARMY_ARMY" ? "הרכב הפוגע (צבאי)" : "הצד האזרחי"}</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
              <Field l="שם" v={r.otherPartyName} />
              <Field l={r.type === "ARMY_ARMY" ? 'מ"א' : 'ת"ז'} v={r.otherPartyId} />
              <Field l="טלפון" v={r.otherPartyPhone} />
              <Field l="מספר רכב" v={r.otherVehiclePlate} />
              <Field l="יחידה" v={r.otherVehicleUnit} />
              <Field l="חב' ביטוח" v={r.otherInsurance} />
            </div>
          </section>
        )}

        {/* תחקיר קצין רכב */}
        {r.officerNotes && (
          <section className="mb-4">
            <h2 className="font-bold text-slate-700 border-b border-slate-200 mb-1">תחקיר קצין הרכב</h2>
            <div className="whitespace-pre-wrap">{r.officerNotes}</div>
          </section>
        )}

        {/* תמונות */}
        {r.photos.length > 0 && (
          <section className="mb-4">
            <h2 className="font-bold text-slate-700 border-b border-slate-200 mb-2">תמונות</h2>
            <div className="grid grid-cols-3 gap-2">
              {r.photos.map((p) => (
                <div key={p.kind}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.blobUrl} alt={PHOTO_LABEL[p.kind] ?? p.kind} className="w-full h-28 object-cover rounded border border-slate-300" />
                  <span className="text-[10px] text-slate-500 block text-center">{PHOTO_LABEL[p.kind] ?? p.kind}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* חתימות */}
        <section className="grid grid-cols-2 gap-8 mt-6">
          <div className="border-t border-slate-400 pt-2">
            <div className="text-slate-500 text-xs">אישור מג״ד</div>
            {r.magadSignature ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.magadSignature} alt="חתימת מגד" className="max-h-20" />
            ) : <div className="h-20" />}
            <div className="text-[10px] text-slate-400">{il(r.magadAt)}</div>
          </div>
          <div className="border-t border-slate-400 pt-2">
            <div className="text-slate-500 text-xs">אישור בוחן רכב{r.examinerName ? ` — ${r.examinerName}` : ""}</div>
            {r.examinerSignature ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.examinerSignature} alt="חתימת בוחן" className="max-h-20" />
            ) : <div className="h-20" />}
            <div className="text-[10px] text-slate-400">{il(r.examinerAt)}</div>
          </div>
        </section>

        <p className="text-[10px] text-slate-400 text-center mt-6">הופק אוטומטית ממערכת PALMY · {docNo}</p>
      </div>
    </div>
  );
}
