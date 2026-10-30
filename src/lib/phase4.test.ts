import { describe, expect, it } from "vitest";
import { foodCostPercent, recipeCostPaise, recipeFor, usageFor, weightedAverageCost } from "./inventory";
import { checkRedemption, maxRedeemable, pointsEarned, redeemValuePaise } from "./loyalty";
import { orderBill } from "./order-bill";

describe("loyalty", () => {
  const s = { earnPer100: 2, pointValue: 1, minRedeem: 50 };
  it("earns points per ₹100", () => {
    expect(pointsEarned(45400, s)).toBe(9); // ₹454 -> 9.08
    expect(pointsEarned(9900, s)).toBe(1);
  });
  it("caps redemption by balance and bill, and enforces the minimum", () => {
    expect(maxRedeemable(300, 20000, s)).toBe(200);
    expect(maxRedeemable(40, 20000, s)).toBe(0);
    expect(checkRedemption(30, 300, 20000, s)).toMatch(/At least 50/);
    expect(checkRedemption(400, 300, 50000, s)).toMatch(/only 300/);
    expect(checkRedemption(250, 300, 20000, s)).toMatch(/more than the bill/);
    expect(checkRedemption(100, 300, 20000, s)).toBeNull();
    expect(redeemValuePaise(100, { ...s, pointValue: 0.5 })).toBe(5000);
  });
});

describe("order bill with points", () => {
  it("takes points off after the percent discount and before tax", () => {
    const items = [{ unitPrice: 500, quantity: 2, gstRate: 5, status: "SERVED" }];
    const b = orderBill(items, { gstEnabled: true, gstMode: "EXCLUSIVE", serviceChargeRate: 0 }, { type: "PERCENT", value: 10 }, 5000);
    // 1000 - 100 (10%) - 50 (points) = 850; +5% = 892.50 -> 893
    expect(b.discount).toBe(15000);
    expect(b.taxableValue).toBe(85000);
    expect(b.grandTotal).toBe(89300);
  });
});

describe("inventory", () => {
  const recipes = new Map([
    [
      "dal",
      [
        { ingredientId: "dal", variantId: null, quantity: 0.15 },
        { ingredientId: "butter", variantId: null, quantity: 0.02 },
        { ingredientId: "dal", variantId: "full", quantity: 0.25 },
      ],
    ],
  ]);
  it("uses the variant recipe when present, else the default", () => {
    expect(recipeFor(recipes.get("dal")!, "full").map((l) => l.quantity)).toEqual([0.25]);
    expect(recipeFor(recipes.get("dal")!, "half")).toHaveLength(2);
  });
  it("adds up usage across items", () => {
    const usage = usageFor(
      [
        { menuItemId: "dal", variantId: "half", quantity: 2 },
        { menuItemId: "dal", variantId: "full", quantity: 1 },
        { menuItemId: "no-recipe", variantId: null, quantity: 5 },
      ],
      recipes,
    );
    expect(Object.fromEntries(usage)).toEqual({ dal: 0.55, butter: 0.04 });
  });
  it("averages purchase cost and ignores negative stock", () => {
    expect(weightedAverageCost(10, 300, 10, 360)).toBe(330);
    expect(weightedAverageCost(-2, 300, 5, 400)).toBe(400);
  });
  it("computes food cost", () => {
    const cost = recipeCostPaise([
      { quantity: 0.2, costPerUnit: 320 },
      { quantity: 0.05, costPerUnit: 60 },
    ]);
    expect(cost).toBe(6700);
    expect(foodCostPercent(cost, 26000)).toBe(25.8);
  });
});
