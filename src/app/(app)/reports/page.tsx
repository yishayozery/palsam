import Link from "next/link";
import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card, Table, Th, Td, EmptyState } from "@/components/ui";
import { TRACKING_METHOD } from "@/lib/labels";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const user = await requireCapability("reports.view");
  const bId = user.battalionId!;
  const { item: itemId } = await searchParams;

  const [items, categories, holders] = await Promise.all([
    prisma.itemType.findMany({ where: { battalionId: bId, active: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { battalionId: bId, active: true } }),
    prisma.holder.findMany({ where: { battalionId: bId, active: true } }),
  ]);

  // חתך פריט סריאלי נבחר — "איפה נמצא ציוד X בכל הרמות"
  const selected = itemId ? items.find((i) => i.id === itemId) : null;
  const crossSection = selected
    ? await prisma.serialUnit.findMany({
        where: { itemTypeId: selected.id },
        include: { status: true, currentHolder: true, signedSoldier: true },
        orderBy: [{ currentHolder: { name: "asc" } }],
      })
    : [];

  // פילוח מלאי לפי קטגוריה
  const byCategory = await Promise.all(
    categories.map(async (c) => {
      const serial = await prisma.serialUnit.count({ where: { itemType: { categoryId: c.id } } });
      const qty = await prisma.stockBalance.aggregate({
        _sum: { quantity: true },
        where: { itemType: { categoryId: c.id } },
      });
      return { name: c.name, serial, qty: qty._sum.quantity ?? 0 };
    }),
  );

  // פילוח לפי מחזיק
  const byHolder = await Promise.all(
    holders.map(async (h) => {
      const serial = await prisma.serialUnit.count({ where: { currentHolderId: h.id } });
      const qty = await prisma.stockBalance.aggregate({
        _sum: { quantity: true }, where: { holderId: h.id },
      });
      return { name: h.name, serial, qty: qty._sum.quantity ?? 0 };
    }),
  );

  return (
    <div>
      <PageHeader
        title="מנוע דוחות"
        subtitle="פילוח מיקומים, חתכי פריטים סריאליים וייצוא"
        action={
          <div className="flex gap-2">
            <a href="/reports/export"
              className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-emerald-700">
              ⬇ ייצוא ל-Excel
            </a>
            <PrintButton />
          </div>
        }
      />

      {/* חתך פריט סריאלי */}
      <Card className="p-5 mb-6">
        <h2 className="font-bold text-slate-700 mb-3">חתך פריט סריאלי — איפה נמצא ציוד X</h2>
        <form className="mb-4">
          <select name="item" defaultValue={itemId ?? ""}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            // submit on change via native form
          >
            <option value="">בחר פריט סריאלי...</option>
            {items.filter((i) => i.trackingMethod === "SERIAL" || i.trackingMethod === "LOT").map((i) => (
              <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>
            ))}
          </select>
          <button className="mr-2 bg-slate-800 text-white rounded-lg px-4 py-2 text-sm">הצג</button>
        </form>

        {selected && (
          crossSection.length === 0 ? (
            <EmptyState>אין יחידות לפריט זה</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr><Th>מספר סריאלי</Th><Th>סטטוס</Th><Th>מחזיק</Th><Th>חתום על</Th><Th>מיקום פיזי</Th></tr>
              </thead>
              <tbody>
                {crossSection.map((u) => (
                  <tr key={u.id}>
                    <Td className="font-mono text-xs">{u.serialNumber}</Td>
                    <Td><Badge>{u.status.name}</Badge></Td>
                    <Td>{u.currentHolder?.name ?? <span className="text-amber-600">במעבר</span>}</Td>
                    <Td>{u.signedSoldier ? <span className="text-blue-600">{u.signedSoldier.fullName}</span> : "—"}</Td>
                    <Td className="text-slate-500">{u.physicalLocation ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="font-bold text-slate-700 mb-3">פילוח לפי קטגוריה</h2>
          <Table>
            <thead><tr><Th>קטגוריה</Th><Th>סריאלי</Th><Th>כמותי</Th></tr></thead>
            <tbody>
              {byCategory.map((c) => (
                <tr key={c.name}>
                  <Td className="font-medium">{c.name}</Td>
                  <Td className="text-center">{c.serial}</Td>
                  <Td className="text-center">{c.qty}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card className="p-5">
          <h2 className="font-bold text-slate-700 mb-3">פילוח לפי מחזיק</h2>
          <Table>
            <thead><tr><Th>מחזיק</Th><Th>סריאלי</Th><Th>כמותי</Th></tr></thead>
            <tbody>
              {byHolder.map((h) => (
                <tr key={h.name}>
                  <Td className="font-medium">{h.name}</Td>
                  <Td className="text-center">{h.serial}</Td>
                  <Td className="text-center">{h.qty}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
