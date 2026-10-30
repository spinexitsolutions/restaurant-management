import { describe, expect, it } from "vitest";
import { buildInsights, forecastStock } from "./insights";

function days(n: number, f: (i: number) => { amount: number; bills: number }) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date("2026-10-03T12:00:00+05:30");
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), ...f(i) };
  });
}

describe("buildInsights", () => {
  it("spots a weekly rise, slow and costly dishes", () => {
    const insights = buildInsights({
      dailySales: days(28, (i) => ({ amount: i >= 21 ? 1_200_000 : 1_000_000, bills: 40 })),
      items: [
        { name: "Paneer Tikka", qtyNow: 30, qtyBefore: 10, amountNow: 780000, foodCostPct: 45, isAvailable: true },
        { name: "Egg Curry", qtyNow: 1, qtyBefore: 0, amountNow: 19000, foodCostPct: null, isAvailable: true },
        { name: "Seasonal Soup", qtyNow: 0, qtyBefore: 0, amountNow: 0, foodCostPct: null, isAvailable: false },
      ],
      hours: [
        { hour: 13, amount: 100 },
        { hour: 21, amount: 900 },
      ],
      discountShare: 3,
      cancelledItems: 2,
    });
    const titles = insights.map((i) => i.title);
    expect(titles).toContain("Sales up 20% this week");
    expect(titles).toContain("Average bill up 20%");
    expect(titles).toContain("Peak hour: 9 PM");
    expect(titles).toContain("Paneer Tikka is trending");
    expect(titles).toContain("1 dish hardly selling"); // sold-out/hidden items are ignored
    expect(titles).toContain("High food cost on 1 selling dish");
  });
  it("doesn't call dishes slow for a brand-new restaurant", () => {
    const insights = buildInsights({
      dailySales: days(28, (i) => ({ amount: i === 27 ? 500000 : 0, bills: i === 27 ? 5 : 0 })),
      items: [{ name: "Egg Curry", qtyNow: 0, qtyBefore: 0, amountNow: 0, foodCostPct: null, isAvailable: true }],
      hours: [],
      discountShare: 0,
      cancelledItems: 0,
    });
    expect(insights.some((i) => i.title.includes("hardly selling"))).toBe(false);
  });
  it("stays quiet without history", () => {
    expect(buildInsights({ dailySales: [], items: [], hours: [], discountShare: 0, cancelledItems: 0 })).toEqual([]);
  });
});

describe("forecastStock", () => {
  it("averages the same weekday over 4 weeks and subtracts stock", () => {
    // 2026-10-31 is a Saturday; previous Saturdays: 24, 17, 10, 3 Oct
    const usage = [
      { ingredientId: "paneer", date: "2026-10-24", qty: 3 },
      { ingredientId: "paneer", date: "2026-10-17", qty: 2 },
      { ingredientId: "paneer", date: "2026-10-10", qty: 3 },
      { ingredientId: "paneer", date: "2026-10-23", qty: 9 }, // a Friday, ignored
      { ingredientId: "milk", date: "2026-10-24", qty: 4 },
    ];
    const rows = forecastStock(
      [
        { id: "paneer", name: "Paneer", unit: "kg", stock: 1 },
        { id: "milk", name: "Milk", unit: "l", stock: 10 },
        { id: "salt", name: "Salt", unit: "kg", stock: 1 },
      ],
      usage,
      "2026-10-31",
    );
    expect(rows).toEqual([
      { name: "Paneer", unit: "kg", stock: 1, expected: 2, toBuy: 1.4 },
      { name: "Milk", unit: "l", stock: 10, expected: 1, toBuy: 0 },
    ]);
  });
});
