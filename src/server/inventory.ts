import "server-only";
import type { Prisma } from "@prisma/client";
import { soldOutItems, usageFor, type RecipeLineInput } from "@/lib/inventory";

type Tx = Prisma.TransactionClient;

async function recipesFor(tx: Tx, menuItemIds: string[]) {
  const lines = await tx.recipeLine.findMany({ where: { menuItemId: { in: menuItemIds } } });
  const map = new Map<string, RecipeLineInput[]>();
  for (const l of lines) {
    const list = map.get(l.menuItemId) ?? [];
    list.push({ ingredientId: l.ingredientId, variantId: l.variantId, quantity: Number(l.quantity) });
    map.set(l.menuItemId, list);
  }
  return map;
}

async function move(tx: Tx, restaurantId: string, usage: Map<string, number>, sign: 1 | -1, type: "SALE" | "SALE_RETURN", orderId: string | null) {
  for (const [ingredientId, qty] of usage) {
    if (qty === 0) continue;
    // Restrict to this restaurant's ingredients in case a recipe was copied between restaurants.
    const updated = await tx.ingredient.updateMany({ where: { id: ingredientId, restaurantId }, data: { currentStock: { increment: sign * qty } } });
    if (updated.count) await tx.stockMovement.create({ data: { restaurantId, ingredientId, type, quantity: sign * qty, orderId } });
  }
}

/**
 * Takes ingredients out of stock for order items sent to the kitchen. Each item is consumed once
 * (tracked by `stockDeducted`). Stock may go negative: sales are never blocked by inventory.
 */
export async function consumeItems(tx: Tx, restaurantId: string, where: Prisma.OrderItemWhereInput) {
  const items = await tx.orderItem.findMany({ where: { ...where, stockDeducted: false, status: { not: "CANCELLED" } } });
  if (!items.length) return;
  const recipes = await recipesFor(tx, [...new Set(items.map((i) => i.menuItemId).filter((x): x is string => !!x))]);
  for (const [orderId, group] of groupBy(items, (i) => i.orderId)) {
    await move(tx, restaurantId, usageFor(group, recipes), -1, "SALE", orderId);
  }
  await tx.orderItem.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { stockDeducted: true } });
  await refreshAvailability(tx, restaurantId, [...new Set([...recipes.values()].flat().map((l) => l.ingredientId))]);
}

/** Puts ingredients back for items cancelled before the kitchen started them. */
export async function returnItems(tx: Tx, restaurantId: string, itemIds: string[]) {
  const items = await tx.orderItem.findMany({ where: { id: { in: itemIds }, stockDeducted: true } });
  if (!items.length) return;
  const recipes = await recipesFor(tx, [...new Set(items.map((i) => i.menuItemId).filter((x): x is string => !!x))]);
  for (const [orderId, group] of groupBy(items, (i) => i.orderId)) {
    await move(tx, restaurantId, usageFor(group, recipes), 1, "SALE_RETURN", orderId);
  }
  await tx.orderItem.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { stockDeducted: false } });
  await refreshAvailability(tx, restaurantId, [...new Set([...recipes.values()].flat().map((l) => l.ingredientId))]);
}

function groupBy<T>(list: T[], key: (t: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of list) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
}

/**
 * Re-checks which dishes can still be made after stock changed and flips their automatic
 * "sold out" flag. Only dishes using `ingredientIds` are checked when given.
 */
export async function refreshAvailability(tx: Tx, restaurantId: string, ingredientIds?: string[]) {
  const r = await tx.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { autoSoldOut: true } });
  if (!r.autoSoldOut) {
    const cleared = await tx.menuItem.updateMany({ where: { restaurantId, autoSoldOut: true }, data: { autoSoldOut: false } });
    if (cleared.count) await tx.restaurant.update({ where: { id: restaurantId }, data: { liveVersion: { increment: 1 } } });
    return;
  }
  const items = await tx.menuItem.findMany({
    where: { restaurantId, recipe: ingredientIds ? { some: { ingredientId: { in: ingredientIds } } } : { some: {} } },
    select: { id: true, autoSoldOut: true, variants: { select: { id: true } }, recipe: { select: { ingredientId: true, variantId: true, quantity: true } } },
  });
  if (!items.length) return;
  const used = [...new Set(items.flatMap((i) => i.recipe.map((l) => l.ingredientId)))];
  const stock = new Map((await tx.ingredient.findMany({ where: { id: { in: used } }, select: { id: true, currentStock: true } })).map((i) => [i.id, Number(i.currentStock)]));
  const out = soldOutItems(
    items.map((i) => ({ id: i.id, variantIds: i.variants.map((v) => v.id), recipe: i.recipe.map((l) => ({ ...l, quantity: Number(l.quantity) })) })),
    stock,
  );
  const nowOut = items.filter((i) => out.has(i.id) && !i.autoSoldOut).map((i) => i.id);
  const backIn = items.filter((i) => !out.has(i.id) && i.autoSoldOut).map((i) => i.id);
  if (nowOut.length) await tx.menuItem.updateMany({ where: { id: { in: nowOut } }, data: { autoSoldOut: true } });
  if (backIn.length) await tx.menuItem.updateMany({ where: { id: { in: backIn } }, data: { autoSoldOut: false } });
  if (nowOut.length || backIn.length) await tx.restaurant.update({ where: { id: restaurantId }, data: { liveVersion: { increment: 1 } } });
}
