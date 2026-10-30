import "server-only";
import type { Prisma } from "@prisma/client";
import { usageFor, type RecipeLineInput } from "@/lib/inventory";

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
}

function groupBy<T>(list: T[], key: (t: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of list) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
}
