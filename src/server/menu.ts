import "server-only";
import { db } from "@/lib/db";
import { toPaise } from "@/lib/gst";
import type { MenuItemData } from "@/lib/cart";

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
        },
      },
    },
  });
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
      })),
    }));
}
