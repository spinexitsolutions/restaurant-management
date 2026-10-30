import Link from "next/link";
import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatINR, toPaise } from "@/lib/gst";
import { foodCostPercent, recipeCostPaise, recipeFor } from "@/lib/inventory";
import { Badge, Card, PageHeader } from "@/components/ui";
import { InventoryTabs } from "../tabs";

export const metadata = { title: "Recipes" };

export default async function RecipesPage() {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const items = await db.menuItem.findMany({
    where: { restaurantId },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    include: { category: { select: { name: true } }, variants: { orderBy: { sortOrder: "asc" } }, recipe: { include: { ingredient: { select: { costPerUnit: true } } } } },
  });

  const rows = items.map((item) => {
    const lines = item.recipe.map((l) => ({ ingredientId: l.ingredientId, variantId: l.variantId, quantity: Number(l.quantity), costPerUnit: Number(l.ingredient.costPerUnit) }));
    const portions = item.variants.length
      ? item.variants.map((v) => ({ label: v.name, price: toPaise(v.price), cost: recipeCostPaise(recipeFor(lines, v.id)) }))
      : [{ label: null as string | null, price: toPaise(item.price), cost: recipeCostPaise(recipeFor(lines, null)) }];
    return { id: item.id, name: item.name, category: item.category.name, hasRecipe: lines.length > 0, portions };
  });

  return (
    <div className="max-w-6xl">
      <PageHeader title="Inventory" description="Set what goes into each dish. Food cost = ingredient cost ÷ menu price." />
      <InventoryTabs active="recipes" />
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">Dish</th>
              <th className="px-4 py-3 font-medium">Size</th>
              <th className="px-4 py-3 text-right font-medium">Price</th>
              <th className="px-4 py-3 text-right font-medium">Ingredient cost</th>
              <th className="px-4 py-3 text-right font-medium">Food cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r) =>
              r.portions.map((p, i) => {
                const pct = r.hasRecipe ? foodCostPercent(p.cost, p.price) : null;
                return (
                  <tr key={`${r.id}-${i}`}>
                    {i === 0 && (
                      <td className="px-4 py-3" rowSpan={r.portions.length}>
                        <Link href={`/dashboard/inventory/recipes/${r.id}`} className="font-medium text-brand-700 hover:underline">
                          {r.name}
                        </Link>
                        <p className="text-xs text-stone-500">{r.category}</p>
                      </td>
                    )}
                    <td className="px-4 py-3 text-stone-600">{p.label ?? "-"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatINR(p.price)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.hasRecipe ? formatINR(p.cost) : "-"}</td>
                    <td className="px-4 py-3 text-right">
                      {pct === null ? (
                        <Link href={`/dashboard/inventory/recipes/${r.id}`} className="text-xs text-stone-400 hover:underline">
                          Add recipe
                        </Link>
                      ) : (
                        <Badge tone={pct > 40 ? "red" : pct > 30 ? "amber" : "green"}>{pct}%</Badge>
                      )}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-xs text-stone-500">Most restaurants aim for 25–35% food cost. Prices are compared before GST.</p>
    </div>
  );
}
