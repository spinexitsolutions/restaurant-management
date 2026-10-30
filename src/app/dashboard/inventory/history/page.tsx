import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/gst";
import { Badge, Card, PageHeader } from "@/components/ui";
import { formatQty, InventoryTabs } from "../tabs";

export const metadata = { title: "Stock history" };

const LABEL = { PURCHASE: "Purchase", SALE: "Used in orders", SALE_RETURN: "Returned (cancelled)", WASTAGE: "Wastage", ADJUSTMENT: "Count / adjustment" } as const;
const TONE = { PURCHASE: "green", SALE: "stone", SALE_RETURN: "stone", WASTAGE: "red", ADJUSTMENT: "amber" } as const;

export default async function StockHistoryPage() {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const moves = await db.stockMovement.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { ingredient: { select: { name: true, unit: true } } },
  });
  return (
    <div className="max-w-6xl">
      <PageHeader title="Inventory" description="Last 300 stock movements." />
      <InventoryTabs active="history" />
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Ingredient</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 text-right font-medium">Quantity</th>
              <th className="px-4 py-3 text-right font-medium">Cost</th>
              <th className="px-4 py-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {moves.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-stone-500">
                  No stock movements yet.
                </td>
              </tr>
            )}
            {moves.map((m) => {
              const q = Number(m.quantity);
              return (
                <tr key={m.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-stone-600">{m.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="px-4 py-3 font-medium">{m.ingredient.name}</td>
                  <td className="px-4 py-3">
                    <Badge tone={TONE[m.type]}>{LABEL[m.type]}</Badge>
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums ${q < 0 ? "text-red-700" : "text-green-700"}`}>
                    {q > 0 ? "+" : ""}
                    {formatQty(q, m.ingredient.unit)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-stone-600">{m.unitCost ? formatINR(Math.round(Math.abs(q) * Number(m.unitCost) * 100)) : "-"}</td>
                  <td className="px-4 py-3 text-xs text-stone-600">{[m.supplier, m.note].filter(Boolean).join(" · ") || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
