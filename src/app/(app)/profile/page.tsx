import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Button } from "@/components/ui";
import ImageUpload from "@/components/ImageUpload";
import { updateProfile } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireCapability("battalion.profile");
  const battalion = await prisma.battalion.findUnique({ where: { id: user.battalionId! } });
  if (!battalion) return null;

  return (
    <div>
      <PageHeader title="פרופיל הגדוד" subtitle="פרטי הגדוד וסמל היחידה" />
      <Card className="p-6 max-w-xl">
        <form action={updateProfile} className="space-y-4">
          <ImageUpload name="logoData" initial={battalion.logoData} label="סמל הגדוד" />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">שם הגדוד</label>
            <input name="name" defaultValue={battalion.name} required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">מפקד הגדוד</label>
              <input name="commander" defaultValue={battalion.commander ?? ""}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">קוד</label>
              <input value={battalion.code} disabled
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono text-slate-400" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">משפט הגדוד</label>
            <input name="motto" defaultValue={battalion.motto ?? ""} placeholder="לנצח בכל מחיר"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">הערות</label>
            <textarea name="notes" defaultValue={battalion.notes ?? ""} rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end">
            <Button>שמירה</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
