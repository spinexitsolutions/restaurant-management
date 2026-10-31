import Link from "next/link";
import { Plus } from "lucide-react";
import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, FoodTypeIcon, PageHeader } from "@/components/ui";
import { formatINR, toPaise } from "@/lib/gst";
import { cn } from "@/lib/utils";
import { AddCategoryForm, CategoryControls, ItemControls } from "./menu-controls";

export const metadata = { title: "Menu" };

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const { c } = await searchParams;

  const categories = await db.category.findMany({
    where: { restaurantId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { items: true } } },
  });
  const selected = categories.find((cat) => cat.id === c) ?? categories[0];
  const items = selected
    ? await db.menuItem.findMany({
        where: { restaurantId, categoryId: selected.id },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { variants: { orderBy: { sortOrder: "asc" } }, _count: { select: { addonGroups: true } } },
      })
    : [];
  const ratings = items.length
    ? await db.dishRating.groupBy({ by: ["menuItemId"], where: { menuItemId: { in: items.map((i) => i.id) } }, _avg: { rating: true }, _count: true })
    : [];
  const ratingOf = new Map(ratings.map((r) => [r.menuItemId, r]));

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Menu"
        description="Categories, items, variants and add-ons. Changes show on the QR menu instantly."
        actions={
          selected && (
            <Link
              href={`/dashboard/menu/items/new?category=${selected.id}`}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Plus size={16} /> Add item
            </Link>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit p-3">
          <h2 className="px-2 pb-2 text-sm font-semibold text-stone-500">Categories</h2>
          <ul className="space-y-1">
            {categories.map((cat, i) => (
              <li key={cat.id} className={cn("group flex items-center rounded-lg", cat.id === selected?.id ? "bg-brand-50" : "hover:bg-stone-50")}>
                <Link href={`/dashboard/menu?c=${cat.id}`} className="min-w-0 flex-1 px-3 py-2 text-sm">
                  <span className={cn("block truncate font-medium", !cat.isActive && "text-stone-400 line-through")}>{cat.name}</span>
                  <span className="text-xs text-stone-500">{cat._count.items} items</span>
                </Link>
                <CategoryControls id={cat.id} name={cat.name} isActive={cat.isActive} isFirst={i === 0} isLast={i === categories.length - 1} />
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-stone-100 pt-3">
            <AddCategoryForm />
          </div>
        </Card>

        <div>
          {!selected ? (
            <Card className="text-center text-sm text-stone-500">Create your first category (e.g. Starters) to start adding items.</Card>
          ) : items.length === 0 ? (
            <Card className="text-center text-sm text-stone-500">No items in {selected.name} yet.</Card>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <Card key={item.id} className={cn("flex items-center gap-4 p-4", !item.isAvailable && "opacity-60")}>
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-2xl">🍽️</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <FoodTypeIcon type={item.foodType} />
                      <Link href={`/dashboard/menu/items/${item.id}`} className="font-medium hover:underline">
                        {item.name}
                      </Link>
                      {item.isBestseller && <Badge tone="brand">Bestseller</Badge>}
                      {!item.isAvailable && <Badge tone="red">Sold out</Badge>}
                      {item.autoSoldOut && item.isAvailable && (
                        <Link href="/dashboard/inventory">
                          <Badge tone="red">Out of stock</Badge>
                        </Link>
                      )}
                      {item.isKidsFriendly && <Badge>Kids</Badge>}
                      {ratingOf.get(item.id) && (
                        <Badge tone={(ratingOf.get(item.id)!._avg.rating ?? 0) >= 4 ? "green" : (ratingOf.get(item.id)!._avg.rating ?? 0) >= 3 ? "amber" : "red"}>
                          {(ratingOf.get(item.id)!._avg.rating ?? 0).toFixed(1)}★ ({ratingOf.get(item.id)!._count})
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-stone-600">
                      {item.variants.length
                        ? item.variants.map((v) => `${v.name} ${formatINR(toPaise(v.price))}`).join(" · ")
                        : formatINR(toPaise(item.price))}
                      {item._count.addonGroups > 0 && <span className="text-stone-400"> · {item._count.addonGroups} add-on group(s)</span>}
                      {item.gstRate !== null && <span className="text-stone-400"> · GST {item.gstRate.toString()}%</span>}
                    </p>
                  </div>
                  <ItemControls id={item.id} isAvailable={item.isAvailable} />
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
