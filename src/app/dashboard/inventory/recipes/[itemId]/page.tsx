import { notFound } from "next/navigation";
import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { toPaise } from "@/lib/gst";
import { PageHeader } from "@/components/ui";
import { RecipeEditor } from "./recipe-editor";

export const metadata = { title: "Recipe" };

export default async function RecipePage({ params }: { params: Promise<{ itemId: string }> }) {
  const { restaurantId } = await requireRestaurantSession(MANAGE_ROLES);
  const { itemId } = await params;
  const [item, ingredients] = await Promise.all([
    db.menuItem.findFirst({ where: { id: itemId, restaurantId }, include: { variants: { orderBy: { sortOrder: "asc" } }, recipe: true } }),
    db.ingredient.findMany({ where: { restaurantId, isActive: true }, orderBy: { name: "asc" } }),
  ]);
  if (!item) notFound();
  return (
    <div className="max-w-3xl">
      <PageHeader title={`Recipe: ${item.name}`} description="Quantities for one portion, in each ingredient's unit." />
      <RecipeEditor
        menuItemId={item.id}
        price={toPaise(item.price)}
        variants={item.variants.map((v) => ({ id: v.id, name: v.name, price: toPaise(v.price) }))}
        ingredients={ingredients.map((i) => ({ id: i.id, name: i.name, unit: i.unit, cost: Number(i.costPerUnit) }))}
        initial={item.recipe.map((l) => ({ ingredientId: l.ingredientId, variantId: l.variantId, quantity: String(Number(l.quantity)) }))}
      />
    </div>
  );
}
