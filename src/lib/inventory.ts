// Inventory maths shared by the server and the recipe editor.

export interface RecipeLineInput {
  ingredientId: string;
  variantId: string | null;
  quantity: number;
}

/** Variant-specific recipe if one exists, otherwise the default (variantId = null) recipe. */
export function recipeFor<T extends RecipeLineInput>(lines: T[], variantId: string | null): T[] {
  if (variantId) {
    const own = lines.filter((l) => l.variantId === variantId);
    if (own.length) return own;
  }
  return lines.filter((l) => l.variantId === null);
}

/** Total ingredient usage for a set of sold items. */
export function usageFor(
  items: { menuItemId: string | null; variantId: string | null; quantity: number }[],
  recipes: Map<string, RecipeLineInput[]>,
): Map<string, number> {
  const usage = new Map<string, number>();
  for (const item of items) {
    if (!item.menuItemId) continue;
    for (const line of recipeFor(recipes.get(item.menuItemId) ?? [], item.variantId)) {
      usage.set(line.ingredientId, round3((usage.get(line.ingredientId) ?? 0) + line.quantity * item.quantity));
    }
  }
  return usage;
}

/** Weighted average cost after a purchase. Negative stock (sold before purchase was entered) counts as zero. */
export function weightedAverageCost(stock: number, cost: number, qty: number, unitCost: number): number {
  const base = Math.max(0, stock);
  if (base + qty <= 0) return unitCost;
  return Math.round(((base * cost + qty * unitCost) / (base + qty)) * 10000) / 10000;
}

export function recipeCostPaise(lines: { quantity: number; costPerUnit: number }[]): number {
  return Math.round(lines.reduce((s, l) => s + l.quantity * l.costPerUnit, 0) * 100);
}

/** Food cost as a percent of the menu price (before tax). */
export function foodCostPercent(costPaise: number, pricePaise: number): number | null {
  return pricePaise > 0 ? Math.round((costPaise / pricePaise) * 1000) / 10 : null;
}

export function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

export const UNITS = ["kg", "g", "l", "ml", "pcs"] as const;
