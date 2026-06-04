import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card, Table, Th, Td, EmptyState } from "@/components/ui";
import DonationForm from "./DonationForm";
import { setDonationQty, toggleSignable } from "./actions";

export const dynamic = "force-dynamic";

export default async function DonationsPage() {
  const user = await requireCapability("donations.manage");
  const bId = user.battalionId!;
  if (!user.holderId) {
    return (<div><PageHeader title="מלאי תרומה" /><Card className="p-6"><p className="text-sm text-slate-400">אינך משויך למחזיק.</p></Card></div>);
  }

  const holder = await prisma.holder.findUnique({ where: { id: user.holderId } });
  const isCompanyRep = user.role === "COMPANY_REP";
  const titleSuffix = isCompanyRep
    ? `תרומות פלוגתיות — ${holder?.name ?? ""}`
    : `מלאי תרומה — ${holder?.name ?? ""}`;
  const subtitle = isCompanyRep
    ? `ציוד שהתקבל מתורמים ייעודית לפלוגה (לא חלק ממלאי הגדוד). שייכות אוטומטית: תרומה פלוגתית.`
    : `ציוד שאינו צבאי — ${holder?.name ?? ""}. ניתן לנפק, ולבחור אם להחתים חיילים.`;
  const items = await prisma.itemType.findMany({
    where: { battalionId: bId, isDonated: true, ownerHolderId: user.holderId },
    orderBy: { name: "asc" },
    include: { stockBalances: { where: { holderId: user.holderId } } },
  });

  return (
    <div>
      <PageHeader
        title={titleSuffix}
        subtitle={subtitle}
        action={<DonationForm />}
      />
      <Card>
        {items.length === 0 ? (
          <EmptyState>אין פריטי תרומה. הוסף פריט ראשון.</EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>פריט</Th><Th>יחידה</Th><Th>כמות</Th><Th>החתמה</Th></tr></thead>
            <tbody>
              {items.map((i) => {
                const qty = i.stockBalances.reduce((s, b) => s + b.quantity, 0);
                return (
                  <tr key={i.id}>
                    <Td className="font-medium">{i.name} <Badge className="bg-purple-100 text-purple-700">תרומה</Badge></Td>
                    <Td>{i.unit}</Td>
                    <Td>
                      <form action={setDonationQty} className="flex items-center gap-1">
                        <input type="hidden" name="itemTypeId" value={i.id} />
                        <input name="quantity" type="number" min="0" defaultValue={qty}
                          className="w-20 rounded border border-slate-300 px-2 py-1 text-sm" />
                        <button className="text-xs bg-slate-700 text-white rounded px-2 py-1">עדכן</button>
                      </form>
                    </Td>
                    <Td>
                      <form action={toggleSignable}>
                        <input type="hidden" name="itemTypeId" value={i.id} />
                        <button className={`text-xs rounded-md px-2.5 py-1 ${i.signable ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {i.signable ? "✓ ניתן להחתמה" : "ללא החתמה"}
                        </button>
                      </form>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
