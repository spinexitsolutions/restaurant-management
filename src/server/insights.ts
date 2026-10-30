import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { toPaise } from "@/lib/gst";
import { foodCostPercent, recipeCostPaise, recipeFor } from "@/lib/inventory";
import { buildInsights, forecastStock, type ItemStat } from "@/lib/insights";
import { istDate } from "@/lib/numbering";
import { startOfIstDay } from "./stats";

const DAY = 86_400_000;
const istHour = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" }).format(d));

/** Last 28 days of sales, items, hours and stock use for one outlet, plus derived insights and a stock forecast. */
export async function loadInsights(restaurantId: string, now: Date = new Date()) {
  const end = new Date(startOfIstDay(now).getTime() + DAY); // end of today
  const start = new Date(end.getTime() - 28 * DAY);
  const mid = new Date(end.getTime() - 14 * DAY);

  const [orders, menu, cancelled, ingredients, moves] = await Promise.all([
    db.order.findMany({
      where: { restaurantId, status: "PAID", paidAt: { gte: start, lt: end } },
      select: { paidAt: true, grandTotal: true, subtotal: true, discountAmount: true, items: { where: { status: { not: "CANCELLED" } }, select: { menuItemId: true, quantity: true, unitPrice: true } } },
    }),
    db.menuItem.findMany({
      where: { restaurantId },
      select: { id: true, name: true, price: true, isAvailable: true, category: { select: { isActive: true } }, recipe: { include: { ingredient: { select: { costPerUnit: true } } } } },
    }),
    db.orderItem.count({ where: { order: { restaurantId }, status: "CANCELLED", updatedAt: { gte: start } } }),
    db.ingredient.findMany({ where: { restaurantId, isActive: true }, select: { id: true, name: true, unit: true, currentStock: true } }),
    db.stockMovement.findMany({ where: { restaurantId, type: { in: ["SALE", "SALE_RETURN"] }, createdAt: { gte: start } }, select: { ingredientId: true, quantity: true, createdAt: true } }),
  ]);

  const dailySales = Array.from({ length: 28 }, (_, i) => ({ date: istDate(new Date(start.getTime() + i * DAY + DAY / 2)), amount: 0, bills: 0 }));
  const byDate = new Map(dailySales.map((d) => [d.date, d]));
  const hours = new Map<number, number>();
  const sold = new Map<string, { now: number; before: number; amountNow: number }>();
  let gross = 0;
  let discount = 0;
  for (const o of orders) {
    const total = toPaise(o.grandTotal ?? 0);
    const day = byDate.get(istDate(o.paidAt!));
    if (day) {
      day.amount += total;
      day.bills++;
    }
    hours.set(istHour(o.paidAt!), (hours.get(istHour(o.paidAt!)) ?? 0) + total);
    gross += toPaise(o.subtotal ?? 0);
    discount += toPaise(o.discountAmount ?? 0);
    const recent = o.paidAt! >= mid;
    for (const it of o.items) {
      if (!it.menuItemId) continue;
      const s = sold.get(it.menuItemId) ?? { now: 0, before: 0, amountNow: 0 };
      if (recent) {
        s.now += it.quantity;
        s.amountNow += toPaise(it.unitPrice) * it.quantity;
      } else s.before += it.quantity;
      sold.set(it.menuItemId, s);
    }
  }

  const items: ItemStat[] = menu.map((m) => {
    const s = sold.get(m.id) ?? { now: 0, before: 0, amountNow: 0 };
    const lines = m.recipe.map((l) => ({ ingredientId: l.ingredientId, variantId: l.variantId, quantity: Number(l.quantity), costPerUnit: Number(l.ingredient.costPerUnit) }));
    const base = recipeFor(lines, null);
    return {
      name: m.name,
      qtyNow: s.now,
      qtyBefore: s.before,
      amountNow: s.amountNow,
      foodCostPct: base.length ? foodCostPercent(recipeCostPaise(base), toPaise(m.price)) : null,
      isAvailable: m.isAvailable && m.category.isActive,
    };
  });

  const insights = buildInsights({
    dailySales,
    items,
    hours: [...hours].map(([hour, amount]) => ({ hour, amount })),
    discountShare: gross ? Math.round((discount / gross) * 1000) / 10 : 0,
    cancelledItems: cancelled,
  });
  const forecast = forecastStock(
    ingredients.map((i) => ({ id: i.id, name: i.name, unit: i.unit, stock: Number(i.currentStock) })),
    moves.map((m) => ({ ingredientId: m.ingredientId, date: istDate(m.createdAt), qty: -Number(m.quantity) })),
    istDate(new Date(now.getTime() + DAY)),
  );
  const top = [...items].sort((a, b) => b.amountNow - a.amountNow).slice(0, 8);
  return { dailySales, insights, forecast, top, totals: { last28: dailySales.reduce((s, d) => s + d.amount, 0), bills: orders.length } };
}

export const aiAvailable = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

// One AI summary per outlet, language and day keeps cost predictable.
const cache = new Map<string, string>();

/** A short plain-language summary of the numbers, written by Claude. */
export async function aiSummary(restaurantId: string, restaurantName: string, language: "en" | "hinglish") {
  const key = `${restaurantId}:${language}:${istDate()}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const data = await loadInsights(restaurantId);
  const rupees = (p: number) => Math.round(p / 100);
  const facts = {
    restaurant: restaurantName,
    currency: "INR",
    dailySalesLast28Days: data.dailySales.map((d) => ({ date: d.date, sales: rupees(d.amount), bills: d.bills })),
    topItemsLast14Days: data.top.map((t) => ({ item: t.name, qty: t.qtyNow, qtyPrevious14Days: t.qtyBefore, sales: rupees(t.amountNow), foodCostPercent: t.foodCostPct })),
    computedInsights: data.insights.map((i) => `${i.title}. ${i.detail}`),
    stockToBuyTomorrow: data.forecast.filter((f) => f.toBuy > 0).map((f) => `${f.name}: ${f.toBuy} ${f.unit}`),
  };

  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 2000,
    output_config: { effort: "low" },
    // Re-runs on another model if this one declines, so the owner still gets a summary.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system:
      "You are a business advisor for an Indian restaurant owner. Using only the numbers provided, write a short summary: " +
      "how the business is doing, the 3 most useful actions for this week, and what to buy for tomorrow if anything. " +
      "Be specific, use ₹ amounts and dish names from the data, never invent numbers, and keep it under 180 words. " +
      "Use short bullet points. " +
      (language === "hinglish" ? "Write in simple Hinglish (Hindi in Roman script mixed with English), as a friendly CA would speak." : "Write in simple English."),
    messages: [{ role: "user", content: JSON.stringify(facts) }],
  });

  if (response.stop_reason === "refusal") throw new Error("The AI couldn't write a summary for this data.");
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("The AI returned an empty summary.");
  cache.set(key, text);
  return text;
}
