import { redirect } from "next/navigation";
import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { ItemForm } from "../../item-form";

export const metadata = { title: "New item" };

export default async function NewItemPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const { category } = await searchParams;
  const [categories, restaurant] = await Promise.all([
    db.category.findMany({ where: { restaurantId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { defaultGstRate: true } }),
  ]);
  if (categories.length === 0) redirect("/dashboard/menu");

  return (
    <div className="max-w-3xl">
      <PageHeader title="Add menu item" />
      <ItemForm
        categories={categories}
        defaultGstRate={restaurant.defaultGstRate.toString()}
        stations={await db.kitchenStation.findMany({ where: { restaurantId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } })}
        initial={{
          categoryId: categories.find((c) => c.id === category)?.id ?? categories[0].id,
          name: "",
          description: "",
          price: "",
          imageUrl: "",
          foodType: "VEG",
          gstRate: "",
          isAvailable: true,
          isBestseller: false,
          spiceLevel: "0",
          stationId: "",
          prepTimeMinutes: "",
          variants: [],
          addonGroups: [],
        }}
      />
    </div>
  );
}
