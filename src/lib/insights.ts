// Rule-based insights computed from sales and stock history. No external services involved.

export interface Insight {
  tone: "good" | "warn" | "bad" | "info";
  title: string;
  detail: string;
}

export interface ItemStat {
  name: string;
  qtyNow: number; // last 14 days
  qtyBefore: number; // the 14 days before that
  amountNow: number; // paise
  foodCostPct: number | null;
  isAvailable: boolean;
}

export interface InsightInput {
  dailySales: { date: string; amount: number; bills: number }[]; // last 28 days, oldest first, IST dates
  items: ItemStat[];
  hours: { hour: number; amount: number }[]; // last 28 days
  discountShare: number; // discounts as % of gross, last 28 days
  cancelledItems: number; // last 28 days
  ratings?: { name: string; average: number; count: number }[];
}

const pct = (a: number, b: number) => (b === 0 ? null : Math.round(((a - b) / b) * 1000) / 10);
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString("en-IN")}`;
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;

export function buildInsights(i: InsightInput): Insight[] {
  const out: Insight[] = [];
  const last7 = i.dailySales.slice(-7);
  const prev7 = i.dailySales.slice(-14, -7);
  const now = sum(last7.map((d) => d.amount));
  const before = sum(prev7.map((d) => d.amount));
  const change = pct(now, before);
  if (change !== null) {
    out.push({
      tone: change >= 5 ? "good" : change <= -5 ? "bad" : "info",
      title: `Sales ${change >= 0 ? "up" : "down"} ${Math.abs(change)}% this week`,
      detail: `${rupees(now)} in the last 7 days vs ${rupees(before)} the week before.`,
    });
  }

  const billsNow = sum(last7.map((d) => d.bills));
  if (billsNow > 0) {
    const billsBefore = sum(prev7.map((d) => d.bills));
    const avgNow = now / billsNow;
    const avgChange = billsBefore ? pct(avgNow, before / billsBefore) : null;
    if (avgChange !== null && Math.abs(avgChange) >= 8) {
      out.push({
        tone: avgChange > 0 ? "good" : "warn",
        title: `Average bill ${avgChange > 0 ? "up" : "down"} ${Math.abs(avgChange)}%`,
        detail: `Now ${rupees(avgNow)} per bill.${avgChange < 0 ? " Suggest add-ons, desserts or drinks while taking orders." : ""}`,
      });
    }
  }

  // Best day of week
  const byDow = new Map<number, number[]>();
  for (const d of i.dailySales) {
    const dow = new Date(`${d.date}T12:00:00+05:30`).getUTCDay();
    byDow.set(dow, [...(byDow.get(dow) ?? []), d.amount]);
  }
  const dowAvg = [...byDow].map(([dow, xs]) => ({ dow, avg: sum(xs) / xs.length })).filter((x) => x.avg > 0);
  if (dowAvg.length >= 5) {
    const best = dowAvg.reduce((a, b) => (b.avg > a.avg ? b : a));
    const worst = dowAvg.reduce((a, b) => (b.avg < a.avg ? b : a));
    const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    if (best.avg > worst.avg * 1.5) {
      out.push({
        tone: "info",
        title: `${names[best.dow]} is your busiest day, ${names[worst.dow]} the slowest`,
        detail: `Average ${rupees(best.avg)} vs ${rupees(worst.avg)}. A ${names[worst.dow]} offer could fill empty tables.`,
      });
    }
  }

  const peak = [...i.hours].sort((a, b) => b.amount - a.amount)[0];
  if (peak && peak.amount > 0) {
    out.push({ tone: "info", title: `Peak hour: ${hourLabel(peak.hour)}`, detail: "Keep your full kitchen and floor staff on shift around this time." });
  }

  const rising = i.items.filter((x) => x.qtyBefore >= 3 && x.qtyNow >= x.qtyBefore * 1.5).sort((a, b) => b.qtyNow - a.qtyNow)[0];
  if (rising) out.push({ tone: "good", title: `${rising.name} is trending`, detail: `${rising.qtyNow} sold in the last 2 weeks, up from ${rising.qtyBefore}. Feature it as a bestseller.` });

  // Only judge slow sellers once there are at least 3 weeks of sales to judge by.
  const firstSale = i.dailySales.findIndex((d) => d.amount > 0);
  const daysOfHistory = firstSale < 0 ? 0 : i.dailySales.length - firstSale;
  const slow = daysOfHistory >= 21 ? i.items.filter((x) => x.isAvailable && x.qtyNow + x.qtyBefore <= 2).map((x) => x.name) : [];
  if (slow.length) {
    out.push({
      tone: "warn",
      title: `${slow.length} dish${slow.length > 1 ? "es" : ""} hardly selling`,
      detail: `${slow.slice(0, 6).join(", ")}${slow.length > 6 ? "…" : ""}: 2 or fewer sold in 4 weeks. Consider removing or reworking them to simplify the kitchen.`,
    });
  }

  const costly = i.items.filter((x) => x.foodCostPct !== null && x.foodCostPct > 40 && x.qtyNow > 0).sort((a, b) => b.amountNow - a.amountNow);
  if (costly.length) {
    out.push({
      tone: "bad",
      title: `High food cost on ${costly.length} selling dish${costly.length > 1 ? "es" : ""}`,
      detail: `${costly
        .slice(0, 4)
        .map((x) => `${x.name} (${x.foodCostPct}%)`)
        .join(", ")}. Review portion size or price.`,
    });
  }

  const disliked = (i.ratings ?? []).filter((r) => r.count >= 5 && r.average < 3.5).sort((a, b) => a.average - b.average);
  if (disliked.length) {
    out.push({
      tone: "bad",
      title: `Customers rate ${disliked.length} dish${disliked.length > 1 ? "es" : ""} poorly`,
      detail: `${disliked
        .slice(0, 4)
        .map((r) => `${r.name} (${r.average.toFixed(1)}/5, ${r.count} ratings)`)
        .join(", ")}. Read the comments below and talk to the kitchen.`,
    });
  }

  if (i.discountShare >= 8) {
    out.push({ tone: "warn", title: `Discounts are ${i.discountShare}% of sales`, detail: "Check Reports → Audit log to see who is giving them and why." });
  }
  if (i.cancelledItems >= 10) {
    out.push({ tone: "warn", title: `${i.cancelledItems} items cancelled in 4 weeks`, detail: "Frequent cancellations can mean order-taking mistakes or kitchen delays." });
  }
  return out;
}

export interface ForecastRow {
  name: string;
  unit: string;
  stock: number;
  expected: number; // forecast use tomorrow
  toBuy: number;
}

/**
 * Tomorrow's ingredient need: average use on the same weekday over the last 4 weeks
 * (days with no use count as zero), plus a 20% buffer, minus what's in stock.
 */
export function forecastStock(
  ingredients: { id: string; name: string; unit: string; stock: number }[],
  usage: { ingredientId: string; date: string; qty: number }[], // daily usage, positive numbers
  tomorrow: string,
  buffer = 0.2,
): ForecastRow[] {
  const sameDays = [7, 14, 21, 28].map((n) => {
    const d = new Date(`${tomorrow}T12:00:00+05:30`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  });
  return ingredients
    .map((ing) => {
      const qty = sameDays.map((day) => sum(usage.filter((u) => u.ingredientId === ing.id && u.date === day).map((u) => u.qty)));
      const expected = Math.round((sum(qty) / sameDays.length) * 1000) / 1000;
      const toBuy = Math.max(0, Math.round((expected * (1 + buffer) - Math.max(0, ing.stock)) * 1000) / 1000);
      return { name: ing.name, unit: ing.unit, stock: ing.stock, expected, toBuy };
    })
    .filter((r) => r.expected > 0)
    .sort((a, b) => b.toBuy - a.toBuy);
}
