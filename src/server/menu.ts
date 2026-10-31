import "server-only";
import { db } from "@/lib/db";
import { toPaise } from "@/lib/gst";
import type { MenuItemData } from "@/lib/cart";
import { buildSuggestions } from "@/lib/suggestions";

/** Ratings are only shown once a dish has a few, so one unhappy guest doesn't define it. */
export const MIN_RATINGS_SHOWN = 3;

async function togetherCounts(restaurantId: string) {
  return db.$queryRaw<{ a: string; b: string; orders: number }[]>`
    SELECT x."menuItemId" AS a, y."menuItemId" AS b, COUNT(DISTINCT x."orderId")::int AS orders
    FROM "OrderItem" x
    JOIN "OrderItem" y ON y."orderId" = x."orderId" AND x."menuItemId" < y."menuItemId"
    JOIN "Order" o ON o.id = x."orderId"
    WHERE o."restaurantId" = ${restaurantId} AND o.status = 'PAID' AND o."paidAt" > now() - interval '60 days'
      AND x.status <> 'CANCELLED' AND y.status <> 'CANCELLED'
    GROUP BY 1, 2
    ORDER BY 3 DESC
    LIMIT 1000`;
}

export interface MenuCategory {
  id: string;
  name: string;
  items: MenuItemData[];
}

/** Active categories with their items, prices in paise and the effective GST rate filled in. */
export async function loadMenu(restaurantId: string, defaultGstRate: number): Promise<MenuCategory[]> {
  const categories = await db.category.findMany({
    where: { restaurantId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      items: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          variants: { orderBy: { sortOrder: "asc" } },
          addonGroups: { orderBy: { sortOrder: "asc" }, include: { options: { orderBy: { sortOrder: "asc" } } } },
          media: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
  const all = categories.flatMap((c) => c.items);
  const [together, ratings] = await Promise.all([
    togetherCounts(restaurantId),
    db.dishRating.groupBy({ by: ["menuItemId"], where: { restaurantId }, _avg: { rating: true }, _count: true }),
  ]);
  const suggestions = buildSuggestions(
    all.map((i) => ({ id: i.id, pairsWith: i.pairsWith, available: i.isAvailable })),
    together,
  );
  const ratingOf = new Map(ratings.map((r) => [r.menuItemId, { average: Math.round((r._avg.rating ?? 0) * 10) / 10, count: r._count }]));

  return categories
    .filter((c) => c.items.length > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      items: c.items.map((i) => ({
        id: i.id,
        name: i.name,
        description: i.description,
        price: toPaise(i.price),
        imageUrl: i.imageUrl,
        foodType: i.foodType,
        gstRate: i.gstRate === null ? defaultGstRate : Number(i.gstRate),
        isAvailable: i.isAvailable,
        isBestseller: i.isBestseller,
        spiceLevel: i.spiceLevel,
        variants: i.variants.map((v) => ({ id: v.id, name: v.name, price: toPaise(v.price) })),
        addonGroups: i.addonGroups.map((g) => ({
          id: g.id,
          name: g.name,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          options: g.options.map((o) => ({ id: o.id, name: o.name, price: toPaise(o.price) })),
        })),
        media: i.media.map((m) => ({ kind: m.kind as "IMAGE" | "VIDEO", url: m.url })),
        isKidsFriendly: i.isKidsFriendly,
        rating: (ratingOf.get(i.id)?.count ?? 0) >= MIN_RATINGS_SHOWN ? ratingOf.get(i.id)! : null,
        suggestions: suggestions.get(i.id) ?? [],
      })),
    }));
}
