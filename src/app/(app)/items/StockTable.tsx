"use client";

import { useState } from "react";
import { Card, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { TRACKING_METHOD } from "@/lib/labels";
import { declareStock } from "./stock-actions";

type Item = {
  id: string; name: string; sku: string | null; unit: string;
  trackingMethod: "QUANTITY" | "SERIAL" | "LOT" | "KIT";
  category: string | null;
  total: number;
  transit: number;
};

export default function StockTable({ items }: { items: Item[] }) {
  const [search, setSearch] = useState("");
  const filtered = items.filter((i) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return i.name.toLowerCase().includes(s) || (i.sku || "").toLowerCase().includes(s);
  });

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-48">
          <label className="block text-xs text-slate-500 mb-1">חיפוש פריט</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="שם או מק״ט..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <p className="text-xs text-slate-500 mb-2">
          {filtered.length} פריטים · עדכן כמות לפי הציוד שהגדוד חתום עליו מול החטיבה
        </p>
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState>אין פריטים. צור פריטים בטאב &quot;פריטים&quot;.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>פריט</Th><Th>מק״ט</Th><Th>קטגוריה</Th><Th>שיטה</Th>
                <Th>במלאי כעת</Th><Th>הצהרת כמות</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id}>
                  <Td className="font-medium">{i.name}</Td>
                  <Td className="font-mono text-xs text-slate-500">{i.sku ?? "—"}</Td>
                  <Td>{i.category ?? "—"}</Td>
                  <Td><Badge>{TRACKING_METHOD[i.trackingMethod]}</Badge></Td>
                  <Td className="font-bold text-slate-800">
                    {i.total} <span className="text-xs text-slate-400 font-normal">{i.unit}</span>
                    {i.transit > 0 && <div className="text-[10px] text-amber-600 font-normal">כולל {i.transit} במעבר</div>}
                  </Td>
                  <Td>
                    <form action={declareStock} className="flex items-center gap-1">
                      <input type="hidden" name="itemTypeId" value={i.id} />
                      {i.trackingMethod === "LOT" && (
                        <input name="lotNumber" placeholder="מס׳ אצווה" required
                          className="w-24 rounded border border-slate-300 px-2 py-1 text-sm" />
                      )}
                      <input name="quantity" type="number" min="0" defaultValue={i.trackingMethod === "QUANTITY" ? i.total : ""}
                        placeholder={i.trackingMethod === "SERIAL" ? "כמה ליצור" : i.trackingMethod === "LOT" ? "באצווה" : "סך הכל"}
                        className="w-24 rounded border border-slate-300 px-2 py-1 text-sm" />
                      <button className="text-xs bg-emerald-600 text-white rounded-md px-2.5 py-1 hover:bg-emerald-700">
                        {i.trackingMethod === "QUANTITY" ? "עדכן" : "הוסף"}
                      </button>
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
        <p className="font-semibold mb-1">איך זה עובד?</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li><b>כמותי</b> — עדכן את הכמות הכוללת (קסדות, אפודים).</li>
          <li><b>פרטני</b> — הזן כמה יחידות ליצור; ייווצרו מס״דים זמניים שאפשר לעדכן ידנית או לטעון מאקסל.</li>
          <li><b>אצווה</b> — הזן מספר אצווה + כמות. ניתן להזין כמה אצוות לאותו פריט.</li>
          <li>המערכת מנתבת אוטומטית את הפריט למחסן הנכון לפי הקטגוריה שלו.</li>
        </ul>
      </div>
    </>
  );
}
