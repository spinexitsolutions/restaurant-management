"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MANAGE_ROLES, requireRestaurantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { round3, UNITS, weightedAverageCost } from "@/lib/inventory";
import { refreshAvailability } from "@/server/inventory";

export type FormState = { error?: string; ok?: string } | null;

const qty = z.coerce.number().min(0, "Quantity can't be negative").max(1_000_000);

const ingredientSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(60),
  unit: z.enum(UNITS),
  lowStockLevel: qty,
  openingStock: qty.optional(),
  costPerUnit: z.coerce.number().min(0).max(1_000_000).optional(),
});

export async function createIngredient(_: FormState, formData: FormData): Promise<FormState> {
  const s = await requireRestaurantSession(MANAGE_ROLES);
  const parsed = ingredientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const exists = await db.ingredient.findFirst({ where: { restaurantId: s.restaurantId, name: { equals: d.name, mode: "insensitive" } } });
  if (exists) return { error: `${d.name} already exists` };
  await db.$transaction(async (tx) => {
    const ing = await tx.ingredient.create({
      data: { restaurantId: s.restaurantId, name: d.name, unit: d.unit, lowStockLevel: d.lowStockLevel, currentStock: d.openingStock ?? 0, costPerUnit: d.costPerUnit ?? 0 },
    });
    if (d.openingStock) {
      await tx.stockMovement.create({
        data: { restaurantId: s.restaurantId, ingredientId: ing.id, type: "ADJUSTMENT", quantity: d.openingStock, unitCost: d.costPerUnit ?? 0, note: "Opening stock", createdById: s.userId },
      });
    }
  });
  revalidatePath("/dashboard/inventory");
  return { ok: `${d.name} added` };
}

const updateSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(60),
  lowStockLevel: qty,
  isActive: z.boolean(),
});

export async function updateIngredient(input: z.input<typeof updateSchema>): Promise<FormState> {
  const s = await requireRestaurantSession(MANAGE_ROLES);
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...data } = parsed.data;
  await db.ingredient.updateMany({ where: { id, restaurantId: s.restaurantId }, data });
  revalidatePath("/dashboard/inventory");
  return { ok: "Saved" };
}

const entrySchema = z.object({
  ingredientId: z.string(),
  kind: z.enum(["PURCHASE", "WASTAGE", "COUNT"]),
  quantity: qty,
  unitCost: z.coerce.number().min(0).max(1_000_000).optional(),
  supplier: z.string().trim().max(80).optional(),
  note: z.string().trim().max(200).optional(),
});

/** Purchase (adds stock, updates average cost), wastage (removes), or physical count (sets stock). */
export async function stockEntry(input: z.input<typeof entrySchema>): Promise<FormState> {
  const s = await requireRestaurantSession(MANAGE_ROLES);
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.kind !== "COUNT" && d.quantity <= 0) return { error: "Enter a quantity" };

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "Ingredient" WHERE id = ${d.ingredientId} FOR UPDATE`;
    const ing = await tx.ingredient.findFirst({ where: { id: d.ingredientId, restaurantId: s.restaurantId } });
    if (!ing) return { error: "Ingredient not found" };
    const stock = Number(ing.currentStock);
    const base = { restaurantId: s.restaurantId, ingredientId: ing.id, createdById: s.userId, note: d.note || null };

    if (d.kind === "PURCHASE") {
      const unitCost = d.unitCost ?? Number(ing.costPerUnit);
      await tx.ingredient.update({
        where: { id: ing.id },
        data: { currentStock: round3(stock + d.quantity), costPerUnit: weightedAverageCost(stock, Number(ing.costPerUnit), d.quantity, unitCost) },
      });
      await tx.stockMovement.create({ data: { ...base, type: "PURCHASE", quantity: d.quantity, unitCost, supplier: d.supplier || null } });
    } else if (d.kind === "WASTAGE") {
      await tx.ingredient.update({ where: { id: ing.id }, data: { currentStock: round3(stock - d.quantity) } });
      await tx.stockMovement.create({ data: { ...base, type: "WASTAGE", quantity: -d.quantity, unitCost: ing.costPerUnit } });
    } else {
      const diff = round3(d.quantity - stock);
      await tx.ingredient.update({ where: { id: ing.id }, data: { currentStock: d.quantity } });
      if (diff !== 0) await tx.stockMovement.create({ data: { ...base, type: "ADJUSTMENT", quantity: diff, unitCost: ing.costPerUnit, note: d.note || "Stock count" } });
    }
    await refreshAvailability(tx, s.restaurantId, [ing.id]);
    revalidatePath("/dashboard/inventory");
    return { ok: "Stock updated" };
  });
}

const recipeSchema = z.object({
  menuItemId: z.string(),
  lines: z
    .array(z.object({ ingredientId: z.string(), variantId: z.string().nullable(), quantity: z.number().positive("Quantities must be more than 0").max(100000) }))
    .max(100),
});

export async function saveRecipe(input: z.input<typeof recipeSchema>): Promise<FormState> {
  const s = await requireRestaurantSession(MANAGE_ROLES);
  const parsed = recipeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { menuItemId, lines } = parsed.data;
  const item = await db.menuItem.findFirst({ where: { id: menuItemId, restaurantId: s.restaurantId }, include: { variants: true } });
  if (!item) return { error: "Menu item not found" };
  const ingredientIds = new Set((await db.ingredient.findMany({ where: { restaurantId: s.restaurantId }, select: { id: true } })).map((i) => i.id));
  const variantIds = new Set(item.variants.map((v) => v.id));
  for (const l of lines) {
    if (!ingredientIds.has(l.ingredientId)) return { error: "Unknown ingredient" };
    if (l.variantId && !variantIds.has(l.variantId)) return { error: "Unknown size" };
  }
  const seen = new Set<string>();
  for (const l of lines) {
    const key = `${l.variantId}|${l.ingredientId}`;
    if (seen.has(key)) return { error: "An ingredient is listed twice for the same size" };
    seen.add(key);
  }
  await db.$transaction(async (tx) => {
    await tx.recipeLine.deleteMany({ where: { menuItemId } });
    await tx.recipeLine.createMany({ data: lines.map((l) => ({ menuItemId, ingredientId: l.ingredientId, variantId: l.variantId, quantity: l.quantity })) });
    // A dish whose recipe was removed can't stay auto sold out.
    if (!lines.length) await tx.menuItem.update({ where: { id: menuItemId }, data: { autoSoldOut: false } });
    else await refreshAvailability(tx, s.restaurantId, lines.map((l) => l.ingredientId));
  });
  revalidatePath("/dashboard/inventory");
  return { ok: "Recipe saved" };
}

export async function setAutoSoldOut(on: boolean) {
  const s = await requireRestaurantSession(MANAGE_ROLES);
  await db.$transaction(async (tx) => {
    await tx.restaurant.update({ where: { id: s.restaurantId }, data: { autoSoldOut: on } });
    await refreshAvailability(tx, s.restaurantId);
  });
  revalidatePath("/dashboard", "layout");
}
