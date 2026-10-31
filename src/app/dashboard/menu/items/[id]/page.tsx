import { notFound } from "next/navigation";
import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { ItemForm } from "../../item-form";

export const metadata = { title: "Edit item" };

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const { id } = await params;
  const [item, categories, restaurant] = await Promise.all([
    db.menuItem.findFirst({
      where: { id, restaurantId },
      include: {
        variants: { orderBy: { sortOrder: "asc" } },
        addonGroups: { orderBy: { sortOrder: "asc" }, include: { options: { orderBy: { sortOrder: "asc" } } } },
      },
    }),
    db.category.findMany({ where: { restaurantId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { defaultGstRate: true } }),
  ]);
  if (!item) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${item.name}`} />
      <ItemForm
        categories={categories}
        defaultGstRate={restaurant.defaultGstRate.toString()}
        stations={await db.kitchenStation.findMany({ where: { restaurantId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } })}
        initial={{
          id: item.id,
          categoryId: item.categoryId,
          name: item.name,
          description: item.description ?? "",
          price: item.price.toString(),
          imageUrl: item.imageUrl ?? "",
          foodType: item.foodType,
          gstRate: item.gstRate?.toString() ?? "",
          isAvailable: item.isAvailable,
          isBestseller: item.isBestseller,
          spiceLevel: String(item.spiceLevel),
          stationId: item.stationId ?? "",
          prepTimeMinutes: item.prepTimeMinutes ? String(item.prepTimeMinutes) : "",
          variants: item.variants.map((x) => ({ name: x.name, price: x.price.toString() })),
          addonGroups: item.addonGroups.map((g) => ({
            name: g.name,
            minSelect: String(g.minSelect),
            maxSelect: String(g.maxSelect),
            options: g.options.map((o) => ({ name: o.name, price: o.price.toString() })),
          })),
        }}
      />
    </div>
  );
}
