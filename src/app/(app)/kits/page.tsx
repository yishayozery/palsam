import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { PageHeader, Badge, Card, Table, Th, Td, EmptyState } from "@/components/ui";
import KitForm from "./KitForm";
import { deleteKit } from "./actions";

export const dynamic = "force-dynamic";

export default async function KitsPage() {
  const user = await requireUser();
  if (!can(user.role, "signatures.manage")) redirect("/");

  const bId = user.battalionId!;
  // אם אין holderId ראשי — ניקח את הראשון מ-holderIds (קצין מחסן יכול להיות מוקצה דרך UserHolder בלבד)
  const effectiveHolderId = user.holderId ?? user.holderIds?.[0] ?? null;
  if (!effectiveHolderId) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-500">אינך משויך למחסן או פלוגה. פנה למפ״ם להגדרת השיוך.</p>
      </div>
    );
  }
  const holder = await prisma.holder.findUnique({ where: { id: effectiveHolderId } });

  // סקופ פריטים: רק לפי טיפוסי המחסנים של המשתמש (אם הוא קצין מחסן)
  const myWarehouseTypes: string[] = [];
  if (user.role === "WAREHOUSE_MANAGER" && user.holderIds?.length) {
    const myHolders = await prisma.holder.findMany({
      where: { id: { in: user.holderIds }, kind: "WAREHOUSE" },
      select: { warehouseType: true },
    });
    for (const h of myHolders) if (h.warehouseType) myWarehouseTypes.push(h.warehouseType);
  }
  const scoped = user.role === "WAREHOUSE_MANAGER" && myWarehouseTypes.length > 0;

  const [kits, items] = await Promise.all([
    prisma.signableKit.findMany({
      where: { holderId: effectiveHolderId, active: true },
      include: { lines: { include: { itemType: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.itemType.findMany({
      where: {
        battalionId: bId, active: true,
        ...(scoped ? { category: { warehouseType: { in: myWarehouseTypes as ("EQUIPMENT"|"COMMS"|"AMMO"|"ARMORY"|"VEHICLES"|"MEDICAL"|"GENERAL")[] } } } : {}),
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="ערכות החתמה"
        subtitle={`ערכות שמכילות כמה פריטים — להחתמה מהירה של חייל. (${holder?.name ?? ""})`}
        action={<KitForm items={items.map((i) => ({ id: i.id, name: i.name, sku: i.sku ?? "" }))} />}
      />
      <Card>
        {kits.length === 0 ? (
          <EmptyState>אין ערכות. צור ערכה ראשונה (לדוגמה: ערכת לוחם, ערכת חפ&quot;ק).</EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>שם ערכה</Th><Th>תכולה</Th><Th></Th></tr></thead>
            <tbody>
              {kits.map((k) => (
                <tr key={k.id}>
                  <Td className="font-medium">{k.name}</Td>
                  <Td>
                    {k.lines.length === 0 ? <span className="text-slate-400">—</span> : (
                      <div className="flex flex-wrap gap-1">
                        {k.lines.map((l) => (
                          <Badge key={l.id} className="bg-slate-100 text-slate-700">{l.itemType.name} ×{l.quantity}</Badge>
                        ))}
                      </div>
                    )}
                  </Td>
                  <Td className="flex gap-2">
                    <KitForm
                      items={items.map((i) => ({ id: i.id, name: i.name, sku: i.sku ?? "" }))}
                      edit={{ id: k.id, name: k.name, lines: k.lines.map((l) => ({ itemTypeId: l.itemTypeId, quantity: l.quantity })) }}
                    />
                    <form action={deleteKit}>
                      <input type="hidden" name="id" value={k.id} />
                      <button className="text-xs text-rose-500 hover:text-rose-700">מחיקה</button>
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
