import { MessageCircle } from "lucide-react";
import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/gst";
import { Card, PageHeader } from "@/components/ui";
import { AddIngredientForm, AutoSoldOutToggle, IngredientRow } from "./stock-controls";
import { formatQty, InventoryTabs } from "./tabs";

export const metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const [restaurant, ingredients] = await Promise.all([
    db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { name: true, whatsappNumber: true, phone: true, autoSoldOut: true } }),
    db.ingredient.findMany({ where: { restaurantId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
  ]);
  const rows = ingredients.map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    stock: Number(i.currentStock),
    low: Number(i.lowStockLevel),
    cost: Number(i.costPerUnit),
    isActive: i.isActive,
  }));
  const low = rows.filter((r) => r.isActive && r.stock <= r.low);
  const autoOut = await db.menuItem.findMany({ where: { restaurantId, autoSoldOut: true }, select: { name: true }, orderBy: { name: "asc" } });
  const value = rows.reduce((s, r) => s + Math.max(0, r.stock) * r.cost, 0);
  const owner = restaurant.whatsappNumber || restaurant.phone;
  const lowText = [`*${restaurant.name}: low stock*`, ...low.map((r) => `• ${r.name}: ${formatQty(r.stock, r.unit)} (min ${formatQty(r.low, r.unit)})`)].join("\n");

  return (
    <div className="max-w-6xl">
      <PageHeader title="Inventory" description="Stock goes down automatically when orders reach the kitchen, using each dish's recipe." />
      <InventoryTabs active="stock" />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-stone-500">Ingredients</p>
          <p className="text-xl font-semibold">{rows.filter((r) => r.isActive).length}</p>
        </Card>
        <Card className={`p-4 ${low.length ? "bg-red-50 ring-1 ring-red-200" : ""}`}>
          <p className="text-xs text-stone-500">Low stock</p>
          <p className={`text-xl font-semibold ${low.length ? "text-red-700" : ""}`}>{low.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-stone-500">Stock value</p>
          <p className="text-xl font-semibold">{formatINR(Math.round(value * 100))}</p>
        </Card>
      </div>

      {low.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="flex-1">Running low: {low.map((r) => r.name).join(", ")}</span>
          {owner && (
            <a
              href={`https://wa.me/91${owner}?text=${encodeURIComponent(lowText)}`}
              target="_blank"
              className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-3 py-1.5 font-medium text-white"
            >
              <MessageCircle size={14} /> Send list on WhatsApp
            </a>
          )}
        </div>
      )}

      <Card className="mb-6 space-y-2">
        <AutoSoldOutToggle on={restaurant.autoSoldOut} />
        <p className="text-xs text-stone-500">
          A dish turns &ldquo;Sold out&rdquo; on the QR menu and POS when its recipe can&apos;t be made from what&apos;s in stock, and comes back as soon as you enter a
          purchase or stock count. Turn this off if you don&apos;t record purchases regularly.
        </p>
        {autoOut.length > 0 && (
          <p className="text-sm text-red-700">
            Sold out right now: <strong>{autoOut.map((i) => i.name).join(", ")}</strong>
          </p>
        )}
      </Card>

      <Card className="mb-6">
        <h2 className="mb-3 font-semibold">Add ingredient</h2>
        <AddIngredientForm />
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">Ingredient</th>
              <th className="px-4 py-3 text-right font-medium">In stock</th>
              <th className="px-4 py-3 text-right font-medium">Alert below</th>
              <th className="px-4 py-3 text-right font-medium">Avg cost</th>
              <th className="px-4 py-3 font-medium">Update stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-stone-500">
                  Add ingredients like Paneer (kg), Milk (l) or Eggs (pcs), then set recipes for your dishes.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <IngredientRow key={r.id} row={r} />
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
